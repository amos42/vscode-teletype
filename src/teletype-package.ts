import * as vscode from 'vscode';
//import {EventEmitter} from 'events';
import { TeletypeClient, Errors, PusherPubSubGateway, Portal } from '@atom/teletype-client';
import PortalBindingManager from './portal-binding-manager';
import NotificationManager from './notification-manager';
// import PortalStatusBarIndicator from './portal-status-bar-indicator';
import { AuthenticationProvider } from './authentication-provider';
// import CredentialCache = from './credential-cache';
import TeletypeService from './teletype-service';
import { findPortalId } from './portal-id-helpers';
import { CredentialCache } from './credential-cache';
import WorkspaceManager from './workspace-manager';
import { PortalBinding } from './portal-binding';
import GuestPortalBinding from './guest-portal-binding';
import * as fs from 'fs';
import * as path from 'path';


export default class TeletypePackage {
    //     this.config.set('teletype.askBeforeJoiningPortalViaExternalApp', false);
    //     return this.joinPortal(portalId);
    //   default:
    //     break;
    // }
    fs: vscode.FileSystemProvider;
    config: any;
    workspace: vscode.WorkspaceFolder;
    notificationManager: NotificationManager;
    workspaceManager: WorkspaceManager;
    packageManager: any;
    commandRegistry: any;
    tooltipManager: any;
    clipboard: vscode.Clipboard;
    pubSubGateway: PusherPubSubGateway;
    pusherKey: string;
    pusherOptions: any;
    baseURL: string;
    getAtomVersion: Function;
    peerConnectionTimeout: any;
    tetherDisconnectWindow: any;
    credentialCache: any;
    client: TeletypeClient;
    // portalBindingManagerPromise: Promise<PortalBindingManager | null> | null;
    portalBindingManager: PortalBindingManager | null;
    joinViaExternalAppDialog: any;
    subscriptions: any[];
    initializationError: any;
    portalStatusBarIndicator: any;
    isClientOutdated: any;
    authenticationProviderPromise: any;
    authToken: string;

    constructor(options: any) {
        const {
            fs, baseURL, config, clipboard, commandRegistry, credentialCache, getAtomVersion,
            notificationManager, packageManager, workspaceManager, peerConnectionTimeout, pubSubGateway,
            pusherKey, pusherOptions, tetherDisconnectWindow, tooltipManager,
            workspace, authToken, subscriptions
        } = options;

        this.fs = fs;
        this.config = config;
        this.workspace = workspace;
        this.notificationManager = notificationManager;
        this.workspaceManager = workspaceManager;
        this.packageManager = packageManager;
        this.commandRegistry = commandRegistry;
        this.tooltipManager = tooltipManager;
        this.clipboard = clipboard;
        this.pubSubGateway = pubSubGateway;
        this.pusherKey = pusherKey;
        this.pusherOptions = pusherOptions;
        this.baseURL = baseURL;
        this.getAtomVersion = getAtomVersion;
        this.peerConnectionTimeout = peerConnectionTimeout;
        this.tetherDisconnectWindow = tetherDisconnectWindow;
        this.authToken = authToken;
        this.credentialCache = credentialCache || new CredentialCache();
        this.client = new TeletypeClient({
            pusherKey: this.pusherKey,
            pusherOptions: this.pusherOptions,
            baseURL: this.baseURL,
            pubSubGateway: this.pubSubGateway,
            connectionTimeout: this.peerConnectionTimeout,
            tetherDisconnectWindow: this.tetherDisconnectWindow
        });
        this.client.onSignInChange(this.handleSignInChangeAsync.bind(this));
        this.client.onConnectionError(this.handleConnectionError.bind(this));
        this.portalBindingManager = null;
        // this.joinViaExternalAppDialog = new JoinViaExternalAppDialog({config, commandRegistry, workspace});
        this.subscriptions = subscriptions;
    }

    async activateAsync() {
        // console.log('teletype: Using pusher key:', this.pusherKey);
        // console.log('teletype: Using base URL:', this.baseURL);

        // this.subscriptions.push(vscode.commands.registerCommand('teletype:sign-out', () => {
        //   this.signOut();
        // }));
        // this.subscriptions.push(vscode.commands.registerCommand('teletype:share-portal', () => {
        //   this.sharePortal();
        // }));
        // this.subscriptions.push(vscode.commands.registerCommand('teletype:join-portal', () => {
        //   this.joinPortal();
        // }));
        // this.subscriptions.push(vscode.commands.registerCommand('teletype:leave-portal', () => {
        //   this.leavePortal();
        // }));
        // this.subscriptions.push(vscode.commands.registerCommand('teletype:copy-portal-url', () => {
        //   this.copyHostPortalURI();
        // }));
        // this.subscriptions.push(vscode.commands.registerCommand('teletype:close-portal', () => {
        //   this.closeHostPortal();
        // }));

        // Initiate sign-in, which will continue asynchronously, since we don't want to block here.
        let result;

        if (this.authToken) {
            result = await this.signInAsync(this.authToken);
        } else {
            result = await this.signInUsingSavedTokenAsync();
        }

        if (result) {
            this.registerRemoteEditorOpener();
        } else {
            this.notificationManager?.addTrace("Session expired. Try sign-in.");
        }

        this.workspaceManager.initialize();
    }

    async deactivateAsync() {
        this.initializationError = null;

        // this.subscriptions.dispose();
        // this.subscriptions = new CompositeDisposable();

        if (this.portalStatusBarIndicator) { this.portalStatusBarIndicator.destroy(); }

        if (this.portalBindingManager) {
            const manager = this.portalBindingManager;
            await manager?.dispose();
        }
    }

    async handleURIAsync(parsedURI: vscode.Uri, rawURI: string) : Promise<Portal | undefined > {
        const portalId = findPortalId(parsedURI.fsPath) || rawURI;

        if (this.config.get('teletype.askBeforeJoiningPortalViaExternalApp')) {
            //const {EXIT_STATUS} = JoinViaExternalAppDialog;

            // const status = await this.joinViaExternalAppDialog.show(rawURI);
            // switch (portalID) {
            //   case EXIT_STATUS.CONFIRM_ONCE:
            //     return this.joinPortal(portalId);
            //   case EXIT_STATUS.CONFIRM_ALWAYS:
            //     this.config.set('teletype.askBeforeJoiningPortalViaExternalApp', false);
            //     return this.joinPortal(portalId);
            //   default:
            //     break;
            // }
            const portalID = await vscode.window.showInputBox({ prompt: 'Enter ID of the Portal you wish to join' });
            return await this.joinPortalAsync(portalId);
        } else {
            return await this.joinPortalAsync(portalId);
        }
    }

    async sharePortalAsync(): Promise<Portal | undefined> {
        this.showPopover();

        if (await this.isSignedInAsync()) {
            const manager = await this.getPortalBindingManagerAsync();
            const portalBinding = await manager?.createHostPortalBindingAsync();
            if (portalBinding?.portal) {
                return portalBinding.portal;
            } else {
                this.notificationManager?.addError("Failed share portal.");
            }
        }
    }

    async joinPortalAsync(id: string = ''): Promise<Portal | undefined> {
        this.showPopover();

        if (await this.isSignedInAsync()) {
            if (id) {
                const manager = await this.getPortalBindingManagerAsync();
                const portalBinding = await manager?.createGuestPortalBindingAsync(id);
                if (portalBinding) { return portalBinding.portal; }
            } else {
                this.showJoinPortalPrompt();
            }
        }
    }

    async closeHostPortalAsync() {
        this.showPopover();

        const manager = await this.getPortalBindingManagerAsync();
        const hostPortalBinding = await manager?.getHostPortalBinding();
        await hostPortalBinding?.closePortalAsync();
    }

    async copyHostPortalURIAsync() {
        const manager = await this.getPortalBindingManagerAsync();
        const hostPortalBinding = await manager?.getHostPortalBinding();
        if (hostPortalBinding?.uri) {
            this.clipboard.writeText(hostPortalBinding.uri);
        }
    }

    async leavePortalAsync(portalBinding?: GuestPortalBinding | undefined) {
        this.showPopover();

        const manager = await this.getPortalBindingManagerAsync();
        if (!portalBinding) {
            portalBinding = manager?.getActiveGuestPortalBinding();
        }
        await portalBinding?.leavePortalAsync();
    }

    provideTeletype() {
        return new TeletypeService(this);
    }

    // async consumeStatusBar (statusBar) {
    //   const teletypeClient = await this.getClient();
    //   const portalBindingManager = await this.getPortalBindingManager();
    //   const authenticationProvider = await this.getAuthenticationProvider();
    //   this.portalStatusBarIndicator = new PortalStatusBarIndicator({
    //     statusBar,
    //     teletypeClient,
    //     portalBindingManager,
    //     authenticationProvider,
    //     isClientOutdated: this.isClientOutdated,
    //     initializationError: this.initializationError,
    //     tooltipManager: this.tooltipManager,
    //     commandRegistry: this.commandRegistry,
    //     clipboard: this.clipboard,
    //     workspace: this.workspace,
    //     notificationManager: this.notificationManager,
    //     packageManager: this.packageManager,
    //     getAtomVersion: this.getAtomVersion
    //   });

    //   this.portalStatusBarIndicator.attach();
    // }

    registerRemoteEditorOpener() {
        // this.subscriptions.add(this.workspace.addOpener((uri) => {
        //   if (uri.startsWith('atom://teletype/')) {
        //     return this.getRemoteEditorForURI(uri);
        //   } else {
        //     return null;
        //   }
        // }));
    }

    // async getRemoteEditorForURI (uri: string) : Promise<vscode.TextEditor | undefined> {
    //   const portalBindingManager = await this.getPortalBindingManager();
    //   if (portalBindingManager && await this.isSignedIn()) {
    //     return portalBindingManager.getRemoteEditorForURI(uri);
    //   }
    // }

    async signInAsync(token: string): Promise<boolean> {
        const authenticationProvider = await this.getAuthenticationProviderAsync();
        if (authenticationProvider) {
            return authenticationProvider.signInAsync(token);
        } else {
            return false;
        }
    }

    async signInUsingSavedTokenAsync(): Promise<boolean> {
        console.log('start get auth provider...');
        const authenticationProvider = await this.getAuthenticationProviderAsync();
        console.log('get auth provider');
        if (authenticationProvider) {
            return await authenticationProvider.signInUsingSavedTokenAsync();
        } else {
            return false;
        }
    }

    async signOutAsync() {
        const authenticationProvider = await this.getAuthenticationProviderAsync();
        if (authenticationProvider) {
            //this.portalStatusBarIndicator.showPopover();
            await authenticationProvider.signOutAsync();
        }
    }

    async isSignedInAsync(): Promise<boolean> {
        const authenticationProvider = await this.getAuthenticationProviderAsync();
        if (authenticationProvider) {
            return authenticationProvider.isSignedIn();
        } else {
            return false;
        }
    }

    showPopover() {
        if (!this.portalStatusBarIndicator) { return; }

        this.portalStatusBarIndicator.showPopover();
    }

    showJoinPortalPrompt() {
        if (!this.portalStatusBarIndicator) { return; }

        const { popoverComponent } = this.portalStatusBarIndicator;
        const { portalListComponent } = popoverComponent.refs;
        portalListComponent.showJoinPortalPrompt();
    }

    async handleSignInChangeAsync() {
        if (await this.isSignedInAsync()) {
            // console.log('signin');
        } else {
            // console.log('signout');
            const manager = this.portalBindingManager;
            if (manager?.getHostPortalBinding()) {
                await manager.getHostPortalBinding()?.closePortalAsync();
            }
            const guestPortals = manager?.getGuestPortalBindings();
            guestPortals?.forEach(async (portal) => {
                await portal.leavePortalAsync();
            });
        }
    }

    handleConnectionError(event: Error) {
        const message = 'Connection Error';
        const description = `An error occurred with a teletype connection: <code>${event.message}</code>`;
        this.notificationManager.addError(message, {
            description,
            dismissable: true
        });
    }

    async getAuthenticationProviderAsync(): Promise<AuthenticationProvider> {
        if (!this.authenticationProviderPromise) {
            this.authenticationProviderPromise = new Promise(async (resolve, reject) => {
                const client = await this.getClientAsync();
                if (client) {
                    resolve(new AuthenticationProvider(
                        client, this.notificationManager, this.credentialCache
                    ));
                } else {
                    this.authenticationProviderPromise = null;
                    resolve(null);
                }
            });
        }

        return this.authenticationProviderPromise;
    }

    async getPortalBindingManagerAsync() : Promise<PortalBindingManager | null> {
        if (!this.portalBindingManager) {
            const client = await this.getClientAsync();
            if (client) {
                this.portalBindingManager = new PortalBindingManager(client, this.workspace, this.notificationManager, this.workspaceManager);
            } else {
                this.portalBindingManager = null;
            }
        }

        return this.portalBindingManager;
    }

    async getClientAsync() : Promise<TeletypeClient | undefined> {
        if (this.initializationError) { return undefined; }
        if (this.isClientOutdated) { return undefined; }

        try {
            await this.client.initialize();
            return this.client;
        } catch (error) {
            if (error instanceof Errors.ClientOutOfDateError) {
                this.isClientOutdated = true;
            } else {
                this.notificationManager.addError('client initialize error');
                this.initializationError = error;
            }
        }
    }

    showEditor(item: any) {
        this.workspaceManager.showEditor(item);
    }

    followPortal(item: any) {
        console.log(item);
        item.value?.portal?.follow(item.value?.siteId);
    }

    unfollowPortal(item: any) {
        item.value?.portal?.unfollow();
    }

    async test() {
        this.workspaceManager.refresh();
        (await this.getPortalBindingManagerAsync())?.refresh();

        if (vscode.window.activeTextEditor) {
            // this.fs.writeFile(vscode.window.activeTextEditor.document.uri, 'test text');
        }

        // vscode.commands.executeCommand('explorer.newFile', 'xxxx.txt');

        if (vscode.workspace.workspaceFolders) {
            console.log(vscode.workspace.workspaceFolders[0]);
            const fsPath = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'vscode_builtin_commands.txt');
            // let cmds: string[] = [];
            // (await vscode.commands.getCommands()) .forEach(value => {
            //   cmds.push(value);
            // });
            // const cmds = await vscode.commands.getCommands();
            // fs.writeFileSync(fsPath, cmds.join('\n'));
            // vscode.commands.executeCommand('vscode.open', vscode.Uri.file(fsPath));
            //vscode.commands.executeCommand('deleteFile', vscode.Uri.file(fsPath));
            const we = new vscode.WorkspaceEdit();
            we.deleteFile(vscode.Uri.file(fsPath));
            vscode.workspace.applyEdit(we);
        }

        // (await vscode.commands.getCommands()).forEach(value => {
        //   console.log(value);
        // });

        // await vscode.commands.executeCommand('workbench.action.nextEditor');
        // console.log(">>> activeEditor:");
        // console.log(vscode.window.activeTextEditor?.document.uri.toString());
        // await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

        this.workspaceManager.debugWorkspaceInfo();

        // console.log(">>> workspaceManager:");
        // console.log(this.workspaceManager);

        // console.log(">>> visibleTextEditors:");
        // console.log(vscode.window.visibleTextEditors);

        // console.log(">>> textDocuments:");
        // console.log(vscode.workspace.textDocuments);

        // workbench.action
    }
}
