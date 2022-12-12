import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import HostPortalBinding from './host-portal-binding';
import GuestPortalBinding from './guest-portal-binding';
import { TeletypeClient } from '@atom/teletype-client';
import { findPortalId } from './portal-id-helpers';
import WorkspaceManager from './workspace-manager';
import NotificationManager from './notification-manager';

export default class PortalBindingManager {
  private emitter: EventEmitter;
  public client: TeletypeClient;
  public workspace!: vscode.WorkspaceFolder | null;
  public notificationManager: NotificationManager;
  public workspaceManager: WorkspaceManager;
  // private hostPortalBindingPromise: Promise<HostPortalBinding | undefined> | undefined;
  private hostPortalBinding: HostPortalBinding | undefined;
  private promisesByGuestPortalId: Map<string, Promise<GuestPortalBinding>>;

  constructor (client: TeletypeClient, workspace: vscode.WorkspaceFolder | null, notificationManager: NotificationManager, workspaceManager: WorkspaceManager) {
    this.emitter = new EventEmitter();
    this.client = client;
    if (workspace) {
      this.workspace = workspace;
    }
    this.notificationManager = notificationManager;
    // this.hostPortalBindingPromise = undefined;
    this.workspaceManager = workspaceManager;
    this.promisesByGuestPortalId = new Map();
  }

  async dispose () {
    const disposePromises: Promise<any>[] = [];

    // if (this.hostPortalBindingPromise) {
    //   const disposePromise = this.hostPortalBindingPromise.then((portalBinding) => {
    //     portalBinding?.closePortal();
    //   });
    //   disposePromises.push(disposePromise);
    // }
    await this.hostPortalBinding?.closePortal();

    this.promisesByGuestPortalId.forEach(async (portalBindingPromise: Promise<GuestPortalBinding>) => {
      const disposePromise = portalBindingPromise.then((portalBinding) => {
        if (portalBinding) { portalBinding.leave(); }
      });
      disposePromises.push(disposePromise);
    });

    return Promise.all(disposePromises);
  }

  // async createHostPortalBinding () : Promise<HostPortalBinding | undefined> {
  //   if (!this.hostPortalBindingPromise) {
  //     this.hostPortalBindingPromise = this._createHostPortalBinding();
  //     if(this.hostPortalBindingPromise) {
  //       this.hostPortalBindingPromise.then((binding) => {
  //         if (!binding) { this.hostPortalBindingPromise = undefined; }
  //       });
  //     }
  //   }

  //   return this.hostPortalBindingPromise;
  // }

  async createHostPortalBinding () : Promise<HostPortalBinding | undefined> {
    if (!this.hostPortalBinding) {
      this.hostPortalBinding = await this._createHostPortalBinding();
    }

    return this.hostPortalBinding;
  }

  async _createHostPortalBinding () : Promise<HostPortalBinding | undefined> {
    if (this.workspace) {
      const portalBinding = new HostPortalBinding(this.client, this.workspace, this.notificationManager, this.workspaceManager,
        () => { this.didDisposeHostPortalBinding(); }
      );

      if (await portalBinding.initialize()) {
        portalBinding.onDidChange((event) => {
          this.emitter.emit('did-change', event);        
        });
        this.emitter.emit('did-change', {type: 'share-portal', uri: portalBinding?.uri, portal: portalBinding?.portal});
      } else {
        this.notificationManager?.addError(`Create Portal failed`);        
      }
      
      return portalBinding;
    } else {
      this.notificationManager?.addError('no workspace');
    }
    return undefined;
  }

  // getHostPortalBinding (): Promise<HostPortalBinding | undefined> {
  //   return this.hostPortalBindingPromise ?? Promise.resolve(undefined);
  // }

  getHostPortalBinding (): HostPortalBinding | undefined {
    // return this.hostPortalBindingPromise ?? Promise.resolve(undefined);
    return this.hostPortalBinding;
  }

  didDisposeHostPortalBinding () {
    // this.hostPortalBindingPromise = undefined;
    this.hostPortalBinding = undefined;
    this.emitter.emit('did-change', {type: 'close-portal'});
  }

  createGuestPortalBinding (portalId: string) {
    let promise = this.promisesByGuestPortalId.get(portalId);
    if (promise) {
      promise.then((binding) => {
        if (binding) { binding.activate(); }
      });
    } else {
      promise = this._createGuestPortalBinding(portalId);
      promise.then((binding) => {
        const newLocal = this;
        if (!binding) { newLocal.promisesByGuestPortalId.delete(portalId); }
      });
      this.promisesByGuestPortalId.set(portalId, promise);
    }

    return promise;
  }

  async _createGuestPortalBinding (portalId: string) : Promise<GuestPortalBinding> {
    const portalBinding = new GuestPortalBinding(
        this.client, portalId, this.notificationManager, this.workspaceManager,
        () => { 
          this.didDisposeGuestPortalBinding(portalBinding); 
        }
    );

    if (await portalBinding.initialize()) {
      // this.workspace.getElement().classList.add('teletype-Guest');
      portalBinding.onDidChange((event) => {
        this.emitter.emit('did-change', event);
      });
      this.emitter.emit('did-change', {type: 'join-portal', portal: portalBinding?.portal});
    } else {
      portalBinding.dispose();
    }

    return portalBinding;
  }

  async getGuestPortalBindings (): Promise<GuestPortalBinding[]> {
    const portalBindings = await Promise.all(this.promisesByGuestPortalId.values());
    return portalBindings.filter((binding) => binding);
  }

  async getRemoteEditors () : Promise<any[] | null> {
    const remoteEditors = [];
    for (const bindingPromise of this.promisesByGuestPortalId.values()) {
      const portalBinding = await bindingPromise;
      const editors = portalBinding.getRemoteEditors();
      if (editors) {
        remoteEditors.push(...editors);
      }
    }

    return remoteEditors;
  }

  async getActiveGuestPortalBinding () : Promise<GuestPortalBinding | undefined> {
    const activePaneItem = vscode.window.activeTextEditor;
    if (activePaneItem) {
      for (const [_, portalBindingPromise] of this.promisesByGuestPortalId) { // eslint-disable-line no-unused-vars
        const portalBinding = await portalBindingPromise;
        if (portalBinding?.hasPaneItem(activePaneItem)) {
          return portalBinding;
        }
      }
    }
    return undefined;
  }

  async hasActivePortals () {
    const hostPortalBinding = await this.getHostPortalBinding();
    const guestPortalBindings = await this.getGuestPortalBindings();

    return (hostPortalBinding) || (guestPortalBindings.length > 0);
  }

  // async getRemoteEditorForURI (uri: string) : Promise<vscode.TextEditor | undefined> {
  //   const uriComponents = uri.replace('atom://teletype/', '').split('/');

  //   const portalId = findPortalId(uriComponents[1]);
  //   if (uriComponents[0] !== 'portal' || !portalId) { return undefined; }

  //   const editorProxyId = Number(uriComponents[3]);
  //   if (uriComponents[2] !== 'editor' || Number.isNaN(editorProxyId)) { return undefined; }

  //   const guestPortalBindingPromise = this.promisesByGuestPortalId.get(portalId);
  //   if (guestPortalBindingPromise) {
  //     const guestPortalBinding = await guestPortalBindingPromise;
  //     return await guestPortalBinding.getRemoteEditor(editorProxyId);
  //   } else {
  //     throw new Error('Cannot open an editor belonging to a portal that has not been joined');
  //   }
  // }

  didDisposeGuestPortalBinding (portalBinding: GuestPortalBinding) {
    this.promisesByGuestPortalId.delete(portalBinding.portalId);
    if (this.promisesByGuestPortalId.size === 0) {
      // this.workspace.getElement().classList.remove('teletype-Guest');
    }
    this.emitter.emit('did-change', {type: 'leave-portal', portal: portalBinding?.portal});
  }

  onDidChange (callback: (binding?: any) => void): EventEmitter {
    return this.emitter.on('did-change', callback);
  }

  refresh (): void {
    this.emitter.emit('did-change');
  }

}
