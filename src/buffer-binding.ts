import * as vscode from 'vscode';
import * as converter from './teletype-converter';
import * as fs from 'fs';
//import * as path from 'path';
import { EventEmitter } from 'events';
import { Position } from './teletype-types';
import { BufferProxy, Checkpoint, IBufferDelegate, Portal } from '@atom/teletype-client';
import getPathWithNativeSeparators from './get-path-with-native-separators';
import { TextEncoder } from 'util';

function doNothing() { }

export interface IBufferProxyExt {
    setBufferBinding(bufferBinding: BufferBinding): void;
    getBufferBinding(): BufferBinding;
}

export default class BufferBinding extends vscode.Disposable implements IBufferDelegate {
    // public title: string | undefined;
    public bufferProxy!: BufferProxy;
    public portal!: Portal;
    public buffer?: vscode.TextDocument;
    public filePath?: string;
    public fsFullPathUri?: vscode.Uri;
    disposed: boolean;
    disableHistory: boolean;
    // subscriptions: Disposable;
    bufferDestroySubscription: any;
    remoteFile?: RemoteFile;
    bufferUpdateState: number = 0;
    private fs!: vscode.FileSystemProvider;
    private emitter: EventEmitter;
    private didBeforeDispose: ((bufferBinding: BufferBinding) => void) | undefined;
    private pendingUpdates: any[];
    private pendingChangeEvents: vscode.TextDocumentContentChangeEvent[];

    constructor(fs: vscode.FileSystemProvider, filePath: string | undefined, bufferProxy: BufferProxy, portal: Portal, buffer: vscode.TextDocument | undefined, didDispose: () => any = doNothing, didBeforeDispose?: (bufferBinding: BufferBinding) => void) {
        super(didDispose);
        this.didBeforeDispose = didBeforeDispose;

        this.fs = fs;
        this.filePath = filePath;

        this.portal = portal;
        // this.title = title ?? uri;
        this.disposed = false;
        this.disableHistory = false;
        this.pendingChangeEvents = [];
        this.pendingUpdates = [];

        this.emitter = new EventEmitter();

        this.setBuffer(buffer);
        this.setBufferProxy(bufferProxy);
    }

    // @override
    dispose() {
        if (!this.disposed) {
            if (this.didBeforeDispose) {
                this.didBeforeDispose(this);
            }

            this.unbinding(this.bufferProxy.isHost);

            // this.subscriptions.dispose();
            // if (this.buffer) {
            //  this.buffer.restoreDefaultHistoryProvider(this.bufferProxy.getHistory(this.buffer.maxUndoEntries));
            //  this.buffer = undefined;
            // }
            if (this.bufferDestroySubscription) { this.bufferDestroySubscription.dispose(); }
            if (this.remoteFile) { this.remoteFile.dispose(); }
            this.emitter.removeAllListeners();

            this.disposed = true;
        }

        super.dispose();
    }

    isBinded(): boolean {
        return this.buffer !== undefined;
    }

    unbinding(isHost: boolean) {
        if (!isHost && this.fsFullPathUri) {
            // fs.unlinkSync(this.fsFullPath);

            const we = new vscode.WorkspaceEdit();
            we.deleteFile(this.fsFullPathUri);
            vscode.workspace.applyEdit(we);
        }
        this.buffer = undefined;
    }

    setBuffer(buffer: vscode.TextDocument | undefined) {
        this.buffer = buffer;
        if (buffer) {
            this.monkeyPatchBufferMethods(buffer);
        }
    }

    setBufferProxy(bufferProxy: BufferProxy) {
        this.bufferProxy = bufferProxy;
        if (!bufferProxy) { return; }

        // VSCode의 TextDocument는 History 기능이 없다.
        // this.buffer?.setHistoryProvider(this);

        while (this.pendingChangeEvents.length > 0) {
            this.pushChangeEvent(this.pendingChangeEvents.shift());
        }
        if (!this.bufferProxy.isHost) {
            this.remoteFile = new RemoteFile(bufferProxy.uri);
            // this.buffer?.setFile(this.remoteFile);
        }

        if (bufferProxy.isHost) {
            // this.subscriptions.add(buffer.onDidChangePath(this.relayURIChange.bind(this)));
        }

        // this.bufferDestroySubscription = this.buffer?.onDidDestroy(() => {
        //   if (this.isHost) {
        //     bufferProxy.dispose();
        //   } else {
        //     this.dispose();
        //   }
        // });
    }

    private monkeyPatchBufferMethods(buffer: vscode.TextDocument) {
        // VSCode의 TextDocument는 extensible하지 않기 때문에 monkey patch가 안 된다.

    }

    // @override
    setText(text: string): void {
        this.disableHistory = true;
        // VSCode의 경우, TextDocument의 초기 문자열을 이벤트 없이 변경할 수가 없다. 그래서 아예 파일을 직접 수정해야 한다.
        // this.buffer?.setTextInRange(this.buffer?.getRange(), text);
        if (this.fsFullPathUri) {
            this.fs.writeFile(this.fsFullPathUri, new TextEncoder().encode(text), { create: true, overwrite: true });
        }
        this.disableHistory = false;
    }

    // 아직 bufferProxy가 지정되기 전이라면 잠시 버퍼에 쌓아둔다.
    pushChangeEvent(change: vscode.TextDocumentContentChangeEvent | undefined) {
        if (this.disableHistory) { return; }
        if (!change) { return; }

        if (this.bufferProxy) {
            this.bufferProxy.setTextInRange(
                { row: change.range.start.line, column: change.range.start.character },
                { row: change.range.end.line, column: change.range.end.character },
                change.text
            );
        } else {
            this.pendingChangeEvents.push(change);
        }
    }

    // pushChangesEvent(changes: vscode.TextDocumentContentChangeEvent[]) {
    //     if (this.disableHistory) { return; }

    //     for (let i = changes.length - 1; i >= 0; i--) {
    //         this.pushChangeEvent(changes[i]);
    //     }
    // }

    public existsPendingUpdate() : Boolean {
        return this.pendingUpdates?.length > 0;
    }

    public async applyUpdateAsync(editor: vscode.TextEditor) {
        if (this.pendingUpdates.length <= 0) {
            return;
        }

        this.bufferUpdateState = 1;
        this.disableHistory = true;
        for (const textUpdate of this.pendingUpdates) {
            await editor.edit(builder => {
                builder.replace(this.createRange(textUpdate.oldStart, textUpdate.oldEnd), textUpdate.newText);
            }); //}, {undoStopBefore: true, undoStopAfter: true});
        }
        this.disableHistory = false;
        this.bufferUpdateState = 2;

        this.pendingUpdates = [];
    }

    // @override
    async updateText(textUpdates: any[]) {
        if (!textUpdates || textUpdates.length <= 0) { return; }
        console.log(textUpdates);

        if (!this.buffer) { return; }
        if (this.buffer.isClosed) { return; }

        try {
            textUpdates.forEach(textUpdate => {
                // VSCode의 경우엔 TextDocument의 History 기능이 없다.
                // this.bufferHistory.push(textUpdate.oldStart, textUpdate.oldEnd, textUpdate.newText);

                // VSCode의 경우, 정책적으로 눈에 보이지 않는 곳에서 에디터의 내용을 변경하지 못 하도록 되어 있다.
                // 때문에 문자열의 변경을 일단 버퍼에 쌓아두고, 에디터 편집이 가능할 때까지 적용을 지연시킨다.
                this.pendingUpdates.push({ oldStart: textUpdate.oldStart, oldEnd: textUpdate.oldEnd, newText: textUpdate.newText });
            });
            this.emitter.emit('require-update', this);
        } catch (e) {
            console.log(e);
        }
    }

    onRequireUpdate(callback: (bufferBinding: BufferBinding) => void) {
        this.emitter.on('require-update', callback);
    }

    undo() {
        const result = this.bufferProxy.undo();
        if (result) {
            this.convertMarkerRanges(result.markers);
            return result;
        } else {
            return null;
        }
    }

    redo() {
        const result = this.bufferProxy.redo();
        if (result) {
            this.convertMarkerRanges(result.markers);
            return result;
        } else {
            return null;
        }
    }

    createPosition(pos: Position): vscode.Position {
        return new vscode.Position(pos.row, pos.column);
    }

    createRange(start: Position, end: Position): vscode.Range {
        return new vscode.Range(
            new vscode.Position(start.row, start.column),
            new vscode.Position(end.row, end.column)
        );
    }

    convertMarkerRanges(layersById: any[]) {
        for (const layerId in layersById) {
            const markersById = layersById[layerId];
            for (const markerId in markersById) {
                const marker = markersById[markerId];
                marker.range = converter.convertToVSCodeRange(marker.range);
            }
        }
    }

    getChangesSinceCheckpoint(checkpoint: Checkpoint) {
        return this.bufferProxy.getChangesSinceCheckpoint(checkpoint);
    }

    createCheckpoint(options: any[]): Checkpoint | null {
        if (this.disableHistory) { return null; }

        return this.bufferProxy.createCheckpoint(options);
    }

    groupChangesSinceCheckpoint(checkpoint: any, options: any[]) {
        if (this.disableHistory) { return; }

        return this.bufferProxy.groupChangesSinceCheckpoint(checkpoint, options);
    }

    revertToCheckpoint(checkpoint: any, options: any[]) {
        if (this.disableHistory) { return; }

        const result = this.bufferProxy.revertToCheckpoint(checkpoint, options);
        if (result) {
            this.convertMarkerRanges(result.markers);
            return result;
        } else {
            return false;
        }
    }

    groupLastChanges() {
        if (this.disableHistory) { return; }

        return this.bufferProxy.groupLastChanges();
    }

    applyGroupingInterval(groupingInterval: number) {
        if (this.disableHistory) { return; }

        this.bufferProxy.applyGroupingInterval(groupingInterval);
    }

    enforceUndoStackSizeLimit() { }

    // @override
    save(): void {
        // 수신이 완료됨
        //if (this.buffer?.uri) { 
        //  this.buffer.save();
        //}
        this.emitter.emit('did-save', this);
    }

    relayURIChange() {
        this.bufferProxy.setURI(this.getBufferProxyURI());
    }

    // @override
    didChangeURI(uri: string): void {
        if (this.remoteFile) { 
            this.remoteFile.setURI(uri); 
        }
    }

    getBufferProxyURI() {
        return this.bufferProxy.uri;
        // return this.title ?? 'untitled';
        // if (!this.buffer.uri.fsPath) { return 'untitled'; }
        // const [projectPath, relativePath] = atom.workspace.project.relativizePath(this.buffer.uri.fsPath);
        // if (projectPath) {
        //   const projectName = path.basename(projectPath);
        //   return path.join(projectName, relativePath);
        // } else {
        //   return relativePath;
        // }
        // return this.buffer.uri.toString();
        // return path.basename(this.buffer.fileName);
    }

    serialize(options: any[]) {
        // return this.serializeUsingDefaultHistoryProviderFormat(options);
        return null;
    }

    // serializeUsingDefaultHistoryProviderFormat (options: any[]) {
    //   const {maxUndoEntries} = this.buffer;
    //   this.buffer.restoreDefaultHistoryProvider(this.bufferProxy.getHistory(maxUndoEntries));
    //   const serializedDefaultHistoryProvider = this.buffer.historyProvider.serialize(options);

    //   this.buffer.setHistoryProvider(this);

    //   return serializedDefaultHistoryProvider;
    // }

    changeBuffer(changes: ReadonlyArray<vscode.TextDocumentContentChangeEvent>) {
        if (!changes) { return; }

        changes.forEach(change => {
            const { start, end } = change.range;

            this.bufferProxy.setTextInRange(
                { row: start.line, column: start.character },
                { row: end.line, column: end.character },
                change.text
            );
        });

    }

    //requestSavePromise(): Promise<vscode.TextEditor[]> {
    async requestSaveAsnyc() {
        return this.bufferProxy.requestSave();
    }

    // bufferProxy를 monkey patch 한다.
    public bufferProxyMonkeyPatch(): void {
        (this.bufferProxy as any).setBufferBinding = (bufferBinding: BufferBinding) => {
            (this.bufferProxy as any).bufferBinding = bufferBinding;
        };
        (this.bufferProxy as any).getBufferBinding = (): BufferBinding => {
            return (this.bufferProxy as any).bufferBinding;
        };
    }
}

class RemoteFile {
    public uri: string;
    private emitter: EventEmitter | null;

    constructor(uri: string) {
        this.uri = uri;
        this.emitter = new EventEmitter();
    }

    dispose() {
        this.emitter?.removeAllListeners();
        this.emitter = null;
    }

    getPath(): string {
        return getPathWithNativeSeparators(this.uri);
    }

    setURI(uri: string) {
        this.uri = uri;
        this.emitter?.emit('did-rename');
    }

    onDidRename(callback: (...args: any[]) => void) {
        return this.emitter?.on('did-rename', callback);
    }

    existsSync() {
        return false;
    }
}

// host에서는 에디터가 열리면서 생성하기에 TextDocument가 있지만, guest에서 리모트로 생성할 때는 TextDocument가 undefined인 상태이다.
export function createBufferBinding(fs: vscode.FileSystemProvider, filePath: string | undefined, bufferProxy: BufferProxy, portal: Portal, buffer: vscode.TextDocument | undefined, fsPath?: vscode.Uri, didRquireUpdate?: (bufferBinding: BufferBinding) => void, didDispose?: () => void, didBeforeDispose?: (bufferBinding: BufferBinding) => void): BufferBinding {
    const bufferBinding = new BufferBinding(fs, filePath, bufferProxy, portal, buffer, didDispose, didBeforeDispose);

    if (didRquireUpdate) {
        bufferBinding.onRequireUpdate(didRquireUpdate);
    }

    bufferBinding.fsFullPathUri = fsPath ?? buffer?.uri;

    // delegate 지정 순간 setText()가 호출되기에 vscode.TextDocument의 이벤트 발생을 막기 위해서는 buffer 지정을 이 이후로 미뤄야 한다.
    bufferProxy.setDelegate(bufferBinding);

    // bufferProxy를 monkey patch 한다.
    bufferBinding.bufferProxyMonkeyPatch();
    // (bufferProxy as any).setBufferBinding = (bufferBinding: BufferBinding) => {
    //   (bufferProxy as any).bufferBinding = bufferBinding;
    // };
    // (bufferProxy as any).getBufferBinding = () : BufferBinding => {
    //   return (bufferProxy as any).bufferBinding;
    // };

    (bufferProxy as unknown as IBufferProxyExt).setBufferBinding(bufferBinding);

    return bufferBinding;
}
