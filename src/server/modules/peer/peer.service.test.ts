import { describe, expect, it, jest, afterEach, beforeEach } from '@jest/globals';
import { createPeerService, PeerService } from './peer.service.js';
import type { DatabaseService } from '../../core/database.types.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('createPeerService', () => {
    let mockDatabase: DatabaseService;
    let peerService: PeerService | undefined;

    beforeEach(() => {
        mockDatabase = {} as DatabaseService;
    });

    afterEach(() => {
        if (peerService) {
            peerService.stopHeartbeat();
        }
    });

    it('creates a PeerService instance with required database argument', () => {
        peerService = createPeerService(mockDatabase);

        expect(peerService).toBeInstanceOf(PeerService);
        expect(peerService).toBe(peerService);
    });

    it('creates a PeerService instance with optional apService argument', () => {
        const mockApService = {} as any;
        peerService = createPeerService(mockDatabase, mockApService);

        expect(peerService).toBeInstanceOf(PeerService);
    });
});

function fakeWs() {
    return { readyState: 1, send: jest.fn(), close: jest.fn() } as any;
}

// requestImport awaits a real fs.promises.mkdir before calling ws.send, so the
// caller must wait for that call rather than inspecting mock.calls synchronously.
function waitForSend(ws: ReturnType<typeof fakeWs>): Promise<any> {
    return new Promise(resolve => {
        ws.send.mockImplementation((msg: string) => resolve(JSON.parse(msg)));
    });
}

describe('PeerService lobby chat and pubkey relay', () => {
    let peerService: PeerService;

    beforeEach(() => {
        const mockDatabase = {
            peer: {
                createPeerSession: jest.fn(),
                updatePeerSessionHeartbeat: jest.fn(),
                deletePeerSession: jest.fn(),
                deleteStaleSessionsForUser: jest.fn(),
                deleteStaleSessions: jest.fn(),
            },
        } as unknown as DatabaseService;
        peerService = createPeerService(mockDatabase);
        peerService.stopHeartbeat();
    });

    afterEach(() => {
        peerService.stopHeartbeat();
    });

    describe('relayChat', () => {
        it('broadcasts a lobby message (empty toUsername) to every other connected peer', () => {
            const aliceWs = fakeWs();
            const bobWs = fakeWs();
            const carolWs = fakeWs();
            const aliceId = peerService.registerSession(aliceWs, 1, 'alice', null, true);
            peerService.registerSession(bobWs, 2, 'bob', null, true);
            peerService.registerSession(carolWs, 3, 'carol', null, true);

            const delivered = peerService.relayChat(aliceId, '', 'hi everyone');

            expect(delivered).toBe(true);
            expect(aliceWs.send).not.toHaveBeenCalled();
            expect(bobWs.send).toHaveBeenCalledWith(expect.stringContaining('"lobby":true'));
            expect(carolWs.send).toHaveBeenCalledWith(expect.stringContaining('"lobby":true'));
        });

        it('delivers a direct message only to the named recipient', () => {
            const aliceWs = fakeWs();
            const bobWs = fakeWs();
            const carolWs = fakeWs();
            const aliceId = peerService.registerSession(aliceWs, 1, 'alice', null, true);
            peerService.registerSession(bobWs, 2, 'bob', null, true);
            peerService.registerSession(carolWs, 3, 'carol', null, true);

            const delivered = peerService.relayChat(aliceId, 'bob', 'psst');

            expect(delivered).toBe(true);
            expect(bobWs.send).toHaveBeenCalledWith(expect.stringContaining('"lobby":false'));
            expect(carolWs.send).not.toHaveBeenCalled();
        });

        it('returns false and delivers nothing for an unknown sender session', () => {
            const delivered = peerService.relayChat('nonexistent-session', '', 'hi');
            expect(delivered).toBe(false);
        });

        it('returns false and delivers nothing for blank text', () => {
            const aliceWs = fakeWs();
            const bobWs = fakeWs();
            const aliceId = peerService.registerSession(aliceWs, 1, 'alice', null, true);
            peerService.registerSession(bobWs, 2, 'bob', null, true);

            const delivered = peerService.relayChat(aliceId, '', '   ');

            expect(delivered).toBe(false);
            expect(bobWs.send).not.toHaveBeenCalled();
        });
    });

    describe('setPubkey', () => {
        it('broadcasts the announcing pubkey to other sessions and returns their known keys', () => {
            const aliceWs = fakeWs();
            const bobWs = fakeWs();
            const aliceId = peerService.registerSession(aliceWs, 1, 'alice', null, true);
            const bobId = peerService.registerSession(bobWs, 2, 'bob', null, true);

            peerService.setPubkey(bobId, 'bob-pub');
            bobWs.send.mockClear();

            const roster = peerService.setPubkey(aliceId, 'alice-pub');

            expect(bobWs.send).toHaveBeenCalledWith(
                JSON.stringify({ type: 'pubkey', from: 'alice', pubkey: 'alice-pub' })
            );
            expect(roster).toEqual([{ username: 'bob', pubkey: 'bob-pub' }]);
        });

        it('returns an empty roster for an unknown session', () => {
            expect(peerService.setPubkey('nonexistent-session', 'pub')).toEqual([]);
        });
    });
});

function fakeRes() {
    const handlers: Record<string, () => void> = {};
    return {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        setHeader: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        headersSent: false,
        on: jest.fn((event: string, cb: () => void) => { handlers[event] = cb; }),
        _trigger: (event: string) => handlers[event]?.(),
    } as any;
}

describe('PeerService session lifecycle and streaming', () => {
    let peerService: PeerService;
    let mockPeer: any;
    let mockDatabase: any;

    beforeEach(() => {
        mockPeer = {
            createPeerSession: jest.fn(),
            updatePeerSessionHeartbeat: jest.fn(),
            deletePeerSession: jest.fn(),
            deleteStaleSessionsForUser: jest.fn(),
            deleteStaleSessions: jest.fn(),
            replacePeerTracks: jest.fn(),
            getPeerTrack: jest.fn(),
            searchPeerTracks: jest.fn().mockReturnValue(['track-a']),
            getTracksByPeerSession: jest.fn().mockReturnValue(['session-track']),
            getTracksByPeerSessions: jest.fn().mockReturnValue(['multi-track']),
            getActivePeerSessions: jest.fn().mockReturnValue(['active-session']),
        };
        mockDatabase = {
            peer: mockPeer,
            identity: { getSetting: jest.fn().mockReturnValue('true') },
        } as unknown as DatabaseService;
        peerService = createPeerService(mockDatabase);
        peerService.stopHeartbeat();
    });

    afterEach(() => {
        peerService.stopHeartbeat();
    });

    describe('registerSession', () => {
        it('tears down a stale session for the same user before registering the new one', () => {
            const oldWs = fakeWs();
            const oldId = peerService.registerSession(oldWs, 1, 'alice', null, true);

            const newWs = fakeWs();
            const newId = peerService.registerSession(newWs, 1, 'alice', null, true);

            expect(oldWs.close).toHaveBeenCalled();
            expect(mockPeer.deletePeerSession).toHaveBeenCalledWith(oldId);
            expect(newId).not.toBe(oldId);
            expect(mockPeer.createPeerSession).toHaveBeenCalledWith(newId, 1, null, true);
        });

        it('rejects pending requests on the stale session with 503 before dropping it', () => {
            const oldWs = fakeWs();
            const oldId = peerService.registerSession(oldWs, 1, 'alice', null, true);
            const pendingRes = fakeRes();
            (peerService as any).activeSessions.get(oldId).pendingRequests.set('req-1', pendingRes);

            peerService.registerSession(fakeWs(), 1, 'alice', null, true);

            expect(pendingRes.status).toHaveBeenCalledWith(503);
        });
    });

    describe('handlePong', () => {
        it('updates lastPongAt and persists the heartbeat for a known session', () => {
            const id = peerService.registerSession(fakeWs(), 1, 'alice', null, true);
            peerService.handlePong(id);
            expect(mockPeer.updatePeerSessionHeartbeat).toHaveBeenCalledWith(id);
        });

        it('is a no-op for an unknown session', () => {
            expect(() => peerService.handlePong('nonexistent')).not.toThrow();
            expect(mockPeer.updatePeerSessionHeartbeat).not.toHaveBeenCalled();
        });
    });

    describe('unregisterSession', () => {
        it('closes the socket, rejects pending requests, and always drops the DB row', () => {
            const ws = fakeWs();
            const id = peerService.registerSession(ws, 1, 'alice', null, true);
            const pendingRes = fakeRes();
            (peerService as any).activeSessions.get(id).pendingRequests.set('req-1', pendingRes);

            peerService.unregisterSession(id);

            expect(ws.close).toHaveBeenCalled();
            expect(pendingRes.status).toHaveBeenCalledWith(503);
            expect(mockPeer.deletePeerSession).toHaveBeenCalledWith(id);
        });

        it('drops the DB row even when there is no live in-memory session (orphaned row / kick)', () => {
            peerService.unregisterSession('orphaned-id');
            expect(mockPeer.deletePeerSession).toHaveBeenCalledWith('orphaned-id');
        });
    });

    describe('handleManifest', () => {
        it('maps manifests and stores them for the session', () => {
            const id = peerService.registerSession(fakeWs(), 1, 'alice', null, true);
            peerService.handleManifest(id, [
                { id: 't1', title: 'Song', artist: 'Artist', album: 'Album', duration: 120, fileSizeBytes: 999, mimeType: 'audio/mpeg', allowDownload: false } as any,
            ]);
            expect(mockPeer.replacePeerTracks).toHaveBeenCalledWith(id, [
                expect.objectContaining({ id: 't1', title: 'Song', allow_download: false }),
            ]);
        });

        it('is a no-op for an unknown session', () => {
            peerService.handleManifest('nonexistent', [{ id: 't1', title: 'x' } as any]);
            expect(mockPeer.replacePeerTracks).not.toHaveBeenCalled();
        });
    });

    describe('requestStream', () => {
        it('returns 404 when the session does not exist', async () => {
            const res = fakeRes();
            await peerService.requestStream('nonexistent', 't1', res);
            expect(res.status).toHaveBeenCalledWith(404);
        });

        it('returns 404 when the track does not exist on that session', async () => {
            const id = peerService.registerSession(fakeWs(), 1, 'alice', null, true);
            mockPeer.getPeerTrack.mockReturnValue(undefined);
            const res = fakeRes();
            await peerService.requestStream(id, 't1', res);
            expect(res.status).toHaveBeenCalledWith(404);
        });

        it('sends a stream_request over the socket and sets response headers', async () => {
            const ws = fakeWs();
            const id = peerService.registerSession(ws, 1, 'alice', null, true);
            mockPeer.getPeerTrack.mockReturnValue({ mime_type: 'audio/mpeg', file_size: 123 });
            const res = fakeRes();

            await peerService.requestStream(id, 't1', res);

            expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'audio/mpeg');
            expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"type":"stream_request"'));
        });

        it('responds 500 and cleans up when the socket send throws', async () => {
            const ws = fakeWs();
            ws.send.mockImplementation(() => { throw new Error('socket closed'); });
            const id = peerService.registerSession(ws, 1, 'alice', null, true);
            mockPeer.getPeerTrack.mockReturnValue({ mime_type: 'audio/mpeg' });
            const res = fakeRes();

            await peerService.requestStream(id, 't1', res);

            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    describe('requestDownload', () => {
        function setup(overrides: { globalSetting?: string; sessionAllows?: boolean; trackAllows?: boolean } = {}) {
            mockDatabase.identity.getSetting = jest.fn().mockReturnValue(overrides.globalSetting ?? 'true');
            const ws = fakeWs();
            const id = peerService.registerSession(ws, 1, 'alice', null, overrides.sessionAllows ?? true);
            mockPeer.getPeerTrack.mockReturnValue({
                mime_type: 'audio/mpeg',
                file_size: 100,
                artist: 'Artist',
                title: 'Title',
                allow_download: overrides.trackAllows ?? true,
            });
            return { ws, id };
        }

        it('returns 404 when the session does not exist', async () => {
            const res = fakeRes();
            await peerService.requestDownload('nonexistent', 't1', res);
            expect(res.status).toHaveBeenCalledWith(404);
        });

        it('returns 403 when the global peerAllowDownloads setting is disabled', async () => {
            const { id } = setup({ globalSetting: 'false' });
            const res = fakeRes();
            await peerService.requestDownload(id, 't1', res);
            expect(res.status).toHaveBeenCalledWith(403);
        });

        it('returns 403 when the session itself disallows downloads', async () => {
            const { id } = setup({ sessionAllows: false });
            const res = fakeRes();
            await peerService.requestDownload(id, 't1', res);
            expect(res.status).toHaveBeenCalledWith(403);
        });

        it('returns 403 when the track itself disallows downloads', async () => {
            const { id } = setup({ trackAllows: false });
            const res = fakeRes();
            await peerService.requestDownload(id, 't1', res);
            expect(res.status).toHaveBeenCalledWith(403);
        });

        it('sanitizes dangerous characters out of the Content-Disposition filename', async () => {
            mockDatabase.identity.getSetting = jest.fn().mockReturnValue('true');
            const ws = fakeWs();
            const id = peerService.registerSession(ws, 1, 'alice', null, true);
            mockPeer.getPeerTrack.mockReturnValue({
                mime_type: 'audio/mpeg',
                artist: '../../etc/passwd',
                title: 'evil"; drop',
                allow_download: true,
            });
            const res = fakeRes();

            await peerService.requestDownload(id, 't1', res);

            const [, disposition] = res.setHeader.mock.calls.find((c: any[]) => c[0] === 'Content-Disposition');
            expect(disposition).not.toMatch(/[\/\\]/);
            expect(disposition).not.toContain('"; drop');
        });

        it('grants the download and sends a download_request when all checks pass', async () => {
            const { ws, id } = setup();
            const res = fakeRes();
            await peerService.requestDownload(id, 't1', res);
            expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"type":"download_request"'));
        });
    });

    describe('requestImport / handleChunk / handleChunkEnd / handleChunkError', () => {
        it('rejects when no session holds the requested track', async () => {
            await expect(peerService.requestImport('nonexistent', 't1', '/tmp/x'))
                .rejects.toThrow(/Peer session not found|Track not found/);
        });

        it('rejects when downloads are disabled for the peer/track', async () => {
            const id = peerService.registerSession(fakeWs(), 1, 'alice', null, false);
            mockPeer.getPeerTrack.mockReturnValue({ mime_type: 'audio/mpeg', allow_download: true });
            await expect(peerService.requestImport(id, 't1', '/tmp/x'))
                .rejects.toThrow(/Downloads are disabled/);
        });

        it('resolves with the saved file path once the chunk stream completes', async () => {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'peer-import-'));
            const ws = fakeWs();
            const id = peerService.registerSession(ws, 1, 'alice', null, true);
            mockPeer.getPeerTrack.mockReturnValue({ id: 't1', mime_type: 'audio/mpeg', artist: 'A', title: 'B', allow_download: true });

            const sentMsgPromise = waitForSend(ws);
            const importPromise = peerService.requestImport(id, 't1', tmpDir);

            const sentMsg = await sentMsgPromise;
            expect(sentMsg.type).toBe('download_request');
            const requestId = sentMsg.requestId;

            peerService.handleChunk(id, requestId, 0, Buffer.from('hello').toString('base64'));
            peerService.handleChunkEnd(id, requestId);

            const result = await importPromise;
            expect(result.filePath).toContain(tmpDir);
            expect(fs.readFileSync(result.filePath, 'utf8')).toBe('hello');

            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        it('finds the track in a rotated session when the original session id no longer holds it', async () => {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'peer-import-'));
            const ws = fakeWs();
            const id = peerService.registerSession(ws, 1, 'alice', null, true);
            mockPeer.getPeerTrack.mockImplementation((sid: string) => (sid === id ? { id: 't1', mime_type: 'audio/mpeg', allow_download: true } : undefined));

            const sentMsgPromise = waitForSend(ws);
            const importPromise = peerService.requestImport('stale-session-id', 't1', tmpDir);
            const sentMsg = await sentMsgPromise;

            peerService.handleChunkEnd(id, sentMsg.requestId);
            const result = await importPromise;
            expect(result.track.id).toBe('t1');

            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        it('fails the import and cleans up the partial file when the socket send throws', async () => {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'peer-import-'));
            const ws = fakeWs();
            ws.send.mockImplementation(() => { throw new Error('socket closed'); });
            const id = peerService.registerSession(ws, 1, 'alice', null, true);
            mockPeer.getPeerTrack.mockReturnValue({ id: 't1', mime_type: 'audio/mpeg', allow_download: true });

            await expect(peerService.requestImport(id, 't1', tmpDir)).rejects.toThrow(/Failed to communicate with peer/);

            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        it('routes chunk write errors for a live HTTP request to handleChunkError (500 response)', async () => {
            const id = peerService.registerSession(fakeWs(), 1, 'alice', null, true);
            const res = fakeRes();
            (peerService as any).activeSessions.get(id).pendingRequests.set('req-1', res);
            res.write.mockImplementation(() => { throw new Error('client gone'); });

            peerService.handleChunk(id, 'req-1', 0, Buffer.from('x').toString('base64'));

            expect(res.status).toHaveBeenCalledWith(500);
        });

        it('ends the HTTP response on handleChunkEnd for a live streamed request', () => {
            const id = peerService.registerSession(fakeWs(), 1, 'alice', null, true);
            const res = fakeRes();
            (peerService as any).activeSessions.get(id).pendingRequests.set('req-1', res);

            peerService.handleChunkEnd(id, 'req-1');

            expect(res.end).toHaveBeenCalled();
        });

        it('surfaces a 500 error via handleChunkError for a live HTTP request', () => {
            const id = peerService.registerSession(fakeWs(), 1, 'alice', null, true);
            const res = fakeRes();
            (peerService as any).activeSessions.get(id).pendingRequests.set('req-1', res);

            peerService.handleChunkError(id, 'req-1', 'peer read failed');

            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    describe('read delegators', () => {
        it('searchTracks / getTracksBySession / getTracksBySessions / getSessions delegate to the database', () => {
            expect(peerService.searchTracks('q')).toEqual(['track-a']);
            expect(peerService.getTracksBySession('s1')).toEqual(['session-track']);
            expect(peerService.getTracksBySessions(['s1', 's2'])).toEqual(['multi-track']);
            expect(peerService.getSessions()).toEqual(['active-session']);
        });
    });
});
