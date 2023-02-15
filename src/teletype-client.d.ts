
declare module '@atom/teletype-client' {
    // import { Position } from "./teletype-types";
    import { CompositeDisposable, Emitter } from 'event-kit';

    export interface Position {
        row: number;
        column: number;
    }

    export interface IMemberIdentify {
        id?: string;
        login?: string;
    }

    export interface IBufferDelegate {
        dispose(): void;
        setText(text: string): void;
        didChangeURI(uri: string): void;
        save(): void;
        updateText(updates: any[]): void;
    }

    export interface UpdatePosition {
        followState: number;
        editorProxy: EditorProxy;
        position: Position;
    }

    export class BufferProxy {
        id: number;
        uri: string;
        onDidChangeBuffer: any;
        isHost: boolean;
        hostPeerId: string;
        subscriptions: CompositeDisposable;

        static deserialize(message: any, props: any): any;

        constructor({ id, uri, text, history, operations, router, hostPeerId, siteId, didDispose }: any);
        dispose(): void;
        applyGroupingInterval(applyGroupingInterval: number): void;
        broadcastOperations(operations: any): void;
        broadcastURIChange(uri: any): void;
        broadcastUpdate(updateMessage: any): void;
        createCheckpoint(options: any): Checkpoint;
        getChangesSinceCheckpoint(checkpoint: Checkpoint): void;
        getHistory(): any;
        getMarkers(): any;
        getNextMarkerLayerId(): Number;
        groupChangesSinceCheckpoint(checkpoint: Checkpoint, options: any): any;
        groupLastChanges(): any;
        integrateOperations(operations: any): void;
        onDidUpdateMarkers(listener: Function): any;
        onDidUpdateText(listener: Function): any;
        receiveFetch({ requestId }: any): void;
        receiveOperationsUpdate(operationsUpdateMessage: any): void;
        receiveSave(): void;
        receiveURIUpdate(uriUpdateMessage: any): void;
        receiveUpdate({ body }: any): void;
        requestSave(): void;
        revertToCheckpoint(checkpoint: Checkpoint, options: any): any;
        serialize(): any;
        setDelegate(delegate: IBufferDelegate): void;
        setTextInRange(oldStart: Position, oldEnd: Position, newText: string): void;
        setURI(uri: any): void;
        redo(): any | null;
        undo(): any | null;
        updateMarkers(markerUpdatesByLayerId: Number, broadcastOperations: Boolean): any;
    }

    export interface IEditorDelegate {
        dispose(): void;
        clearSelectionsForSiteId(siteId: number): void;
        isScrollNeededToViewPosition(position: Position): boolean;
        updateActivePositions(positionsBySiteId: UpdatePosition[]): void;
        updateSelectionsForSiteId(...args: any[]): void;
        // updateTether(state: number, position: Position): void;
    }

    export class EditorProxy {
        id: number;
        siteId: number;
        bufferProxy: BufferProxy;
        portal: Portal;

        static deserialize(message: any, props: any): any;

        constructor({ id, bufferProxy, selectionLayerIdsBySiteId, selections, router, siteId, didDispose, portal }: any);

        dispose(): void;
        bufferProxyDidUpdateMarkers(markerUpdates: any, options: any): void;
        createLocalSelectionsLayer(selections: any): void;
        cursorPositionForSiteId(siteId: number): any;
        didScroll(): void;
        getLocalHiddenSelections(): any;
        getMetadata(): any;
        hideSelections(): void;
        hostDidDisconnect(): void;
        isScrollNeededToViewPosition(position: Position): Boolean;
        onDidScroll(callback: Function): any;
        onDidUpdateLocalSelections(callback: Function): any;
        onDidUpdateRemoteSelections(callback: Function): any;
        receiveFetch({ requestId }: any): void;
        receiveUpdate({ body }: any): void;
        receiveSelectionsUpdate(selectionsUpdate: any): void;
        serialize(): any;
        setDelegate(delegate: IEditorDelegate): void;
        showSelections(): void;
        siteDidDisconnect(siteId: number): void;
        updateSelections(updates: any[], options: any): void;
    }

    export class EditorProxyMetadata {
        id: string;
        bufferProxyId: string;
        bufferProxyURI: any;

        static deserialize(message: any, props: any): any;

        constructor({ id, bufferProxyId, bufferProxyURI, siteId, router, didDispose }: any);

        dispose(): void;
        receiveBufferUpdate({ body }: any): void;
        serialize(): any;
    }

    export class PeerConnection {
        constructor(props: any);

        connect(): void;
        disconnect(): void;
        finishReceiving(envelope: Buffer): void;
        getConnectedPromise(): Promise<any>;
        getDisconnectedPromise(): Promise<any>;
        isConnectionClosed(): Boolean;
        isConnectionOpen(): Boolean;
        receive(data: Buffer): void;
        receiveSignal(signal: any): void;
        send(message: any): void;
        sendSignal(signal: any): void;

        // handleConnectionStateChange(): void;
        // handleDataChannel({channel}: any): void;
        // handleError(event: any): void;
        // /*async*/ handleNegotiationNeeded(): Promise<void>;
        // /*async*/ handleICECandidate({candidate}: any): Promise<void>;
    }

    export class PeerPool {
        constructor({ peerId, peerIdentity, restGateway, pubSubGateway, fragmentSize, connectionTimeout, testEpoch }: any);

        /*async*/ initialize(): Promise<void>;
        dispose(): void;
        /*async*/ connectTo(peerId: string): Promise<void>;
        disconnect(...args: any[]): void;
        /*async*/ fetchICEServers(): Promise<void>;
        /*async*/ listen(): Promise<void>;
        getConnectedPromise(peerId: String): Promise<any>;
        getDisconnectedPromise(peerId: String): Promise<any>;
        getLocalPeerIdentity(): any;
        getPeerConnection(peerId: string): any;
        getPeerIdentity(peerId: string): any;
        isConnectedToPeer(peerId: string): Boolean;
        onDisconnection(callback: Function): any;
        onError(callback: Function): any;
        onReceive(callback: Function): any;
        peerConnectionDidError({ peerId, event }: any): void;
        send(peerId: String, message: any): void;

        didDisconnect(peerId: string): void;
        didReceiveMessage(event: any): void;
        didReceiveSignal(message: any): void;
    }

    export interface IPortalDelegate {
        dispose(): void;
        updateActivePositions(positionsBySiteId: UpdatePosition[]): void;
        hostDidLoseConnection(): void
        hostDidClosePortal(): void;
        /*async*/ updateTether(state: number, editorProxy: EditorProxy, position: Position): Promise<void>;
        siteDidJoin(siteId: number): void;
        siteDidLeave(siteId: number): void;
        didChangeEditorProxies(): void;
    }

    export class Portal {
        id: string;
        hostPeerId: string;
        isHost: boolean;
        router: Router;
        siteIdsByPeerId: Map<string, number>;
        peerIdsBySiteId: Map<number, string>;
        editorProxiesById: Map<string, EditorProxy>;
        bufferProxiesById: Map<string, BufferProxy>;
        activeEditorProxiesBySiteId: Map<number, EditorProxy>;

        constructor({ id, hostPeerId, siteId, peerPool, connectionTimeout, tetherDisconnectWindow }: any);

        dispose(): void;
        /*async*/ initialize(): Promise<void>;
        /*async*/ join(): Promise<void>;
        activateEditorProxy(editorProxy: EditorProxy | null | undefined): void;
        activeEditorDidScroll(): void;
        activeEditorDidUpdateLocalSelections({ initialUpdate, isRmoteChange }: any): void;
        activeEditorDidUpdateRemoteSelections({ selectionLayerIdsBySiteId, initialUpdate }: any): void;
        activeEditorDidUpdateText({ remote }: any): void;
        activeEditorProxyForSiteId(siteId: string): any;

        assignNewSiteId(peerId: string): void;

        bindPeerIdToSiteId(...args: any[]): void;

        broadcastEditorProxyCreation(...args: any[]): void;

        broadcastEditorProxySwitch(...args: any[]): void;

        createBufferProxy(props: any): BufferProxy;

        createEditorProxy(props: any): EditorProxy;

        deserializeBufferProxy(message: any): void;

        deserializeEditorProxy(message: any): void;

        deserializeEditorProxyMetadata(message: any): void;

        extendTether(): void;

        /*async*/ fetchBufferProxy(id: string): Promise<BufferProxy | undefined>;
        /*async*/ findOrFetchBufferProxy(id: string): Promise<BufferProxy | undefined>;
        /*async*/ fetchEditorProxy(id: string): Promise<EditorProxy | undefined>;
        /*async*/ findOrFetchEditorProxy(id: string): Promise<EditorProxy | undefined>;

        follow(siteId: number): void;
        unfollow(): void;
        getActiveSiteIds(): string[];
        getEditorProxiesMetadata(): EditorProxyMetadata[];
        getEditorProxyMetadata(editorProxyId: string): EditorProxyMetadata;
        getFollowedSiteId(): number;
        getLocalActiveEditorProxy(): EditorProxy;
        getLocalSiteId(): number;
        getSiteIdentity(siteId: number): IMemberIdentify;
        receiveEditorProxyCreation(editorProxyCreationMessage: any): void;
        /*async*/ receiveEditorProxySwitch(senderSiteId: String, editorProxySwitch: any): Promise<void>;
        receiveSiteAssignment(siteAssignment: any): void;
        receiveSubscription({ senderId, requestId }: any): void;
        receiveTetherUpdate(tetherUpdate: any): void;
        /*async*/ receiveUpdate({ senderId, body }: any): Promise<void>;
        resolveFollowState(followerId: string): number;
        resolveLeaderPosition(followerId: string): Position;
        resolveLeaderSiteId(followerId: string): string;
        retractTether(): void;
        sendSubscriptionResponse(requestId: string): void;
        /*async*/ setDelegate(delegate: IPortalDelegate): Promise<void>;
        siteDidLeave({ peerId, connectionLost }: any): void;
        subscribeToEditorProxyChanges(editorProxy: EditorProxy): void;
        updateActivePositions(positionsBySiteId: UpdatePosition[]): void;

        didChangeTetherState({ oldResolvedState, oldResolvedLeaderId, newResolvedState, newResolvedLeaderId }: any): void;
    }

    export class PubSubSignalingProvider {
        constructor({ localPeerId, remotePeerId, restGateway, testEpoch }: any);

        /*async*/ send(signal: any): Promise<void>;
        /*async*/ receiveMessage({ testEpoch, sequenceNumber, signal }: any): Promise<void>;
    }

    export class PusherPubSubGateway {
        constructor({key, options}: any);

        /*async*/ connect(...args: any[]): Promise<any>;
        disconnect(): void;
        /*async*/ subscribe (channelName: string, eventName: string, callback: Function): Promise<void>;
    }

    export class RestGateway {
        constructor(...args: any[]);

        fetch(...args: any[]): void;

        get(...args: any[]): void;

        getAbsoluteURL(...args: any[]): void;

        getDefaultHeaders(...args: any[]): void;

        post(...args: any[]): void;

        setOauthToken(...args: any[]): void;

    }

    export class Router {
        constructor(network: any);

        dispose(...args: any[]): void;

        notify(...args: any[]): void;

        onNotification(...args: any[]): void;

        onRequest(...args: any[]): void;

        receive(...args: any[]): void;

        receiveNotification(...args: any[]): void;

        receiveRequest(...args: any[]): void;

        receiveResponse(...args: any[]): void;

        request(...args: any[]): void;

        respond(...args: any[]): void;

    }

    export class SocketClusterPubSubGateway {
        constructor(...args: any[]);

        subscribe(...args: any[]): void;

    }

    export class StarOverlayNetwork {
        constructor(...args: any[]);

        broadcast(...args: any[]): void;

        connectTo(...args: any[]): void;

        didLoseConnectionToPeer(...args: any[]): void;

        disconnect(...args: any[]): void;

        dispose(...args: any[]): void;

        forwardBroadcast(...args: any[]): void;

        forwardUnicast(...args: any[]): void;

        getMemberIdentity(...args: any[]): void;

        getMemberIds(...args: any[]): void;

        getPeerId(...args: any[]): void;

        memberDidLeave(...args: any[]): void;

        onMemberJoin(...args: any[]): void;

        onMemberLeave(...args: any[]): void;

        onReceive(...args: any[]): void;

        receive(...args: any[]): void;

        receiveBroadcast(...args: any[]): void;

        receiveJoinNotification(...args: any[]): void;

        receiveJoinRequest(...args: any[]): void;

        receiveJoinResponse(...args: any[]): void;

        receiveLeaveNotification(...args: any[]): void;

        receiveUnicast(...args: any[]): void;

        resetConnectedMembers(...args: any[]): void;

        send(...args: any[]): void;

        unicast(...args: any[]): void;

    }

    export class TeletypeClient {
        constructor({restGateway, pubSubGateway, connectionTimeout, tetherDisconnectWindow, testEpoch, pusherKey, pusherOptions, baseURL, didCreateOrJoinPortal}: any);

        dispose(): void;
        /*async*/ initialize(): Promise<void>;
        /*async*/ signIn(oauthToken: string): Promise<boolean>;
        signOut(): boolean;
        /*async*/ createPortal(): Promise<Portal>;
        /*async*/ joinPortal(id: String): Promise<Portal>;
        getClientId(): String;
        getLocalUserIdentity(): PeerPool | null;
        isSignedIn(): boolean;
        onConnectionError(callback: Function): void;
        onSignInChange(callback: Function): void;
        peerPoolDidError(error: any): void;
    }

    export const FollowState: {
        DISCONNECTED: number;
        EXTENDED: number;
        RETRACTED: number;
    };

    export interface Checkpoint {
        id: number;
        isBarrier: boolean;
        markersSnapshot: any;
    }

    export function convertToProtobufCompatibleBuffer(data: any): any;

    export namespace Errors {
        function ClientOutOfDateError(...args: any[]): void;

        function HTTPRequestError(...args: any[]): void;

        function InvalidAuthenticationTokenError(...args: any[]): void;

        function NetworkConnectionError(...args: any[]): void;

        function PeerConnectionError(...args: any[]): void;

        function PortalCreationError(...args: any[]): void;

        function PortalJoinError(...args: any[]): void;

        function PortalNotFoundError(...args: any[]): void;

        function PubSubConnectionError(...args: any[]): void;

        function UnexpectedAuthenticationError(...args: any[]): void;

        namespace ClientOutOfDateError {
            const stackTraceLimit: number;

            function captureStackTrace(p0: any, p1: any): any;
        }

        namespace HTTPRequestError {
            const stackTraceLimit: number;

            function captureStackTrace(p0: any, p1: any): any;
        }

        namespace InvalidAuthenticationTokenError {
            const stackTraceLimit: number;

            function captureStackTrace(p0: any, p1: any): any;
        }

        namespace NetworkConnectionError {
            const stackTraceLimit: number;

            function captureStackTrace(p0: any, p1: any): any;
        }

        namespace PeerConnectionError {
            const stackTraceLimit: number;

            function captureStackTrace(p0: any, p1: any): any;
        }

        namespace PortalCreationError {
            const stackTraceLimit: number;

            function captureStackTrace(p0: any, p1: any): any;
        }

        namespace PortalJoinError {
            const stackTraceLimit: number;

            function captureStackTrace(p0: any, p1: any): any;
        }

        namespace PortalNotFoundError {
            const stackTraceLimit: number;

            function captureStackTrace(p0: any, p1: any): any;
        }

        namespace PubSubConnectionError {
            const stackTraceLimit: number;

            function captureStackTrace(p0: any, p1: any): any;
        }

        namespace UnexpectedAuthenticationError {
            const stackTraceLimit: number;

            function captureStackTrace(p0: any, p1: any): any;
        }

    }
}