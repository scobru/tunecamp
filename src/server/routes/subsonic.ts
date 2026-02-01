
import { Router } from 'express';
import { create } from 'xmlbuilder2';
import md5 from 'md5';
import type { DatabaseService } from '../database';
import type { AuthService } from '../auth';

// Types for Subsonic
interface SubsonicContext {
    db: DatabaseService;
    auth: AuthService;
}

export const createSubsonicRouter = (context: SubsonicContext) => {
    const router = Router();
    const { db, auth } = context;

    // --- Helpers ---

    const createResponse = (data: any, version = '1.16.1') => {
        const root = create({ version: '1.0', encoding: 'UTF-8' })
            .ele('subsonic-response', {
                xmlns: 'http://subsonic.org/restapi',
                status: 'ok',
                version
            });

        // Recursively add data
        const addNodes = (parent: any, obj: any) => {
            for (const key in obj) {
                if (key === '_attr') {
                    // Attributes for parent
                    for (const attrKey in obj[key]) {
                        parent.att(attrKey, obj[key][attrKey]);
                    }
                } else if (Array.isArray(obj[key])) {
                    // Array of elements
                    // E.g. musicFolders: [{id: 1, name: 'Music'}] -> <musicFolder id="1" .../>
                    // Valid XML usually expects wrapped lists or repeated elements. 
                    // Subsonic usually does: <musicFolders><musicFolder .../><musicFolder .../></musicFolders> which matches structure.
                    // But if key is "entry", it might be direct chidren.
                    // Let's assume the passed data structure matches XML structure.
                    obj[key].forEach((item: any) => {
                        // We need the singular name for the array item if it's a list.
                        // Usually we pass explicit structure.
                        // Simplification: We will construct explicit objects in endpoints
                        // subNode = parent.ele(key) is WRONG for arrays. 
                        // We usually expect `child: [{...}, {...}]`
                        // In xmlbuilder2:
                        /*
                           obj = { musicFolders: { musicFolder: [ ... ] } }
                        */
                    });
                } else if (typeof obj[key] === 'object') {
                    const node = parent.ele(key);
                    addNodes(node, obj[key]);
                } else {
                    // Attribute or text? Subsonic is mostly attributes.
                    // But if we want text: parent.txt(val)
                    // Strategy: Start clean. Endpoints return formatted object compatible with xmlbuilder or we build it there.
                }
            }
        };

        // Easier: Just convert object form
        // const root = create().ele('subsonic-response', { status: 'ok', version }).ele(data);
        // But we need to handle "error" status.
        return root;
    };

    // Simple helper to wrap XML response
    const sendXML = (res: any, data: object) => {
        const doc = create({ version: '1.0', encoding: 'UTF-8' })
            .ele('subsonic-response', { xmlns: 'http://subsonic.org/restapi', status: 'ok', version: '1.16.1' });

        // Merge data
        // xmlbuilder2 supports converting logic object to XML
        // We expect `data` to be e.g. { musicFolders: { musicFolder: [...] } }
        // We need to inject it into `doc`.
        // `import` method might work or manual construction.
        // Let's try explicit construction via object update if possible or manual.

        // Simplest: pass a callback to build the inner xml?
        // Or just passing the object to `ele` often works in libraries.
        doc.ele(data);

        const xml = doc.end({ prettyPrint: true });
        res.set('Content-Type', 'text/xml');
        res.send(xml);
    };

    const sendError = (res: any, code: number, message: string) => {
        const doc = create({ version: '1.0', encoding: 'UTF-8' })
            .ele('subsonic-response', { xmlns: 'http://subsonic.org/restapi', status: 'failed', version: '1.16.1' })
            .ele('error', { code: String(code), message }).up();

        const xml = doc.end({ prettyPrint: true });
        res.set('Content-Type', 'text/xml');
        res.send(xml);
    };

    // --- Middleware ---

    router.use(async (req, res, next) => {
        // Log URL for debug
        // console.log('Subsonic:', req.method, req.originalUrl);

        const { u, p, t, s, v, c } = req.query as any;

        if (!u) return sendError(res, 10, 'Parameter u is missing');

        // 1. Token Auth (NOT SUPPORTED due to bcrypt) -> Fallback check or Fail?
        // Actually, if we use Token auth, we can't verify unless we have the password.
        // So we strictly fail Token auth and hope client falls back to Legacy?
        // Some clients require Token auth. 
        // Force Legacy: Returns code 40 (Wrong password)??
        // Wait, if I can't support it, I should implement it via a workaround later.
        // For now, let's implement Legacy only.

        let authorized = false;

        // 2. Legacy Auth (Hex encoded)
        if (p && p.startsWith('enc:')) {
            const hex = p.substring(4);
            const password = Buffer.from(hex, 'hex').toString('utf8');
            const result = await auth.authenticateUser(u, password);
            if (result && result.success) authorized = true;
        } else if (p) {
            const password = Buffer.from(p, 'hex').toString('utf8');
            const result = await auth.authenticateUser(u, password);
            if (result && result.success) authorized = true;
        }

        // 3. Token Auth Check (Bypass/Trick?)
        // If query has t (token) and s (salt), we technically can't verify.
        // UNLESS we are in "Testing Mode" or generic admin.
        // Let's Log it.
        // Realistically, for this to work, we'd need to change Tunecamp to store MD5s or plain text (bad).

        if (!authorized && t && s) {
            // We can't verify. Send error 40 "Wrong password" to prompt user?
            // Or error 41 "Token authentication not supported"? (Not a standard code)
            // Let's stick to fail.
        }

        if (!authorized) {
            // Delay to prevent timing attacks?
            return sendError(res, 40, 'Wrong username or password');
        }

        // Add user to request?
        (req as any).user = { username: u };
        next();
    });

    // --- Endpoints ---

    router.get('/ping.view', (req, res) => {
        sendXML(res, {}); // Empty data, just status=ok
    });

    router.get('/getLicense.view', (req, res) => {
        sendXML(res, {
            license: {
                '@valid': 'true',
                '@email': 'user@example.com',
                '@licenseExpires': '2099-01-01T00:00:00'
            }
        });
    });

    // Compatibility for clients checking API
    // DSub often checks these
    router.post('/ping.view', (req, res) => { sendXML(res, {}); });
    router.post('/getLicense.view', (req, res) => {
        sendXML(res, {
            license: {
                '@valid': 'true',
                '@email': 'user@example.com',
                '@licenseExpires': '2099-01-01T00:00:00'
            }
        });
    });

    // --- Browsing ---

    const getMusicFolders = (req: any, res: any) => {
        sendXML(res, {
            musicFolders: {
                musicFolder: [
                    { '@id': 1, '@name': 'Music' }
                ]
            }
        });
    };

    const getIndexes = (req: any, res: any) => {
        const artists = db.getArtists();
        const indexes: Record<string, any[]> = {};

        // Group by first letter
        artists.forEach(artist => {
            let char = artist.name.charAt(0).toUpperCase();
            if (!/[A-Z]/.test(char)) char = '#';
            if (!indexes[char]) indexes[char] = [];

            indexes[char].push({
                '@id': `ar_${artist.id}`,
                '@name': artist.name,
                '@coverArt': `ar_${artist.id}`,
                '@artistImageUrl': `/api/artists/${artist.id}/cover`
            });
        });

        const sortedKeys = Object.keys(indexes).sort();
        const indexNodes = sortedKeys.map(key => ({
            '@name': key,
            artist: indexes[key]
        }));

        sendXML(res, {
            indexes: {
                '@lastModified': new Date().getTime(),
                '@ignoredArticles': 'The El La Los Las Le Les',
                index: indexNodes
            }
        });
    };

    const getMusicDirectory = (req: any, res: any) => {
        const { id } = req.query as any;
        if (!id) return sendError(res, 10, 'Missing parameter id');

        // Handle Artist -> Return Albums
        if (id.startsWith('ar_')) {
            const artistId = parseInt(id.substring(3));
            const artist = db.getArtist(artistId);
            if (!artist) return sendError(res, 70, 'Artist not found');

            const albums = db.getAlbumsByArtist(artistId);

            const directory = {
                '@id': id,
                '@name': artist.name,
                '@parent': '1',
                child: albums.map(album => ({
                    '@id': `al_${album.id}`,
                    '@title': album.title,
                    '@parent': id,
                    '@artist': artist.name,
                    '@isDir': 'true',
                    '@coverArt': `al_${album.id}`,
                    '@album': album.title,
                    '@year': album.date ? new Date(album.date).getFullYear() : undefined
                }))
            };
            return sendXML(res, { directory });
        }

        // Handle Album -> Return Tracks
        if (id.startsWith('al_')) {
            const albumId = parseInt(id.substring(3));
            const album = db.getAlbum(albumId);
            if (!album) return sendError(res, 70, 'Album not found');

            const tracks = db.getTracks(albumId);

            const directory = {
                '@id': id,
                '@name': album.title,
                '@parent': `ar_${album.artist_id}`,
                child: tracks.map((track: any) => ({
                    '@id': `tr_${track.id}`,
                    '@title': track.title,
                    '@album': album.title,
                    '@artist': track.artist_name || album.artist_name,
                    '@track': track.track_num,
                    '@year': album.date ? new Date(album.date).getFullYear() : undefined,
                    '@genre': album.genre,
                    '@coverArt': `al_${albumId}`,
                    '@size': 0,
                    '@contentType': 'audio/mpeg',
                    '@suffix': track.format || 'mp3',
                    '@duration': Math.floor(track.duration || 0),
                    '@bitRate': track.bitrate ? Math.round(track.bitrate / 1000) : 128,
                    '@path': track.file_path,
                    '@isDir': 'false'
                }))
            };
            return sendXML(res, { directory });
        }

        return sendError(res, 70, 'Directory not found');
    };

    router.get('/getMusicFolders.view', getMusicFolders);
    router.post('/getMusicFolders.view', getMusicFolders);

    router.get('/getIndexes.view', getIndexes);
    router.post('/getIndexes.view', getIndexes);

    router.get('/getMusicDirectory.view', getMusicDirectory);
    router.post('/getMusicDirectory.view', getMusicDirectory);

    return router;
};
