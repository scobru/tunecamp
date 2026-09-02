import { Router, Request, Response } from 'express';
import { create } from 'xmlbuilder2';
import path from 'path';
import { resolveSafePath, fileExists } from '../../../utils/fileUtils.js';
import { getPlaceholderSVG } from '../../../utils/audioUtils.js';
import type { DatabaseService, Track } from '../../core/database.js';
import type { AuthService } from '../../modules/auth/auth.service.js';
import type { MediaEngine } from '../../modules/media/media-engine.js';
import { sendStreamResult } from '../../modules/media/media-engine.js';
import { SubsonicService } from '../../modules/subsonic/subsonic.service.js';
import { UserRole, VisibilityGuardian, VisibilityProfile } from '../../common/visibility.js';
import { NotFoundError } from '../../common/errors.js';

import type { ServiceContainer } from '../../core/container.js';

// In-memory cache for "Now Playing" to support Subsonic clients
const nowPlayingCache = new Map<string, { trackId: number, timestamp: number }>();

export const createSubsonicRouter = (container: ServiceContainer): Router => {
    const router = Router();
    const db = container.database;
    const auth = container.authService;
    const scrobbleService = container.scrobbleService;
    const subsonicService = container.subsonicService || (db ? new SubsonicService(db) : undefined);
    const mediaEngine = container.mediaEngine;
    const musicDir = container.musicDir;

    // --- Helpers ---

    const ensureString = (val: unknown): string | undefined => {
        if (typeof val === 'string') return val;
        if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'string') return val[0];
        return undefined;
    };

    const sanitizeJsonKeys = (obj: unknown): unknown => {
        if (Array.isArray(obj)) {
            return obj.map(item => sanitizeJsonKeys(item));
        } else if (obj !== null && typeof obj === 'object') {
            const newObj: Record<string, unknown> = {};
            const record = obj as Record<string, unknown>;
            for (const key in record) {
                if (Object.prototype.hasOwnProperty.call(record, key)) {
                    const newKey = key.startsWith('@') ? key.substring(1) : key;
                    newObj[newKey] = sanitizeJsonKeys(record[key]);
                }
            }
            return newObj;
        }
        return obj;
    };

    const sendResponse = (res: Response, req: Request, data: object, status = 'ok') => {
        const isJson = ensureString(req.query.f) === 'json';
        const version = '1.16.1';

        res.set('X-OpenSubsonic-Server', 'Tunecamp/2.0');

        if (isJson) {
            res.json({
                'subsonic-response': {
                    status,
                    version,
                    type: 'tunecamp',
                    serverVersion: '2.0.0',
                    tunecampVersion: '2.0.0',
                    openSubsonic: true,
                    ...(sanitizeJsonKeys(data) as Record<string, unknown>)
                }
            });
            return;
        }

        const doc = create({ version: '1.0', encoding: 'UTF-8' })
            .ele('subsonic-response', { 
                xmlns: 'http://subsonic.org/restapi', 
                status, 
                version,
                type: 'tunecamp',
                serverVersion: '2.0.0',
                openSubsonic: 'true' 
            });

        if (Object.keys(data).length > 0) {
            doc.ele(data);
        }

        const xml = doc.end({ prettyPrint: true });
        res.set('Content-Type', 'text/xml');
        res.send(xml);
    };

    const sendError = (res: Response, req: Request, code: number, message: string) => {
        const isJson = ensureString(req.query.f) === 'json';
        const status = 'failed';
        const version = '1.16.1';

        res.set('X-OpenSubsonic-Server', 'Tunecamp/2.0');

        if (isJson) {
            res.json({
                'subsonic-response': {
                    status,
                    version,
                    type: 'tunecamp',
                    serverVersion: '2.0.0',
                    openSubsonic: true,
                    error: { code: String(code), message }
                }
            });
            return;
        }

        const doc = create({ version: '1.0', encoding: 'UTF-8' })
            .ele('subsonic-response', { 
                xmlns: 'http://subsonic.org/restapi', 
                status, 
                version,
                type: 'tunecamp',
                serverVersion: '2.0.0',
                openSubsonic: 'true' 
            })
            .ele('error', { code: String(code), message }).up();

        const xml = doc.end({ prettyPrint: true });
        res.set('Content-Type', 'text/xml');
        res.send(xml);
    };

    // --- Public Endpoints (No Auth Required) ---

    router.all('/ping.view', (req, res) => sendResponse(res, req, {}));

    // --- Middleware ---

    router.use(async (req, res, next) => {
        if (req.path === '/') {
            return sendResponse(res, req, { message: 'Tunecamp Subsonic API' });
        }

        const u = ensureString(req.query.u);
        const p = ensureString(req.query.p);
        const t = ensureString(req.query.t);
        const s = ensureString(req.query.s);

        // Security: Redact passwords and tokens from URLs to prevent credential leakage in access logs
        if (req.originalUrl) {
            req.originalUrl = req.originalUrl.replace(/([?&])([pts])=[^&]*/g, '$1$2=***');
        }
        if (req.url) {
            req.url = req.url.replace(/([?&])([pts])=[^&]*/g, '$1$2=***');
        }

        if (!u) return sendError(res, req, 10, 'Parameter u is missing');

        let authorized = false;
        let isAdmin = false;
        let artistId: number | null = null;
        // Set by the credential paths that prove account ownership without
        // carrying a role themselves (Subsonic app password / token+salt);
        // both resolve the role from the account row below.
        let authorizedBySubsonicSecret = false;

        if (p) {
            // Auth method 1: tc_ API tokens or JWT session tokens via p= parameter
            // This enables lab apps (e.g. audiofabric) to stream via Subsonic API
            // using the existing token system instead of plain passwords.
            if (p.startsWith('tc_') || (p.includes('.') && p.split('.').length === 3)) {
                const tokenPayload = await auth.verifyToken(p);
                if (tokenPayload) {
                    authorized = true;
                    isAdmin = tokenPayload.isAdmin;
                    artistId = tokenPayload.artistId;
                    // Use the username from the token payload (overrides u= param)
                    (req as any).user = { username: tokenPayload.username, isAdmin, artistId };
                }
            }

            // Auth method 2: Plain password or enc: encoded password
            if (!authorized) {
                let password = p;
                if (p.startsWith('enc:')) {
                    const hex = p.substring(4);
                    password = Buffer.from(hex, 'hex').toString('utf8');
                }

                // The Subsonic app password is the preferred credential here, so
                // a client configured with one never sends the account password.
                if (auth.verifySubsonicPassword(u, password)) {
                    authorized = true;
                    authorizedBySubsonicSecret = true;
                } else {
                    const result = await auth.authenticateUser(u, password);
                    if (result && result.success) {
                        authorized = true;
                        isAdmin = result.isAdmin;
                        artistId = result.artistId;
                    }
                }
            }
        }

        if (!authorized && t && s) {
            if (await auth.verifySubsonicToken(u, t, s)) {
                authorized = true;
                authorizedBySubsonicSecret = true;
            }
        }

        if (authorizedBySubsonicSecret) {
            const user = (db as any).db.prepare("SELECT id, role, artist_id, is_active FROM admin WHERE username = ?").get(u);
            if (user) {
                const derivedRole = VisibilityGuardian.deriveRole(user.role, user.is_active !== 0);
                isAdmin = VisibilityGuardian.isAdminRole(derivedRole);
                artistId = user.artist_id;
            }
        }

        if (!authorized) return sendError(res, req, 40, 'Wrong username or password');

        (req as any).user = { username: u, isAdmin, artistId };
        next();
    });

    // --- Core Endpoints ---

    router.all('/getLicense.view', (req, res) => {
        sendResponse(res, req, {
            license: {
                '@valid': true,
                '@email': 'admin@tunecamp.local',
                '@licenseExpires': '2099-01-01T00:00:00'
            }
        });
    });

    router.all('/getMusicFolders.view', (req, res) => {
        sendResponse(res, req, {
            musicFolders: { musicFolder: [{ '@id': 1, '@name': 'Music' }] }
        });
    });

    router.all(['/getIndexes.view', '/getArtists.view'], (req, res) => {
        if (!subsonicService) return sendError(res, req, 80, 'Subsonic service not initialized');
        const username = (req as any).user?.username || 'admin';
        const indexNodes = subsonicService.getIndexes(username);
        const rootKey = req.path.includes('getArtists') ? 'artists' : 'indexes';
        sendResponse(res, req, {
            [rootKey]: {
                '@lastModified': Date.now(),
                '@ignoredArticles': 'The El La Los Las Le Les',
                index: indexNodes
            }
        });
    });

    router.all('/getMusicDirectory.view', (req, res) => {
        if (!subsonicService) return sendError(res, req, 80, 'Subsonic service not initialized');
        const username = (req as any).user?.username || 'admin';
        const id = ensureString(req.query.id);
        if (!id) return sendError(res, req, 10, 'Missing parameter id');
        const directory = subsonicService.getMusicDirectory(id, username);
        if (!directory) return sendError(res, req, 70, 'Directory not found');
        sendResponse(res, req, { directory });
    });

    // --- Media Endpoints ---

    router.all('/getCoverArt.view', async (req, res) => {
        const id = ensureString(req.query.id);
        if (!id) return sendError(res, req, 10, 'Missing parameter id');

        let imagePath: string | null = null;
        let artistName: string | null = null;

        if (id.startsWith('ar_')) {
            const artistId = parseInt(id.substring(3));
            const artist = db.getArtist(artistId);
            if (artist) {
                artistName = artist.name;
                if (artist.photo_path) imagePath = artist.photo_path;
                else {
                    const albums = db.getAlbumsByArtist(artistId, VisibilityProfile.ALL_ACCESS);
                    for (const album of albums) {
                        if (album.cover_path) { imagePath = album.cover_path; break; }
                    }
                }
            }
        } else if (id.startsWith('al_')) {
            const albumId = parseInt(id.substring(3));
            const album = db.getAlbum(albumId);
            if (album?.cover_path) {
                imagePath = album.cover_path;
            } else {
                const artwork = db.getTrackExternalArtworkByAlbumId(albumId);
                if (artwork) imagePath = artwork;
            }
        } else if (id.startsWith('tr_')) {
            const track = db.getTrack(parseInt(id.substring(3)));
            if (track) {
                if (track.external_artwork) imagePath = track.external_artwork;
                else if (track.album_id) {
                    const album = db.getAlbum(track.album_id);
                    if (album?.cover_path) imagePath = album.cover_path;
                }
            }
        }

        if (imagePath) {
            if (imagePath.startsWith('http')) {
                try {
                    const response = await fetch(imagePath);
                    if (response.ok) {
                        const contentType = response.headers.get('content-type');
                        if (contentType) res.setHeader('Content-Type', contentType);
                        res.setHeader('Cache-Control', 'public, max-age=86400');
                        if (response.body) { (response.body as any).pipe(res); return; }
                    }
                } catch (error) { console.error('Error proxying image:', error); }
            }
            const sanitizedImagePath = imagePath.replace(/^@@[a-z0-9]+\\?/, "").replace(/\\/g, "/").replace(/\/+/g, "/");
            let fullPath = resolveSafePath(musicDir, sanitizedImagePath);
            if (fullPath && await fileExists(fullPath)) {
                res.setHeader('Cache-Control', 'public, max-age=86400');
                return res.sendFile(fullPath);
            }
        }
        if (artistName) {
            const svg = getPlaceholderSVG(artistName);
            res.setHeader("Content-Type", "image/svg+xml");
            res.setHeader("Cache-Control", "public, max-age=86400");
            return res.send(svg);
        }
        return sendError(res, req, 70, 'Cover art not found');
    });

    router.all('/stream.view', async (req, res) => {
        if (!mediaEngine) return sendError(res, req, 80, 'Media engine not initialized');
        const id = ensureString(req.query.id);
        const format = ensureString(req.query.format);
        const maxBitRate = ensureString(req.query.maxBitRate);
        const timeOffset = ensureString(req.query.timeOffset);
        if (!id) return sendError(res, req, 10, 'Missing parameter id');
        const trackId = parseInt(id.startsWith('tr_') ? id.substring(3) : id);
        if (isNaN(trackId)) return sendError(res, req, 10, 'Invalid id');
        try {
            const result = await mediaEngine.getStream({
                trackId, format, bitrate: maxBitRate, seek: timeOffset ? parseInt(timeOffset) : 0,
                range: req.headers.range as string | undefined
            });
            sendStreamResult(res, result);
        } catch (error: any) {
            if (error.message && error.message.startsWith("REDIRECT:")) return res.redirect(error.message.substring(9));
            if (error instanceof NotFoundError || error.statusCode === 404 || error.code === 'NOT_FOUND') {
                return sendError(res, req, 70, error.message || 'Track not found');
            }
            console.error('[Subsonic] Streaming error:', error);
            sendError(res, req, 80, 'Streaming failed');
        }
    });

    // --- Selection & Lists ---

    router.all(['/getAlbumList.view', '/getAlbumList2.view'], (req, res) => {
        if (!subsonicService) return sendError(res, req, 80, 'Subsonic service not initialized');
        const username = (req as any).user?.username || 'admin';
        const type = ensureString(req.query.type) || 'newest';
        const size = parseInt(ensureString(req.query.size) || '10');
        const offset = parseInt(ensureString(req.query.offset) || '0');
        const album = subsonicService.getAlbumList(type, size, offset, username);
        const wrapperKey = req.path.includes('getAlbumList2') ? 'albumList2' : 'albumList';
        sendResponse(res, req, { [wrapperKey]: { album } });
    });

    router.all('/getRandomSongs.view', (req, res) => {
        if (!subsonicService) return sendError(res, req, 80, 'Subsonic service not initialized');
        const username = (req as any).user?.username || 'admin';
        const size = parseInt(ensureString(req.query.size) || '10');
        const tracks = db.getRandomTracks(size);
        sendResponse(res, req, { randomSongs: { song: subsonicService.formatTracksBulk(tracks, username) } });
    });

    router.all(['/search.view', '/search2.view', '/search3.view'], (req, res) => {
        if (!subsonicService) return sendError(res, req, 80, 'Subsonic service not initialized');
        const username = (req as any).user?.username || 'admin';
        const query = ensureString(req.query.query);
        if (!query) return sendError(res, req, 10, 'Missing query');
        const results = subsonicService.search(query, username);
        const resName = req.path.includes('search3') ? 'searchResult3' : (req.path.includes('search2') ? 'searchResult2' : 'searchResult');
        sendResponse(res, req, { [resName]: results });
    });

    // --- User & Social ---

    router.all('/scrobble.view', async (req, res) => {
        const { id, submission: subRaw } = req.query as any;
        const submission = ensureString(subRaw) !== 'false';
        const ids = Array.isArray(id) ? id : [id];
        const username = (req as any).user.username;
        const trackIdsToProcess: number[] = [];
        for (const tid of ids) {
            if (!tid?.startsWith('tr_')) continue;
            trackIdsToProcess.push(parseInt(tid.substring(3)));
        }

        if (trackIdsToProcess.length > 0) {
            const tracks = db.getTracksByIds(trackIdsToProcess);
            const tracksMap = new Map();
            for (let i = 0; i < tracks.length; i++) {
                tracksMap.set(tracks[i].id, tracks[i]);
            }

            for (let i = 0; i < trackIdsToProcess.length; i++) {
                const trackId = trackIdsToProcess[i];
                if (submission) {
                    db.recordPlay(trackId, new Date().toISOString());
                    nowPlayingCache.set(username, { trackId, timestamp: Date.now() });
                    if (scrobbleService) {
                        const track = tracksMap.get(trackId);
                        if (track) {
                            scrobbleService.scrobble({
                                artist: track.artist_name || "Unknown Artist", title: track.title, album: track.album_title, duration: track.duration ?? undefined
                            }).catch((e: any) => console.error("[Subsonic] ScrobbleService failure:", e));
                        }
                    }
                } else if (scrobbleService) {
                    const track = tracksMap.get(trackId);
                    if (track) {
                        scrobbleService.updateNowPlaying({
                            artist: track.artist_name || "Unknown Artist", title: track.title, album: track.album_title
                        }).catch((e: any) => console.error("[Subsonic] NowPlaying update failure:", e));
                    }
                }
            }
        }
        sendResponse(res, req, {});
    });

    router.all('/getNowPlaying.view', (req, res) => {
        if (!subsonicService) return sendError(res, req, 80, 'Subsonic service not initialized');
        const entries: any[] = [];
        const now = Date.now();
        const fiveMinutes = 5 * 60 * 1000;
        const activePlays: { user: string; trackId: number; timestamp: number }[] = [];
        const trackIdsToFetch: number[] = [];
        for (const [user, data] of nowPlayingCache.entries()) {
            if (now - data.timestamp < fiveMinutes) {
                activePlays.push({ user, trackId: data.trackId, timestamp: data.timestamp });
                trackIdsToFetch.push(data.trackId);
            } else { nowPlayingCache.delete(user); }
        }
        if (trackIdsToFetch.length > 0) {
            const tracks = db.getTracksByIds(trackIdsToFetch);
            const trackMap = new Map();
            for (const t of tracks) { trackMap.set(t.id, t); }
            for (const play of activePlays) {
                const track = trackMap.get(play.trackId);
                if (track) {
                    const formatted = subsonicService.formatTrack(track, 'admin');
                    entries.push({ ...formatted, '@username': play.user, '@minutesAgo': Math.floor((now - play.timestamp) / 60000) });
                }
            }
        }
        sendResponse(res, req, { nowPlaying: { entry: entries } });
    });

    router.all('/getArtist.view', (req, res) => {
        if (!subsonicService) return sendError(res, req, 80, 'Subsonic service not initialized');
        const username = (req as any).user?.username || 'admin';
        const id = ensureString(req.query.id);
        if (!id) return sendError(res, req, 10, 'Missing parameter id');
        const artist = subsonicService.getArtist(id, username);
        if (!artist) return sendError(res, req, 70, 'Artist not found');
        sendResponse(res, req, { artist });
    });

    router.all('/getAlbum.view', (req, res) => {
        if (!subsonicService) return sendError(res, req, 80, 'Subsonic service not initialized');
        const username = (req as any).user?.username || 'admin';
        const id = ensureString(req.query.id);
        if (!id) return sendError(res, req, 10, 'Missing parameter id');
        const album = subsonicService.getAlbum(id, username);
        if (!album) return sendError(res, req, 70, 'Album not found');
        sendResponse(res, req, { album });
    });

    router.all(['/getArtistInfo.view', '/getArtistInfo2.view'], (req, res) => {
        const id = ensureString(req.query.id);
        if (!id) return sendError(res, req, 10, 'Missing parameter id');
        const artistId = parseInt(id.startsWith('ar_') ? id.substring(3) : id);
        const artist = db.getArtist(artistId);
        if (!artist) return sendError(res, req, 70, 'Artist not found');
        const wrapperKey = req.path.includes('getArtistInfo2') ? 'artistInfo2' : 'artistInfo';
        sendResponse(res, req, {
            [wrapperKey]: {
                '@biography': artist.bio || '', '@musicBrainzId': '', '@lastFmUrl': '',
                '@smallImageUrl': `getCoverArt.view?id=ar_${artist.id}`,
                '@mediumImageUrl': `getCoverArt.view?id=ar_${artist.id}`,
                '@largeImageUrl': `getCoverArt.view?id=ar_${artist.id}`,
                similarArtist: []
            }
        });
    });

    router.all(['/getAlbumInfo.view', '/getAlbumInfo2.view'], (req, res) => {
        const id = ensureString(req.query.id);
        if (!id) return sendError(res, req, 10, 'Missing parameter id');
        const albumId = parseInt(id.startsWith('al_') ? id.substring(3) : id);
        const album = db.getAlbum(albumId);
        if (!album) return sendError(res, req, 70, 'Album not found');
        const wrapperKey = req.path.includes('getAlbumInfo2') ? 'albumInfo2' : 'albumInfo';
        sendResponse(res, req, {
            [wrapperKey]: {
                '@notes': album.description || '', '@musicBrainzId': '', '@lastFmUrl': '',
                '@smallImageUrl': `getCoverArt.view?id=al_${album.id}`,
                '@mediumImageUrl': `getCoverArt.view?id=al_${album.id}`,
                '@largeImageUrl': `getCoverArt.view?id=al_${album.id}`
            }
        });
    });

    router.all('/getGenres.view', (req, res) => {
        if (!subsonicService) return sendError(res, req, 80, 'Subsonic service not initialized');
        const genre = subsonicService.getGenres();
        sendResponse(res, req, { genres: { genre } });
    });

    router.all(['/getStarred.view', '/getStarred2.view'], (req, res) => {
        if (!subsonicService) return sendError(res, req, 80, 'Subsonic service not initialized');
        const username = (req as any).user?.username || 'admin';
        const results = subsonicService.getStarred(username);
        const wrapper = req.path.includes('Starred2') ? 'starred2' : 'starred';
        sendResponse(res, req, { [wrapper]: results });
    });

    router.all('/getPlaylists.view', (req, res) => {
        if (!subsonicService) return sendError(res, req, 80, 'Subsonic service not initialized');
        const username = (req as any).user?.username || 'admin';
        const playlist = subsonicService.getPlaylists(username);
        sendResponse(res, req, { playlists: { playlist } });
    });

    router.all('/getPlaylist.view', (req, res) => {
        if (!subsonicService) return sendError(res, req, 80, 'Subsonic service not initialized');
        const username = (req as any).user?.username || 'admin';
        const idStr = ensureString(req.query.id);
        const id = parseInt(idStr?.startsWith('pl_') ? idStr.substring(3) : (idStr || ''));
        const playlist = subsonicService.getPlaylist(id, username);
        if (!playlist) return sendError(res, req, 70, 'Playlist not found');
        sendResponse(res, req, { playlist });
    });

    router.all('/createPlaylist.view', (req, res) => {
        const username = (req as any).user?.username || 'admin';
        const name = ensureString(req.query.name);
        if (!name) return sendError(res, req, 10, 'Missing name parameter');
        const playlistId = db.createPlaylist(name, username, '');
        const p = db.getPlaylist(playlistId);
        if (!p) return sendError(res, req, 70, 'Playlist creation failed');
        sendResponse(res, req, {
            playlist: {
                '@id': `pl_${p.id}`, '@name': p.name, '@owner': p.username, '@public': p.isPublic ? 'true' : 'false',
                '@created': p.created_at, '@songCount': 0
            }
        });
    });

    router.all('/deletePlaylist.view', (req, res) => {
        const idStr = ensureString(req.query.id);
        if (!idStr) return sendError(res, req, 10, 'Missing id parameter');
        const id = parseInt(idStr.startsWith('pl_') ? idStr.substring(3) : idStr);
        db.deletePlaylist(id);
        sendResponse(res, req, {});
    });

    router.all('/updatePlaylist.view', (req, res) => {
        const idStr = ensureString(req.query.playlistId);
        if (!idStr) return sendError(res, req, 10, 'Missing playlistId parameter');
        const id = parseInt(idStr.startsWith('pl_') ? idStr.substring(3) : idStr);
        const playlist = db.getPlaylist(id);
        if (!playlist) return sendError(res, req, 70, 'Playlist not found');
        const pub = ensureString(req.query.public);
        if (pub !== undefined) db.updatePlaylistVisibility(id, pub === 'true');
        const addIdsRaw = req.query.songIdToAdd;
        const addIds = (Array.isArray(addIdsRaw) ? addIdsRaw : (addIdsRaw ? [addIdsRaw] : [])).map(s => String(s));
        const removeIndexesRaw = req.query.songIndexToRemove;
        const removeIdxs = (Array.isArray(removeIndexesRaw) ? removeIndexesRaw : (removeIndexesRaw ? [removeIndexesRaw] : [])).map(i => parseInt(String(i), 10));
        let currentTracks = db.getPlaylistTracks(id);
        const toRemoveIndexes = [...removeIdxs].sort((a, b) => b - a);
        for (const idx of toRemoveIndexes) {
            if (idx >= 0 && idx < currentTracks.length) {
                const track = currentTracks[idx];
                db.removeTrackFromPlaylist(id, track.id);
            }
        }
        for (const tidStr of addIds) {
            const trackId = parseInt(tidStr.startsWith('tr_') ? tidStr.substring(3) : tidStr);
            if (!isNaN(trackId)) db.addTrackToPlaylist(id, trackId);
        }
        sendResponse(res, req, {});
    });

    router.all('/getUser.view', (req, res) => {
        const requestedUser = ensureString(req.query.username) || (req as any).user.username;
        sendResponse(res, req, {
            user: {
                '@username': requestedUser, '@email': 'admin@tunecamp.local', '@scrobblingEnabled': true,
                '@adminRole': true, '@settingsRole': true, '@downloadRole': true, '@uploadRole': true,
                '@playlistRole': true, '@coverArtRole': true, '@commentRole': true, '@podcastRole': true,
                '@streamRole': true, '@jukeboxRole': true, '@shareRole': true, '@videoConversionRole': true
            }
        });
    });

    router.all('/getScanStatus.view', (req, res) => {
        sendResponse(res, req, { scanStatus: { '@scanning': 'false', '@count': 0 } });
    });

    router.all(['/getPodcasts.view', '/getPodcasts'], (req, res) => {
        if (!subsonicService) return sendError(res, req, 80, 'Subsonic service not initialized');
        const username = (req as any).user?.username || 'admin';
        const userObj = (db as any).db.prepare("SELECT id, role, artist_id, is_active FROM admin WHERE username = ?").get(username);
        const context = userObj ? {
            userId: userObj.id,
            artistId: userObj.artist_id,
            role: VisibilityGuardian.deriveRole(userObj.role, userObj.is_active !== 0)
        } : { role: UserRole.GUEST };

        const id = ensureString(req.query.id);
        const includeEpisodes = ensureString(req.query.includeEpisodes) !== 'false';
        
        const channels = subsonicService.getPodcasts(id, includeEpisodes, context);
        if (id && channels.length === 0) {
            return sendError(res, req, 70, 'Podcast not found');
        }
        sendResponse(res, req, { podcasts: { channel: channels } });
    });

    router.all(['/getNewestPodcasts.view', '/getNewestPodcasts'], (req, res) => {
        if (!subsonicService) return sendError(res, req, 80, 'Subsonic service not initialized');
        const username = (req as any).user?.username || 'admin';
        const userObj = (db as any).db.prepare("SELECT id, role, artist_id, is_active FROM admin WHERE username = ?").get(username);
        const context = userObj ? {
            userId: userObj.id,
            artistId: userObj.artist_id,
            role: VisibilityGuardian.deriveRole(userObj.role, userObj.is_active !== 0)
        } : { role: UserRole.GUEST };

        const countStr = ensureString(req.query.count);
        const offsetStr = ensureString(req.query.offset);
        const size = Math.min(countStr ? parseInt(countStr, 10) : 20, 500);
        const offset = offsetStr ? parseInt(offsetStr, 10) : 0;

        const episodes = subsonicService.getNewestPodcasts(size, offset, context);
        sendResponse(res, req, { newestPodcasts: { episode: episodes } });
    });

    // --- OpenSubsonic Extensions ---

    router.all(['/getOpenSubsonicExtensions.view', '/getOpenSubsonicExtensions'], (req, res) => {
        sendResponse(res, req, {
            openSubsonicExtensions: {
                extension: [
                    { '@name': 'openSubsonic', '@versions': '1' },
                    { '@name': 'songList', '@versions': '1' },
                    { '@name': 'formPost', '@versions': '1' },
                    { '@name': 'playQueue', '@versions': '1' }
                ]
            }
        });
    });

    // --- Bookmarks ---

    router.all(['/getBookmarks.view', '/getBookmarks'], (req, res) => {
        if (!subsonicService) return sendError(res, req, 80, 'Subsonic service not initialized');
        const username = (req as any).user?.username || 'admin';
        const bookmarks = db.getBookmarks(username);
        const bookmarkEntries: any[] = [];
        
        if (bookmarks && bookmarks.length > 0) {
            const trackIds = bookmarks.map((b: any) => {
                const raw = String(b.track_id);
                return parseInt(raw.startsWith('tr_') ? raw.substring(3) : raw);
            }).filter((id: number) => !isNaN(id));
            
            const tracks = db.getTracksByIds(trackIds);
            const trackMap = new Map<number, Track>(tracks.map((t: Track) => [t.id, t]));
            
            for (const b of bookmarks) {
                const raw = String(b.track_id);
                const trackId = parseInt(raw.startsWith('tr_') ? raw.substring(3) : raw);
                const track = trackMap.get(trackId);
                if (track) {
                    bookmarkEntries.push({
                        '@position': b.position_ms,
                        '@username': b.username,
                        '@comment': b.comment || '',
                        '@created': b.created_at,
                        '@changed': b.updated_at || b.created_at,
                        entry: subsonicService.formatTrack(track, username)
                    });
                }
            }
        }
        sendResponse(res, req, { bookmarks: { bookmark: bookmarkEntries } });
    });

    router.all(['/createBookmark.view', '/createBookmark'], (req, res) => {
        const username = (req as any).user?.username || 'admin';
        const idStr = ensureString(req.query.id);
        const positionStr = ensureString(req.query.position);
        const comment = ensureString(req.query.comment);
        if (!idStr) return sendError(res, req, 10, 'Missing id parameter');
        const position = positionStr ? parseInt(positionStr, 10) : 0;
        const trackId = idStr.startsWith('tr_') ? idStr.substring(3) : idStr;
        db.createBookmark(username, trackId, position, comment);
        sendResponse(res, req, {});
    });

    router.all(['/deleteBookmark.view', '/deleteBookmark'], (req, res) => {
        const username = (req as any).user?.username || 'admin';
        const idStr = ensureString(req.query.id);
        if (!idStr) return sendError(res, req, 10, 'Missing id parameter');
        const trackId = idStr.startsWith('tr_') ? idStr.substring(3) : idStr;
        db.deleteBookmark(username, trackId);
        sendResponse(res, req, {});
    });

    // --- Play Queue ---

    router.all(['/getPlayQueue.view', '/getPlayQueue'], (req, res) => {
        if (!subsonicService) return sendError(res, req, 80, 'Subsonic service not initialized');
        const username = (req as any).user?.username || 'admin';
        const queue = db.getPlayQueue(username);
        
        if (!queue || !queue.trackIds || queue.trackIds.length === 0) {
            return sendResponse(res, req, { playQueue: {} });
        }

        const trackIds = queue.trackIds.map((idStr: string) => {
            const raw = String(idStr);
            return parseInt(raw.startsWith('tr_') ? raw.substring(3) : raw);
        }).filter((id: number) => !isNaN(id));

        const tracks = db.getTracksByIds(trackIds);
        const trackMap = new Map<number, Track>(tracks.map((t: Track) => [t.id, t]));
        const entries: any[] = [];
        for (const tid of trackIds) {
            const t = trackMap.get(tid);
            if (t) entries.push(subsonicService.formatTrack(t, username));
        }

        const currentId = queue.current ? (String(queue.current).startsWith('tr_') ? queue.current : `tr_${queue.current}`) : undefined;

        sendResponse(res, req, {
            playQueue: {
                '@current': currentId,
                '@position': queue.positionMs || 0,
                '@username': username,
                entry: entries
            }
        });
    });

    router.all(['/savePlayQueue.view', '/savePlayQueue'], (req, res) => {
        const username = (req as any).user?.username || 'admin';
        const current = ensureString(req.query.current) || null;
        const positionStr = ensureString(req.query.position);
        const position = positionStr ? parseInt(positionStr, 10) : 0;
        
        const idRaw = req.query.id;
        const ids: string[] = (Array.isArray(idRaw) ? idRaw : (idRaw ? [idRaw] : [])).map(s => String(s));
        
        const trackIds = ids.map(idStr => idStr.startsWith('tr_') ? idStr.substring(3) : idStr);
        const currentTrackId = current ? (current.startsWith('tr_') ? current.substring(3) : current) : null;
        
        db.savePlayQueue(username, trackIds, currentTrackId, position);
        sendResponse(res, req, {});
    });

    // --- Avatar ---

    router.all(['/getAvatar.view', '/getAvatar'], async (req, res) => {
        const username = ensureString(req.query.username) || (req as any).user?.username || 'admin';
        
        const user = (db as any).db.prepare("SELECT avatar, artist_id FROM admin WHERE username = ? COLLATE NOCASE").get(username);
        let avatarPath: string | null = user?.avatar || null;
        
        if (!avatarPath && user?.artist_id) {
            const artist = db.getArtist(user.artist_id);
            if (artist?.photo_path) avatarPath = artist.photo_path;
        }

        if (avatarPath) {
            if (avatarPath.startsWith('http://') || avatarPath.startsWith('https://')) {
                try {
                    const response = await fetch(avatarPath);
                    if (response.ok) {
                        const contentType = response.headers.get('content-type');
                        if (contentType) res.setHeader('Content-Type', contentType);
                        res.setHeader('Cache-Control', 'public, max-age=86400');
                        if (response.body) { (response.body as any).pipe(res); return; }
                    }
                } catch (error) {
                    console.error('Error proxying avatar:', error);
                }
            } else {
                const sanitizedPath = avatarPath.replace(/^@@[a-z0-9]+\\?/, "").replace(/\\/g, "/").replace(/\/+/g, "/");
                let fullPath = resolveSafePath(musicDir, sanitizedPath);
                if (fullPath && await fileExists(fullPath)) {
                    res.setHeader('Cache-Control', 'public, max-age=86400');
                    return res.sendFile(fullPath);
                }
            }
        }

        const svg = getPlaceholderSVG(username);
        res.setHeader("Content-Type", "image/svg+xml");
        res.setHeader("Cache-Control", "public, max-age=86400");
        return res.send(svg);
    });

    router.use((req, res) => {
        console.warn(`[Subsonic] Unknown request: ${req.method} ${req.path}`);
        sendError(res, req, 0, `Unknown Subsonic request: ${req.path}`);
    });

    return router;
};
