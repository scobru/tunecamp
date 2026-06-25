export interface PeerTrackManifest {
    id: string; // Hash of the file (e.g. SHA256)
    title: string;
    artist?: string;
    album?: string;
    duration?: number;
    fileSizeBytes?: number;
    mimeType?: string;
    allowDownload?: boolean;
}

export type ServerMessage =
    | { type: 'auth_ok'; sessionId: string }
    | { type: 'auth_fail'; reason: string }
    | { type: 'stream_request'; requestId: string; trackId: string }
    | { type: 'download_request'; requestId: string; trackId: string }
    | { type: 'pong' };
