import { Router, json } from "express";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import type { ServiceContainer } from "../../core/container.js";
import { VisibilityProfile } from "../../common/visibility.js";

// Account portability (Mastodon data-portability model). Auth stays per-instance,
// so this moves *account data* — not credentials. The user registers manually on
// the target instance, logs in, then imports the archive. Followers of an artist
// are redirected separately via the existing ActivityPub Move (/api/ap/identity/move).
//
// Scope (Phase 1): profile identity link + playlists. Following is instance-global
// here (remote_actors.is_followed), not per-account, so it is not portable data.
// Purchases/collection stay local to the artist's instance by design.

export const ARCHIVE_VERSION = 1;
const MAX_PLAYLISTS = 500;
const MAX_TRACKS_PER_PLAYLIST = 2000;

interface ArchiveTrack {
    title: string;
    artist?: string;
    duration?: number;
}
export interface ArchivePlaylist {
    name: string;
    description?: string;
    is_public?: boolean;
    tracks: ArchiveTrack[];
}
export interface MigrationArchive {
    version: number;
    source_instance?: string;
    actor_uri?: string;
    username?: string;
    exported_at?: string;
    playlists: ArchivePlaylist[];
}

/** Validate an untrusted uploaded archive at the trust boundary. Throws on bad shape. */
export function validateArchive(a: any): MigrationArchive {
    if (!a || typeof a !== "object") throw new Error("Invalid archive");
    if (a.version !== ARCHIVE_VERSION) throw new Error(`Unsupported archive version: ${a.version}`);
    if (!Array.isArray(a.playlists)) throw new Error("archive.playlists must be an array");
    if (a.playlists.length > MAX_PLAYLISTS) throw new Error(`Too many playlists (max ${MAX_PLAYLISTS})`);
    for (const p of a.playlists) {
        if (!p || typeof p.name !== "string" || !Array.isArray(p.tracks)) {
            throw new Error("Invalid playlist entry");
        }
        if (p.tracks.length > MAX_TRACKS_PER_PLAYLIST) {
            throw new Error(`Playlist "${p.name}" has too many tracks (max ${MAX_TRACKS_PER_PLAYLIST})`);
        }
    }
    return a as MigrationArchive;
}

export interface ResolvedPlaylist {
    name: string;
    description: string;
    is_public: boolean;
    trackIds: number[];
}
export interface SkippedTrack {
    playlist: string;
    title: string;
    artist: string;
}

/**
 * Match each archived playlist's tracks against the local catalog. Pure so it is
 * unit-testable without a DB: `findTrack` is injected. Tracks that don't resolve
 * on this instance are collected in `skipped` (report, don't fail).
 */
export function resolvePlaylists(
    playlists: ArchivePlaylist[],
    findTrack: (title: string, artist: string) => number | null,
): { resolved: ResolvedPlaylist[]; skipped: SkippedTrack[] } {
    const resolved: ResolvedPlaylist[] = [];
    const skipped: SkippedTrack[] = [];

    for (const p of playlists) {
        const trackIds: number[] = [];
        for (const t of p.tracks) {
            const artist = (t.artist || "").trim();
            const id = findTrack((t.title || "").trim(), artist);
            if (id != null) trackIds.push(id);
            else skipped.push({ playlist: p.name, title: t.title || "", artist });
        }
        resolved.push({
            name: p.name,
            description: p.description || "",
            is_public: !!p.is_public,
            trackIds,
        });
    }
    return { resolved, skipped };
}

export function createAccountMigrationRoutes(container: ServiceContainer): Router {
    const { library, database, config, apService } = container;
    const router = Router();
    router.use(json({ limit: "5mb" }));

    const baseUrl = () =>
        (database.getSetting("publicUrl") || config.publicUrl || "").trim().replace(/\/$/, "");

    const actorUriFor = (req: AuthenticatedRequest): string | null => {
        const url = baseUrl();
        if (!url) return null;
        // Artist accounts federate under their artist slug; plain users under username.
        if (req.artistId) {
            const artist = database.getArtist(Number(req.artistId));
            if (artist) return `${url}/users/${artist.slug}`;
        }
        return req.username ? `${url}/users/${req.username}` : null;
    };

    // Case-insensitive title+artist lookup against the local catalog. Falls back to
    // a title-only match when the archived track carries no artist.
    const findLocalTrack = (title: string, artist: string): number | null => {
        if (!title) return null;
        const row = artist
            ? database.db.prepare(
                `SELECT id FROM tracks
                 WHERE lower(title) = lower(?) AND lower(coalesce(artist_name, '')) = lower(?)
                 LIMIT 1`,
            ).get(title, artist)
            : database.db.prepare(`SELECT id FROM tracks WHERE lower(title) = lower(?) LIMIT 1`).get(title);
        return (row as any)?.id ?? null;
    };

    /**
     * GET /api/account/export
     * Download a portable archive of the logged-in account's profile + playlists.
     */
    router.get("/export", (req: AuthenticatedRequest, res) => {
        if (!req.username) return res.status(401).json({ error: "Unauthorized" });
        try {
            // ALL_ACCESS so the user's own private playlists are included in their export.
            const myPlaylists = library.getPlaylists(req.username, VisibilityProfile.ALL_ACCESS) || [];
            const playlists: ArchivePlaylist[] = myPlaylists
                .filter((p: any) => p.username === req.username)
                .map((p: any) => {
                    const tracks = library.getPlaylistTracks(Number(p.id)).map((t: any) => ({
                        title: t.title,
                        artist: t.artist_name
                            || (t.artist_id ? (database.getArtist(t.artist_id)?.name || "") : ""),
                        duration: t.duration || undefined,
                    }));
                    return {
                        name: p.name,
                        description: p.description || "",
                        is_public: !!(p.isPublic ?? p.is_public),
                        tracks,
                    };
                });

            const archive: MigrationArchive = {
                version: ARCHIVE_VERSION,
                source_instance: baseUrl() || undefined,
                actor_uri: actorUriFor(req) || undefined,
                username: req.username,
                exported_at: new Date().toISOString(),
                playlists,
            };

            res.setHeader("Content-Disposition", `attachment; filename="tunecamp-account-${req.username}.json"`);
            res.json(archive);
        } catch (e: any) {
            console.error("[AccountMigration] export failed:", e);
            res.status(500).json({ error: "Export failed" });
        }
    });

    /**
     * POST /api/account/import
     * Apply an uploaded archive to the logged-in account (profile link + playlists).
     * Unresolved tracks are skipped and reported, not fatal.
     */
    router.post("/import", async (req: AuthenticatedRequest, res) => {
        if (!req.username) return res.status(401).json({ error: "Unauthorized" });
        if (!req.isActive) return res.status(403).json({ error: "Account not active" });

        let archive: MigrationArchive;
        try {
            archive = validateArchive(req.body);
        } catch (e: any) {
            return res.status(400).json({ error: e.message || "Invalid archive" });
        }

        try {
            const { resolved, skipped } = resolvePlaylists(archive.playlists, findLocalTrack);

            let importedPlaylists = 0;
            let importedTracks = 0;
            for (const p of resolved) {
                const id = library.createPlaylist(p.name, req.username!, p.description, p.is_public);
                importedPlaylists++;
                for (const trackId of p.trackIds) {
                    library.addTrackToPlaylist(Number(id), trackId);
                    importedTracks++;
                }
            }

            // Identity backlink: only artist actors expose alsoKnownAs, and only they
            // have followers to redirect via a later Move. Set the source actor as an
            // alias so the origin instance's Move verifies against this new profile.
            let identityLinked = false;
            if (req.artistId && archive.actor_uri) {
                const artist = database.getArtist(Number(req.artistId));
                const existing = artist?.also_known_as || [];
                if (!existing.includes(archive.actor_uri)) {
                    await apService.setAlsoKnownAs(Number(req.artistId), [...existing, archive.actor_uri]);
                }
                identityLinked = true;
            }

            res.json({
                imported_playlists: importedPlaylists,
                imported_tracks: importedTracks,
                skipped_tracks: skipped.length,
                skipped,
                identity_linked: identityLinked,
                identity_note: !identityLinked && archive.actor_uri
                    ? "Follower redirect (ActivityPub Move) requires a linked artist profile on this account."
                    : undefined,
            });
        } catch (e: any) {
            console.error("[AccountMigration] import failed:", e);
            res.status(500).json({ error: "Import failed" });
        }
    });

    return router;
}
