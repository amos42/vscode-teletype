import * as vscode from 'vscode';
import {EventEmitter} from 'events';
import { SelectionMap, Selection, Position, Range} from './teletype-types';
import {BufferProxy, EditorProxy, Errors, FollowState, TeletypeClient, Portal, IPortalDelegate, EditorProxyMetadata} from '@atom/teletype-client';
import BufferBinding from './buffer-binding';
import EditorBinding from './editor-binding';
import getPathWithNativeSeparators from './get-path-with-native-separators';
import {getEditorURI} from './uri-helpers';
import NotificationManager from './notification-manager';
import WorkspaceManager from './workspace-manager';
import { IPortalBinding, PortalBinding } from './portal-binding';

const NOOP = () => {};

export default class GuestPortalBinding extends PortalBinding implements IPortalDelegate {
  client: TeletypeClient;
  portalId: string;
  // public readonly workspace: vscode.WorkspaceFolder;
  notificationManager: NotificationManager;
  lastActivePaneItem: null;
  shouldRelayActiveEditorChanges: boolean;
  // sitePositionsComponent: SitePositionsComponent;
  // public newActivePaneItem: any;

  constructor (client: TeletypeClient, portalId: string, notificationManager: NotificationManager, workspaceManager: WorkspaceManager, didDispose: Function) {
    super(workspaceManager, client, didDispose);

    this.client = client;
    this.portalId = portalId;
    // this.workspace = workspace;
    this.notificationManager = notificationManager;
    this.lastActivePaneItem = null;
    // this.workspaceManager = workspaceManager;
    this.shouldRelayActiveEditorChanges = true;
  }

  async initialize () : Promise<boolean> {
    try {
      this.portal = await this.client.joinPortal(this.portalId);
      if (!this.portal) { return false; }

      // this.sitePositionsComponent = new SitePositionsComponent({portal: this.portal, workspace: this.workspace});
      // this.subscriptions.add(this.workspace.onDidChangeActivePaneItem(this.didChangeActivePaneItem.bind(this)));

      await this.portal.setDelegate(this);
			//vscode.window.showInformationMessage('Joined Portal with ID' + ' ' + this.portalId + ' ');
			// this.registerWorkspaceEvents();

      this.notificationManager.addInfo(`Joined Portal with ID ${this.portalId}`, {
        description: '',
        dismissable: true
      });
  
      return true;
    } catch (error) {
      this.didFailToJoin(error as Error);
      return false;
    }
  }

  // @override
  dispose () {
  // this.subscriptions.dispose();
  // this.sitePositionsComponent.destroy();
    super.dispose();
  }

  // @override
  siteDidJoin (siteId: number) {
    const hostLogin = this.portal?.getSiteIdentity(1);
    const siteLogin = this.portal?.getSiteIdentity(siteId);
    this.notificationManager.addInfo(`@${siteLogin?.login} has joined @${hostLogin?.login}'s portal`);
    this.emitter.emit('did-change');
    vscode.window.showInformationMessage('Joined Portal with ID' + ' ' + this.portalId + ' ');
  }

  // @override
  siteDidLeave (siteId: number) {
    const hostLogin = this.portal?.getSiteIdentity(1);
    const siteLogin = this.portal?.getSiteIdentity(siteId);
    this.notificationManager.addInfo(`@${siteLogin?.login} has left @${hostLogin?.login}'s portal`);
    this.emitter.emit('did-change');
    vscode.window.showInformationMessage('Leaved Portal with ID' + ' ' + this.portalId + ' ');
  }

  didChangeEditorProxies () {}

  getRemoteEditors (): any[] | null {
    if (!this.portal) { return null; }

    const hostIdentity = this.portal?.getSiteIdentity(1);
    const bufferProxyIds = new Set();
    const remoteEditors = [];
    const editorProxiesMetadata = this.portal?.getEditorProxiesMetadata();

    if(editorProxiesMetadata){
      for (let i = 0; i < editorProxiesMetadata.length; i++) {
        const {id, bufferProxyId, bufferProxyURI} = editorProxiesMetadata[i];
        if (bufferProxyIds.has(bufferProxyId)) { continue; }

        remoteEditors.push({
          hostGitHubUsername: hostIdentity.login,
          uri: getEditorURI(this.portal.id, id),
          path: getPathWithNativeSeparators(bufferProxyURI)
        });
        bufferProxyIds.add(bufferProxyId);
      }
    }

    return remoteEditors;
  }

  // async getRemoteEditor (editorProxyId: number) : Promise<vscode.TextEditor | undefined> {
  //   const editorProxy = await this.portal?.findOrFetchEditorProxy(editorProxyId);
  //   if (this.portal && editorProxy) {
  //     return this.workspaceManager.findOrCreateEditorForEditorProxy(editorProxy, this.portal);
  //   } else {
  //     return undefined;
  //   }
  // }

  // @override
  async _updateTether (followState: number, editorProxy: EditorProxy, position: Position) {
    if (followState === FollowState.RETRACTED) {
      this.shouldRelayActiveEditorChanges = false;
      const editor = await this.workspaceManager.findOrCreateEditorForEditorProxy(editorProxy, this.portal);
      if (editor) {
        // await this.openPaneItem(editor);
        vscode.window.showTextDocument(editor.document);
      }
      this.shouldRelayActiveEditorChanges = true;
    } else {
      if (position) { 
        this.workspaceManager.getEditorBindings().forEach(editorBinding => {
          editorBinding.updateTether(followState, position);
        }); 
      }
    }

    const editorBinding = this.workspaceManager.getEditorBindingByEditorProxy(editorProxy);
    if (editorBinding && position) {
      editorBinding.updateTether(followState, position);
    }
  }

  activate () {
    // const paneItem = this.lastActivePaneItem;
    // const pane = this.workspace.paneForItem(paneItem);
    // if (pane && paneItem) {
    //   pane.activateItem(paneItem);
    //   pane.activate();
    // }
    this.emitter.emit('did-change');
  }

  didFailToJoin (error: Error) {
    let message, description;
    if (error instanceof Errors.PortalNotFoundError) {
      message = 'Portal not found';
      description =
        'The portal you were trying to join does not exist. ' +
        'Please ask your host to provide you with their current portal URL.';
    } else {
      message = 'Failed to join portal';
      description =
        `Attempting to join portal failed with error: <code>${error.message}</code>\n\n` +
        'Please wait a few moments and try again.';
    }
    this.notificationManager.addError(message, {
      description,
      dismissable: true
    });
  }

  // @override
  hostDidClosePortal () {
    this.notificationManager.addInfo('Portal closed', {
      description: 'Your host stopped sharing their editor.',
      dismissable: true
    });
  }

  // @override
  hostDidLoseConnection () {
    this.notificationManager.addInfo('Portal closed', {
      description: (
        'We haven\'t heard from the host in a while.\n' +
        'Once your host is back online, they can share a new portal with you to resume collaborating.'
      ),
      dismissable: true
    });
  }

  public leave () {
    this.close();
  }

  // async openPaneItem (newActivePaneItem) {
  //   this.newActivePaneItem = newActivePaneItem;
  //   await this.workspace.open(newActivePaneItem, {searchAllPanes: true});
  //   this.lastActivePaneItem = this.newActivePaneItem;
  //   this.newActivePaneItem = null;
  // }

  // didChangeActivePaneItem (paneItem) {
  //   const editorProxy = this.editorProxiesByEditor.get(paneItem);

  //   if (editorProxy) {
  //     this.sitePositionsComponent.show(paneItem.element);
  //   } else {
  //     this.sitePositionsComponent.hide();
  //   }

  //   if (this.shouldRelayActiveEditorChanges) {
  //     this.portal.activateEditorProxy(editorProxy);
  //   }
  // }

  hasPaneItem(paneItem: vscode.TextEditor) : boolean {
    return this.workspaceManager.hasPaneItem(paneItem);
  }

  // getActivePaneItem() : vscode.TextEditor {
  //   return this.workspaceManager.newActivePaneItem || vscode.window.activeTextEditor;
  // }

}
