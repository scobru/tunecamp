import * as Sentry from "@sentry/node";
import express from "express";
import cors from "cors";
import compression from "compression";
import path from "path";
import fs from "fs-extra";
import { fileURLToPath } from "url";
import type { ServerConfig } from "./core/config.js";
import type { DatabaseService as Database } from "./core/database.js";
import { securityHeaders } from "./middleware/security.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { errorHandler } from "./middleware/error-handling.js";

const _serverFilename = fileURLToPath(import.meta.url);
const _serverDirname = path.dirname(_serverFilename);

export interface AppSetupResult {
    app: express.Express;
    publicFederationCors: express.RequestHandler;
    strictCors: express.RequestHandler;
}

export function createApp(config: ServerConfig): AppSetupResult {
    const app = express();
    app.set('trust proxy', true); // Required for CapRover/Nginx

    // Middleware
    app.use(compression());
    app.use(securityHeaders);
    
    // API Rate limit
    app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 })); 
    app.use('/rest', rateLimit({ windowMs: 15 * 60 * 1000, max: 5000 }));

    const corsOrigin = config.corsOrigins && config.corsOrigins.length > 0 ? config.corsOrigins : false;
    const strictCors = cors({ origin: corsOrigin, credentials: true });

    // Public federation endpoints must be cross-origin accessible regardless of
    // TUNECAMP_CORS_ORIGINS — they are the federation surface the website and
    // peer crawlers fetch from arbitrary origins. However, wildcard CORS should
    // only apply to safe read operations. Mutations (like POST /register) must
    // use strict CORS to prevent CSRF.
    const publicCors = cors({ origin: '*', credentials: false, methods: ['GET', 'HEAD', 'OPTIONS'] });

    const publicFederationCors = (req: express.Request, res: express.Response, next: express.NextFunction) => {
        const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
        const reqMethod = req.headers['access-control-request-method'];
        const isMutationPreflight = req.method === 'OPTIONS' && reqMethod &&
            typeof reqMethod === 'string' && !['GET', 'HEAD', 'OPTIONS'].includes(reqMethod.toUpperCase());

        const hasCredentials = !!req.headers.cookie || !!req.headers.authorization;
        const isCredentialsPreflight = req.method === 'OPTIONS' &&
            typeof req.headers['access-control-request-headers'] === 'string' &&
            req.headers['access-control-request-headers'].split(',').map(h => h.trim().toLowerCase()).includes('authorization');

        if (isMutation || isMutationPreflight || hasCredentials || isCredentialsPreflight) {
            strictCors(req, res, next);
        } else {
            publicCors(req, res, (err?: any) => {
                if (err) return next(err);
                res.locals.skipStrictCors = true;
                next();
            });
        }
    };

    app.use('/api/community', publicFederationCors);
    app.use('/api/catalog', publicFederationCors);
    app.use('/api/samples', publicFederationCors);
    app.use('/api/sample-packs', publicFederationCors);
    app.use('/api/auth/zen/user', publicFederationCors);
    app.use('/api/auth/zen/verify', publicFederationCors);
    
    // Subsonic API must be accessible to cross-origin web clients (like TuneCamp Audiofabric)
    app.use('/rest', publicFederationCors);

    // GET /api/tracks/:id/stream (and other track reads) must also be reachable
    // cross-origin — this is what the Lab SDK's getLibrary bridge hands to iframed
    // apps like Audiofabric. Already per-request authorized via the ?token= query
    // param (canConsumeTrack), same model as /rest above, so opening GET CORS here
    // grants nothing a token holder couldn't already fetch directly.
    app.use('/api/tracks', publicFederationCors);

    // POST /api/auth/zen/sso is called by the FID identity portal, which is by design a
    // different origin (and may be one the user self-hosts), so the origin cannot be the
    // security boundary here — the signed SSO token is. The request carries no cookies and,
    // in code mode, hands the portal nothing but a one-time code. /sso/exchange is
    // deliberately excluded: only the user's own webapp may trade a code for a session.
    const ssoPortalCors = cors({ origin: '*', credentials: false, methods: ['POST', 'OPTIONS'] });
    app.use('/api/auth/zen/sso', (req, res, next) => {
        if (req.path !== '/' || !!req.headers.cookie || !!req.headers.authorization) return next();
        ssoPortalCors(req, res, (err?: any) => {
            if (err) return next(err);
            res.locals.skipStrictCors = true;
            next();
        });
    });

    // POST /api/auth/zen/link is called by the FID identity portal to register a
    // cross-instance link. The portal authenticates via a Zen SEA signed challenge
    // (zenPubKey + seaSignature), not a session cookie, so it must be accessible
    // cross-origin and cannot rely on authMiddleware.requireUser.
    const linkPortalCors = cors({ origin: '*', credentials: false, methods: ['POST', 'OPTIONS'] });
    app.use('/api/auth/zen/link', (req, res, next) => {
        if (req.path !== '/' || !!req.headers.cookie || !!req.headers.authorization) return next();
        linkPortalCors(req, res, (err?: any) => {
            if (err) return next(err);
            res.locals.skipStrictCors = true;
            next();
        });
    });

    // GET /api/auth/zen/challenge is step 1 of the same portal flow /link completes, so
    // it needs the same cross-origin allowance — without it the portal's fetch is blocked
    // by the browser before it ever reaches the route. It hands out nothing but a nonce;
    // the signature verified in /link is what authenticates.
    const challengePortalCors = cors({ origin: '*', credentials: false, methods: ['GET', 'OPTIONS'] });
    app.use('/api/auth/zen/challenge', (req, res, next) => {
        if (req.path !== '/' || !!req.headers.cookie || !!req.headers.authorization) return next();
        challengePortalCors(req, res, (err?: any) => {
            if (err) return next(err);
            res.locals.skipStrictCors = true;
            next();
        });
    });

    // GET /api/chat/history, /api/chat/peers, and /api/chat/rooms are accessed by
    // standalone and desktop chat clients (e.g. sidecamp, tunecamp-chat-client) from arbitrary origins.
    // Auth is Bearer-only (no cookie sessions), so cross-origin requests carry no CSRF risk.
    const chatCors = cors({ origin: '*', credentials: false, methods: ['GET', 'POST', 'DELETE', 'OPTIONS'] });
    const chatCorsMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
        chatCors(req, res, (err?: any) => {
            if (err) return next(err);
            res.locals.skipStrictCors = true;
            next();
        });
    };
    app.use('/api/chat/history', chatCorsMiddleware);
    app.use('/api/chat/peers', chatCorsMiddleware);
    app.use('/api/chat/pubkey', chatCorsMiddleware);
    app.use('/api/chat/rooms', chatCorsMiddleware);

    app.use((req, res, next) => {
        if (res.locals.skipStrictCors) {
            return next();
        }
        strictCors(req, res, next);
    });

    return { app, publicFederationCors, strictCors };
}

export function setupStaticAndFallbackRoutes(app: express.Express, config: ServerConfig, database: Database): void {
    const webappPath = path.join(_serverDirname, "..", "..", "webapp");
    const webappDistPath = path.join(webappPath, "dist");
    const webappPublicPath = path.join(webappPath, "public");

    const findStaticFile = (filename: string) => {
        const candidates = [
            path.join(webappDistPath, filename),
            path.join(webappPath, filename),
            path.join(webappPublicPath, filename),
            path.join(process.cwd(), "webapp", "dist", filename),
            path.join(process.cwd(), "webapp", "public", filename),
            path.join(process.cwd(), "webapp", filename),
            "/app/webapp/dist/" + filename,
            "/app/webapp/public/" + filename,
        ];
        return candidates.find(p => fs.existsSync(p));
    };

    app.get("/sw.js", (req, res) => {
        const foundPath = findStaticFile("sw.js");
        if (foundPath) return res.sendFile(path.resolve(foundPath));
        res.status(404).send("sw.js not found");
    });

    app.get("/manifest.json", (req, res) => {
        const foundPath = findStaticFile("manifest.json");
        if (foundPath) return res.sendFile(path.resolve(foundPath));
        res.status(404).json({ error: "manifest.json not found" });
    });

    if (fs.existsSync(webappDistPath)) app.use(express.static(webappDistPath, { index: false }));
    if (fs.existsSync(webappPublicPath)) app.use(express.static(webappPublicPath, { index: false }));
    app.use(express.static(webappPath, { index: false }));

    const indexHtmlPath = fs.existsSync(path.join(webappDistPath, "index.html")) 
        ? path.join(webappDistPath, "index.html") 
        : path.join(webappPath, "index.html");

    let cachedIndexHtml: string | null = null;
    const getCachedHtml = () => {
        if (cachedIndexHtml && process.env.NODE_ENV === 'production') return cachedIndexHtml;
        try {
            const html = fs.readFileSync(indexHtmlPath, 'utf8');
            if (process.env.NODE_ENV === 'production') cachedIndexHtml = html;
            return html;
        } catch (e) { return "Error loading app"; }
    };

    app.get("/share/:id", async (req, res) => {
        const { id } = req.params;
        let title = "Shared from TuneCamp", description = "Music shared via TuneCamp", image = "";
        if (id.startsWith('tr_')) {
            const track = database.getTrack(parseInt(id.substring(3)));
            if (track) { title = track.title || "Track"; description = `Track by ${track.artist_name || 'Unknown Artist'}`; image = `/api/tracks/${track.id}/cover`; }
        } else if (id.startsWith('al_')) {
            const album = database.getAlbum(parseInt(id.substring(3)));
            if (album) { title = album.title || "Album"; description = `Album by ${album.artist_name || 'Unknown Artist'}`; image = `/api/albums/${album.id}/cover`; }
        }
        try {
            let html = getCachedHtml();
            const publicUrl = (database.getSetting("publicUrl") || config.publicUrl || `${req.protocol}://${req.get('host')}`).trim().replace(/\/$/, "");
            const ogTags = `<meta property="og:title" content="${title}" /><meta property="og:description" content="${description}" /><meta property="og:image" content="${publicUrl}${image}" />`;
            html = html.replace('<head>', '<head>' + ogTags);
            res.send(html);
        } catch (e) { res.redirect(`/#/share/${id}`); }
    });

    app.get("/@:slug", (req, res) => {
        const { slug } = req.params;
        try {
            const artist = database.getArtistBySlug(slug);
            if (artist) {
                let html = getCachedHtml();
                const publicUrl = (database.getSetting("publicUrl") || config.publicUrl || `${req.protocol}://${req.get('host')}`).trim().replace(/\/$/, "");
                const title = artist.name || "Artist Profile";
                const description = artist.bio || `Listen to ${artist.name} on TuneCamp`;
                const image = `/api/artists/${artist.id}/cover`;
                const ogTags = `<meta property="og:title" content="${title}" /><meta property="og:description" content="${description}" /><meta property="og:image" content="${publicUrl}${image}" />`;
                html = html.replace('<head>', '<head>' + ogTags);
                return res.send(html);
            }
        } catch (e) {
            // fall through to default
        }
        res.send(getCachedHtml());
    });

    app.get("*", (req, res) => {
        if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Not found" });
        res.send(getCachedHtml());
    });

    // Captures unhandled route errors to Sentry (no-op when SENTRY_DSN is unset),
    // then falls through to our own errorHandler for the actual response.
    Sentry.setupExpressErrorHandler(app);
    app.use(errorHandler);
}
