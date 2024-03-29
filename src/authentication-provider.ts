import * as vscode from 'vscode';
import { TeletypeClient } from '@atom/teletype-client';
import { EventEmitter } from 'events';
import { CredentialCache } from './credential-cache';
import NotificationManager from './notification-manager';

export class AuthenticationProvider {
    client: TeletypeClient;
    credentialCache: CredentialCache;
    notificationManager: NotificationManager;
    emitter: EventEmitter;
    signingIn: boolean = false;

    constructor(client: TeletypeClient, notificationManager: NotificationManager, credentialCache: CredentialCache) {
        this.client = client;
        this.credentialCache = credentialCache;
        this.notificationManager = notificationManager;
        this.emitter = new EventEmitter();

        this.client.onSignInChange(this.didChangeSignIn.bind(this));
    }

    public async signInUsingSavedTokenAsync(): Promise<boolean> {
        console.log('start signInUsingSavedToken...');
        if (this.isSignedIn()) { return true; }

        const token = await this.credentialCache.get('oauth-token');
        if (token) {
            return await this._signInAsync(token);
        } else {
            return false;
        }
    }

    public async signInAsync(token: string): Promise<boolean> {
        if (this.isSignedIn()) { return true; }

        if (await this._signInAsync(token)) {
            await vscode.commands.executeCommand('setContext', 'teletype.status.isSignin', true);
            await this.credentialCache.set('oauth-token', token);
            return true;
        } else {
            await vscode.commands.executeCommand('setContext', 'teletype.status.isSignin', false);
            return false;
        }
    }

    public async signOutAsync() {
        if (!this.isSignedIn()) { return; }

        this.client.signOut();
        await vscode.commands.executeCommand('setContext', 'teletype.status.isSignin', false);

        await this.credentialCache.delete('oauth-token');
    }

    private async _signInAsync(token: string): Promise<boolean> {
        let signedIn = false;
        try {
            this.signingIn = true;
            signedIn = await this.client.signIn(token);
        } catch (error) {
            this.notificationManager.addError('Failed to authenticate to teletype', {
                description: `Signing in failed with error: <code>${(error as Error).message}</code>`,
                dismissable: true
            });
        } finally {
            this.signingIn = false;
        }
        return signedIn;
    }

    public isSigningIn(): boolean {
        return this.signingIn;
    }

    public isSignedIn(): boolean {
        console.log('check signin...');
        return this.client.isSignedIn();
    }

    public getIdentity(): any {
        return this.client.getLocalUserIdentity();
    }

    public onDidChange(callback: () => void) {
        return this.emitter.on('did-change', callback);
    }

    private didChangeSignIn(): void {
        this.emitter.emit('did-change');
    }
}
