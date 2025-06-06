import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { SelectionMap, Selection, Position, Range } from './teletype-types';
import { TeletypeClient, EditorProxy, BufferProxy, FollowState, Portal, IPortalDelegate } from '@atom/teletype-client';
// import BufferBinding from './buffer-binding';
// import EditorBinding from './editor-binding';
import { getPortalURI } from './uri-helpers';
import NotificationManager from './notification-manager';
import WorkspaceManager from './workspace-manager';
import { PortalBinding } from './portal-binding';


export default class HostPortalBinding extends PortalBinding {
    public readonly workspace: vscode.WorkspaceFolder;
    notificationManager: NotificationManager;
    uri: string | undefined;
    closeDocumentEventListener?: vscode.Disposable;
    changeActiveEditorEventListener?: vscode.Disposable;
    openDocumentEventListener?: vscode.Disposable;
    // sitePositionsComponent: SitePositionsComponent | undefined;

    constructor(client: TeletypeClient, workspace: vscode.WorkspaceFolder, notificationManager: NotificationManager, workspaceManager: WorkspaceManager, didDispose: () => any) {
        super(client, workspaceManager, notificationManager, didDispose);

        this.workspace = workspace;
        this.notificationManager = notificationManager;
    }

    // // @override
    // hostDidLoseConnection(): void {
    //   this.emitter.emit('did-change', {type: 'close-portal'});
    // }

    // // @override
    // hostDidClosePortal(): void {
    //   this.emitter.emit('did-change', {type: 'close-portal'});
    // }

    // // @override
    // didChangeEditorProxies(): void {
    // }

    async initializeAsync(): Promise<boolean> {
        try {
            const portal = await this.client.createPortal();
            if (!portal) { return false; }

            await this.setPortalAsync(portal);

            if (!this.portal) { return false; }

            this.uri = getPortalURI(this.portal?.id);
            // this.sitePositionsComponent = new SitePositionsComponent({portal: this.portal, workspace: this.workspace});
            this.notificationManager?.addInfo(`Create Portal with ID ${this.uri}`);
            vscode.env.clipboard.writeText(this.uri);

            // this.disposables.add(
            //   this.workspace.observeTextEditors(this.didAddTextEditor.bind(this)),
            //   this.workspace.observeActiveTextEditor(this.didChangeActiveTextEditor.bind(this))
            // );

            vscode.commands.executeCommand('setContext', 'teletype.status.isShared', true);

            this.changeActiveEditorEventListener = vscode.window.onDidChangeActiveTextEditor(this.didChangeActiveTextEditor.bind(this));
            this.openDocumentEventListener = vscode.workspace.onDidOpenTextDocument(this.didOpenTextDocument.bind(this));
            // this.closeDocumentEventListener = vscode.workspace.onDidCloseTextDocument(this.didCloseTextDocument.bind(this));

            // 이미 열려 있는 문서들을 기본 등록한다. (단, VSCode가 한번도 활성화 된 적 없는 문서들은 목록에서 제외시켜 버린다.)
            vscode.workspace.textDocuments.forEach(async (document) => {
                if (document.uri.scheme === 'file' && this.isWorkspaceFiles(document.uri.fsPath)) {
                    const bufferBinding = this.workspaceManager.findOrCreateBufferBindingForBuffer(document, this.portal);
                    // this.portal?.activateEditorProxy(editorBinding?.editorProxy);
                    // this.sitePositionsComponent.show(editor.element);
                    // this.workspaceManager.addHostTextDocument(document);
                }
            });
            this.workspaceManager.applyShowingEditorsAsync(vscode.window.visibleTextEditors);
            this.workspaceManager.setActiveEditor(vscode.window.activeTextEditor);

            // this.workspace.getElement().classList.add('teletype-Host');
            return true;
        } catch (error) {
            this.notificationManager.addError('Failed to share portal', {
                description: `Attempting to share a portal failed with error: <code>${(error as Error).message}</code>`,
                dismissable: true
            });
            return false;
        }
    }

    // @override
    dispose() {
        vscode.commands.executeCommand('setContext', 'teletype.status.isShared', false);

        this.emitter.emit('did-change', { type: 'close-portal' });

        this.closeDocumentEventListener?.dispose();
        this.changeActiveEditorEventListener?.dispose();
        this.openDocumentEventListener?.dispose();

        super.dispose();
    }

    // @override
    siteDidJoin (siteId: number) {
        //   const site = this.portal?.getSiteIdentity(siteId);
        //   this.notificationManager.addInfo(`@${site?.login} has joined your portal`);
        //   this.emitter.emit('did-change', {type: 'join-portal', portal: this.portal});
        super.siteDidJoin(siteId);
    }

    // @override
    siteDidLeave(siteId: number) {
        //const editorProxy = this.portal?.getLocalActiveEditorProxy();
        //editorProxy?.hideSelections();
        super.siteDidLeave(siteId);
        // const site = this.portal?.getSiteIdentity(siteId);
        // this.notificationManager.addInfo(`@${site?.login} has left your portal`);
        // this.emitter.emit('did-change', {type: 'leave-portal', portal: this.portal});
    }

    isWorkspaceFiles(fsPath: string): boolean {
        return WorkspaceManager.isWorkspaceFiles(this.workspace, fsPath);
    }

    // @override
    async updateTether(followState: number, editorProxy: EditorProxy, position: Position) {
        // if (followState === FollowState.RETRACTED) {
        //     const editorBinding = this.workspaceManager.getEditorBindingByEditorProxy(editorProxy);
        //     // await vscode.workspace.openTextDocument(editorBinding?.editor, {searchAllPanes: true});
        //     if (position) {
        //         editorBinding?.updateTether(followState, position);
        //     }
        // } else {
        //     if (position) {
        //         this.workspaceManager.getEditorBindings().forEach(editorBinding => {
        //             editorBinding.updateTether(followState, position);
        //         });
        //     }
        // }
        await super.updateTether(followState, editorProxy, position);
    }

    private didOpenTextDocument(document: vscode.TextDocument) {
        if (document.uri.scheme === 'file' && this.isWorkspaceFiles(document.uri.fsPath)) {
            const bufferBinding = this.workspaceManager.findOrCreateBufferBindingForBuffer(document, this.portal);
            // this.portal?.activateEditorProxy(editorBinding?.editorProxy);
            // this.sitePositionsComponent.show(editor.element);
            // this.workspaceManager.addHostTextDocument(document);
        }
    }

    private didChangeActiveTextEditor(editor?: vscode.TextEditor) {
        let editorProxy: EditorProxy | undefined = undefined;

        if (editor) {
            const doc = editor.document;

            if (doc.uri.scheme === 'file' && this.isWorkspaceFiles(doc.uri.fsPath)) {
                const bufferBinding = this.workspaceManager.findOrCreateBufferBindingForBuffer(doc, this.portal);
                if (bufferBinding?.bufferProxy.isHost) {
                    //const editorProxy = await this.workspaceManager.findOrCreateEditorProxyForEditor(editor, this.portal);
                    //const editorBinding = this.workspaceManager.getEditorBindingByEditor(editor);
                    const editorBinding = this.workspaceManager.getEditorBindingByEditor(editor);

                    // const editorBinding = this.workspaceManager.findOrCreateEditorBindingForEditor(editor, this.portal);
                    // if (editorBinding?.editorProxy !== this.portal?.activateEditorProxy) {
                    editorProxy = editorBinding?.editorProxy;
                    // this.sitePositionsComponent.show(editor.element);
                    // }
                }
            }
        }

        this.portal?.activateEditorProxy(editorProxy);
        // this.sitePositionsComponent.hide();
    }
}
