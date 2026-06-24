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

export type PeerMessage =
    | { type: 'manifest'; tracks: PeerTrackManifest[] }
    | { type: 'chunk'; requestId: string; seq: number; data: string } // binary chunk base64 encoded or string
    | { type: 'chunk_end'; requestId: string }
    | { type: 'chunk_error'; requestId: string; message: string }
    | { type: 'ping' };

export type ServerMessage =
    | { type: 'auth_ok'; sessionId: string }
    | { type: 'auth_fail'; reason: string }
    | { type: 'stream_request'; requestId: string; trackId: string }
    | { type: 'download_request'; requestId: string; trackId: string }
    | { type: 'pong' };
