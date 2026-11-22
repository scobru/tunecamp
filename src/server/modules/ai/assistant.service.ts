import crypto from "node:crypto";
import path from "node:path";
import fs from "fs-extra";
import type { DatabaseService, Track, Album } from "../../core/database.js";
import type { LibraryManager } from "../../core/database.types.js";
import type { ServerConfig } from "../../core/config.js";
import type { CatalogService } from "../catalog/catalog.service.js";
import type { MetadataService } from "../catalog/metadata.service.js";
import type { MaintenanceService } from "../catalog/maintenance.service.js";
import type { ScannerService } from "../catalog/scanner.service.js";
import type { MediaEngine } from "../media/media-engine.js";
import type {
    OpenRouterService,
    ChatMessage,
    ToolDefinition
} from "./openrouter.service.js";
import {
    VisibilityGuardian,
    VisibilityProfile,
    UserRole,
    type ViewerContext
} from "../../common/visibility.js";
import { isSafeUrl } from "../../../utils/networkUtils.js";
import { drainResponse, fetchSafe } from "../../common/network.js";
import { taskManager } from "../workers/task-manager.js";

export interface AssistantCaller {
    userId: number;
    username?: string;
    artistId?: number | null;
    role?: UserRole;
    isAdmin: boolean;
    isRootAdmin?: boolean;
    isSuperUser?: boolean;
    context?: ViewerContext;
}

export interface AssistantContext {
    albumId?: number;
    trackIds?: number[];
    artistId?: number;
    searchQuery?: string;
    view?: "maintenance" | "tracks" | "albums" | "album_detail";
}

export interface FieldDiff {
    field: string;
    before: string | number | null;
    after: string | number | null;
}

export interface ProposedAction {
    id: string;
    type: "track_update" | "album_update" | "artist_update" | "system_action";
    targetId?: number;
    label: string;
    reason?: string;
    diffs: FieldDiff[];
    previewImageUrl?: string;
    applied?: boolean;
}

type SystemActionKind = "rescan_library" | "sync_tags" | "optimize_db" | "prewarm_cache";

interface StoredAction extends ProposedAction {
    payload: Record<string, any>;
}

interface StoredProposal {
    id: string;
    userId: number;
    createdAt: number;
    actions: StoredAction[];
}

export interface AssistantChatInputMessage {
    role: "user" | "assistant";
    content: string;
}

export interface AssistantChatResponse {
    reply: string;
    toolTrace: Array<{ name: string; summary: string }>;
    proposal?: {
        id: string;
        actions: ProposedAction[];
    };
}

export interface AssistantApplyResponse {
    applied: number;
    failed: number;
    errors: string[];
    results: Array<{ actionId: string; ok: boolean; message: string }>;
}

export interface AssistantDeps {
    database: DatabaseService;
    library: LibraryManager;
    catalogService: CatalogService;
    metadataService: MetadataService;
    maintenanceService: MaintenanceService;
    openRouterService: OpenRouterService;
    scannerService: ScannerService;
    mediaEngine: MediaEngine;
    config: ServerConfig;
    musicDir: string;
}

const PROPOSAL_TTL_MS = 30 * 60 * 1000;
const MAX_STORED_PROPOSALS = 200;
const MAX_TOOL_ITERATIONS = 8;
const MAX_HISTORY_MESSAGES = 16;

function formatDurationSec(seconds?: number | null): string {
    if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return "00:00";
    const total = Math.round(seconds);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function normalizeVal(val: unknown): string | number | null {
    if (val === undefined || val === null || val === "") return null;
    if (typeof val === "number") return Number.isFinite(val) ? val : null;
    return String(val);
}

function buildDiff(field: string, beforeVal: unknown, afterVal: unknown): FieldDiff | null {
    if (afterVal === undefined) return null;
    const before = normalizeVal(beforeVal);
    const after = normalizeVal(afterVal);
    if (before === after) return null;
    if (typeof before === "string" && typeof after === "string" && before.trim() === after.trim()) {
        return null;
    }
    return { field, before, after };
}

function sanitizeImageExt(urlStr: string): string {
    try {
        const ext = path.extname(new URL(urlStr).pathname).toLowerCase();
        if ([".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)) return ext;
    } catch { /* fallback */ }
    return ".jpg";
}

async function downloadImageSafely(url: string, dest: string): Promise<boolean> {
    if (!(await isSafeUrl(url))) return false;

    let currentUrl = url;
    let response: any = null;

    for (let i = 0; i <= 3; i++) {
        response = await fetchSafe(currentUrl, {
            redirect: "manual",
            signal: AbortSignal.timeout(10000)
        });

        if (response.status >= 300 && response.status < 400 && response.headers.has("location")) {
            const location = response.headers.get("location");
            if (!location) break;
            currentUrl = new URL(location, currentUrl).toString();
            await drainResponse(response);
            if (!(await isSafeUrl(currentUrl))) return false;
            continue;
        }
        break;
    }

    if (response && response.ok) {
        if (Number(response.headers.get("content-length") || 0) > 10 * 1024 * 1024) {
            await drainResponse(response);
            return false;
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        await fs.writeFile(dest, buffer);
        return true;
    } else if (response) {
        await drainResponse(response);
    }
    return false;
}

export class AssistantService {
    private proposals = new Map<string, StoredProposal>();

    constructor(private deps: AssistantDeps) {}

    public canUseAssistant(caller: AssistantCaller): boolean {
        if (caller.isAdmin) return true;
        if (caller.context) {
            return VisibilityGuardian.canPublishContent(caller.context);
        }
        return false;
    }

    private canAccessTrack(caller: AssistantCaller, track: Track): boolean {
        if (caller.isAdmin) return true;
        if (track.owner_id != null && track.owner_id === caller.userId) return true;
        if (caller.artistId != null && track.artist_id === caller.artistId) return true;
        return false;
    }

    private canAccessAlbum(caller: AssistantCaller, album: Album): boolean {
        if (caller.isAdmin) return true;
        if (album.owner_id != null && album.owner_id === caller.userId) return true;
        if (caller.artistId != null && album.artist_id === caller.artistId) return true;
        return false;
    }

    private canAccessArtist(caller: AssistantCaller, artistId: number): boolean {
        if (caller.isAdmin) return true;
        return caller.artistId != null && caller.artistId === artistId;
    }

    private pruneProposals(): void {
        const now = Date.now();
        for (const [id, prop] of this.proposals.entries()) {
            if (now - prop.createdAt > PROPOSAL_TTL_MS) {
                this.proposals.delete(id);
            }
        }
        while (this.proposals.size >= MAX_STORED_PROPOSALS) {
            const oldest = this.proposals.keys().next().value;
            if (oldest !== undefined) this.proposals.delete(oldest);
            else break;
        }
    }

    private formatTrackSummary(t: Track) {
        return {
            id: t.id,
            track_num: t.track_num ?? null,
            title: t.title,
            artist_name: t.artist_name || null,
            album_id: t.album_id ?? null,
            album_title: t.album_title || null,
            duration: t.duration ? Math.round(t.duration) : null,
            durationFormatted: formatDurationSec(t.duration),
            genre: t.genre || null,
            year: t.year || null
        };
    }

    private buildContextSnapshot(caller: AssistantCaller, context?: AssistantContext): string {
        if (!context) return "";

        const lines: string[] = [];
        if (context.view) lines.push(`Current UI view: ${context.view}`);
        if (context.searchQuery) lines.push(`Active search filter: "${context.searchQuery}"`);

        if (typeof context.albumId === "number") {
            const album = this.deps.library.getAlbum(context.albumId) || this.deps.library.getRelease(context.albumId);
            if (album && this.canAccessAlbum(caller, album)) {
                let tracks = this.deps.database.getTracksByAlbum(album.id, VisibilityProfile.ALL_ACCESS);
                if (tracks.length === 0 && album.is_release) {
                    tracks = this.deps.library.getTracksByReleaseId(album.id);
                }
                lines.push(`Focused album: ${JSON.stringify({
                    id: album.id,
                    title: album.title,
                    artist: album.album_artist || album.artist_name || "Unknown Artist",
                    year: album.year || null,
                    genre: album.genre || null,
                    hasCover: Boolean(album.cover_path),
                    trackCount: tracks.length
                })}`);
                lines.push(`Album tracks: ${JSON.stringify(tracks.map(t => this.formatTrackSummary(t)))}`);
            }
        } else if (Array.isArray(context.trackIds) && context.trackIds.length > 0) {
            const ids = context.trackIds.map(Number).filter(n => Number.isFinite(n) && n > 0).slice(0, 50);
            const rawTracks = this.deps.database.getTracksByIds(ids);
            const accessible = rawTracks.filter(t => this.canAccessTrack(caller, t));
            if (accessible.length > 0) {
                lines.push(`Selected/visible tracks (${accessible.length}): ${JSON.stringify(accessible.map(t => this.formatTrackSummary(t)))}`);
            }
        } else if (typeof context.artistId === "number" && this.canAccessArtist(caller, context.artistId)) {
            const artist = this.deps.library.getArtist(context.artistId);
            if (artist) {
                const albums = this.deps.database.getAlbumsByArtist(artist.id, VisibilityProfile.ALL_ACCESS);
                lines.push(`Focused artist: ${JSON.stringify({
                    id: artist.id,
                    name: artist.name,
                    hasBio: Boolean(artist.bio),
                    hasPhoto: Boolean(artist.photo_path),
                    albums: albums.map(a => ({ id: a.id, title: a.title, year: a.year || null }))
                })}`);
            }
        }

        if (lines.length === 0) return "";
        return `\n\n[CURRENT CONTEXT]\n${lines.join("\n")}`;
    }

    private getToolDefinitions(caller: AssistantCaller): ToolDefinition[] {
        const tools: ToolDefinition[] = [
            {
                type: "function",
                function: {
                    name: "search_library",
                    description: "Search tracks, albums, and artists in the local TuneCamp library.",
                    parameters: {
                        type: "object",
                        properties: {
                            query: { type: "string", description: "Search query (artist, album, or track title)" }
                        },
                        required: ["query"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "get_album_details",
                    description: "Get full metadata and ordered tracklist (with track IDs and durations) for a local album.",
                    parameters: {
                        type: "object",
                        properties: {
                            albumId: { type: "integer", description: "Local album ID" }
                        },
                        required: ["albumId"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "search_external_releases",
                    description: "Search online music databases (iTunes, MusicBrainz, Discogs, Spotify, etc.) for album releases.",
                    parameters: {
                        type: "object",
                        properties: {
                            query: { type: "string", description: "Query such as 'Artist - Album Title'" }
                        },
                        required: ["query"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "get_external_release_tracklist",
                    description: "Fetch the official tracklist (track numbers, titles, and durations) and metadata for an external release candidate.",
                    parameters: {
                        type: "object",
                        properties: {
                            source: { type: "string", description: "Provider source id returned by search_external_releases (e.g. 'itunes', 'musicbrainz', 'discogs')" },
                            releaseId: { type: "string", description: "Release ID returned by search_external_releases" }
                        },
                        required: ["source", "releaseId"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "search_external_recordings",
                    description: "Search online providers for individual track/song metadata.",
                    parameters: {
                        type: "object",
                        properties: {
                            query: { type: "string", description: "Query such as 'Artist - Track Title'" }
                        },
                        required: ["query"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "search_external_artists",
                    description: "Search online providers for artist biography, links, and avatar photo URLs.",
                    parameters: {
                        type: "object",
                        properties: {
                            query: { type: "string", description: "Artist name" }
                        },
                        required: ["query"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "propose_track_updates",
                    description: "Stage metadata updates (e.g. corrected track titles, track numbers, genre, year, artist, album, coverUrl) for one or more local tracks. The user reviews a diff and clicks Apply.",
                    parameters: {
                        type: "object",
                        properties: {
                            reason: { type: "string", description: "Brief explanation of the proposed batch update" },
                            updates: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        trackId: { type: "integer" },
                                        title: { type: "string" },
                                        track_num: { type: "integer" },
                                        artist: { type: "string" },
                                        album: { type: "string" },
                                        genre: { type: "string" },
                                        year: { type: "integer" },
                                        coverUrl: { type: "string", description: "Safe HTTPS artwork URL" }
                                    },
                                    required: ["trackId"]
                                }
                            }
                        },
                        required: ["updates"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "propose_album_update",
                    description: "Stage metadata updates for a local album (title, artist, genre, year, description, coverUrl). The user reviews a diff and clicks Apply.",
                    parameters: {
                        type: "object",
                        properties: {
                            albumId: { type: "integer" },
                            title: { type: "string" },
                            artist: { type: "string" },
                            genre: { type: "string" },
                            year: { type: "integer" },
                            description: { type: "string" },
                            coverUrl: { type: "string" },
                            propagateToTracks: { type: "boolean", description: "Also propagate genre/year to tracks missing them (default true)" },
                            reason: { type: "string" }
                        },
                        required: ["albumId"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "propose_artist_update",
                    description: "Stage metadata updates for a local artist (name, bio, avatarUrl). The user reviews a diff and clicks Apply.",
                    parameters: {
                        type: "object",
                        properties: {
                            artistId: { type: "integer" },
                            name: { type: "string" },
                            bio: { type: "string" },
                            avatarUrl: { type: "string" },
                            reason: { type: "string" }
                        },
                        required: ["artistId"]
                    }
                }
            }
        ];

        if (caller.isAdmin) {
            tools.push(
                {
                    type: "function",
                    function: {
                        name: "list_missing_metadata",
                        description: "Find tracks, albums, or artists in the library that have missing metadata or generic placeholder titles.",
                        parameters: {
                            type: "object",
                            properties: {
                                entity: { type: "string", enum: ["tracks", "albums", "artists"] },
                                filter: {
                                    type: "string",
                                    enum: ["genre", "year", "cover", "artist", "album", "description", "generic_titles", "photo"]
                                },
                                limit: { type: "integer", description: "Max items to return (default 25, max 50)" }
                            },
                            required: ["entity", "filter"]
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "get_library_stats",
                        description: "Get overall TuneCamp library statistics (artists, albums, tracks, genres, storage).",
                        parameters: {
                            type: "object",
                            properties: {}
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "propose_system_action",
                        description: "Stage a library system maintenance task (rescan_library, sync_tags, optimize_db, prewarm_cache) for user confirmation.",
                        parameters: {
                            type: "object",
                            properties: {
                                action: {
                                    type: "string",
                                    enum: ["rescan_library", "sync_tags", "optimize_db", "prewarm_cache"]
                                },
                                reason: { type: "string" }
                            },
                            required: ["action"]
                        }
                    }
                }
            );
        }

        return tools;
    }

    private async executeTool(
        name: string,
        args: Record<string, any>,
        caller: AssistantCaller,
        stagedActions: StoredAction[],
        toolTrace: Array<{ name: string; summary: string }>
    ): Promise<any> {
        switch (name) {
            case "search_library": {
                const query = String(args?.query || "").trim();
                if (!query) return { error: "query is required" };
                const res = this.deps.library.search(query, VisibilityProfile.ALL_ACCESS);
                const tracks = res.tracks.filter(t => this.canAccessTrack(caller, t)).slice(0, 20).map(t => this.formatTrackSummary(t));
                const albums = res.albums.filter(a => this.canAccessAlbum(caller, a)).slice(0, 15).map(a => ({
                    id: a.id,
                    title: a.title,
                    artist: a.album_artist || a.artist_name || null,
                    year: a.year || null,
                    genre: a.genre || null,
                    hasCover: Boolean(a.cover_path)
                }));
                const artists = res.artists.filter(ar => this.canAccessArtist(caller, ar.id)).slice(0, 10).map(ar => ({
                    id: ar.id,
                    name: ar.name,
                    hasBio: Boolean(ar.bio),
                    hasPhoto: Boolean(ar.photo_path)
                }));
                toolTrace.push({ name, summary: `Searched library for "${query}" (${tracks.length} tracks, ${albums.length} albums)` });
                return { tracks, albums, artists };
            }

            case "get_album_details": {
                const albumId = Number(args?.albumId);
                if (!Number.isFinite(albumId) || albumId <= 0) return { error: "Valid albumId required" };
                const album = this.deps.library.getAlbum(albumId) || this.deps.library.getRelease(albumId);
                if (!album) return { error: `Album ${albumId} not found` };
                if (!this.canAccessAlbum(caller, album)) return { error: "Access denied for this album" };

                let tracks = this.deps.database.getTracksByAlbum(album.id, VisibilityProfile.ALL_ACCESS);
                if (tracks.length === 0 && album.is_release) {
                    tracks = this.deps.library.getTracksByReleaseId(album.id);
                }

                toolTrace.push({ name, summary: `Inspected album "${album.title}" (${tracks.length} tracks)` });
                return {
                    album: {
                        id: album.id,
                        title: album.title,
                        artist: album.album_artist || album.artist_name || null,
                        year: album.year || null,
                        genre: album.genre || null,
                        description: album.description || null,
                        hasCover: Boolean(album.cover_path)
                    },
                    tracks: tracks.map(t => this.formatTrackSummary(t))
                };
            }

            case "list_missing_metadata": {
                if (!caller.isAdmin) return { error: "Admin access required" };
                const entity = args?.entity;
                const filter = args?.filter;
                const limit = Math.min(Math.max(Number(args?.limit) || 25, 1), 50);

                if (entity === "tracks") {
                    const items = filter === "generic_titles"
                        ? this.deps.maintenanceService.getTracksWithGenericTitles()
                        : this.deps.maintenanceService.getTracksWithMissingMetadata(filter);
                    toolTrace.push({ name, summary: `Found ${items.length} tracks (${filter})` });
                    return {
                        total: items.length,
                        items: items.slice(0, limit).map(t => this.formatTrackSummary(t))
                    };
                }
                if (entity === "albums") {
                    const items = this.deps.maintenanceService.getAlbumsWithMissingMetadata(filter);
                    toolTrace.push({ name, summary: `Found ${items.length} albums (${filter})` });
                    return {
                        total: items.length,
                        items: items.slice(0, limit).map(a => ({
                            id: a.id,
                            title: a.title,
                            artist: a.album_artist || a.artist_name || null,
                            year: a.year || null,
                            genre: a.genre || null,
                            hasCover: Boolean(a.cover_path),
                            hasDescription: Boolean(a.description)
                        }))
                    };
                }
                if (entity === "artists") {
                    const items = await this.deps.maintenanceService.getArtistsWithMissingPhotos();
                    toolTrace.push({ name, summary: `Found ${items.length} artists missing photos` });
                    return {
                        total: items.length,
                        items: items.slice(0, limit).map(ar => ({
                            id: ar.id,
                            name: ar.name,
                            hasBio: Boolean(ar.bio)
                        }))
                    };
                }
                return { error: "Invalid entity" };
            }

            case "get_library_stats": {
                if (!caller.isAdmin) return { error: "Admin access required" };
                const stats = await this.deps.library.getStats();
                toolTrace.push({ name, summary: `${stats.tracks} tracks, ${stats.albums} albums, ${stats.artists} artists` });
                return stats;
            }

            case "search_external_releases": {
                const query = String(args?.query || "").trim();
                if (!query) return { error: "query is required" };
                const matches = await this.deps.metadataService.searchRelease(query);
                const top = matches.slice(0, 10).map(m => ({
                    source: m.source,
                    id: m.id,
                    title: m.title,
                    artist: m.artist,
                    year: m.year ?? null,
                    genre: m.genre ?? null,
                    trackCount: m.trackCount ?? null,
                    coverUrl: m.coverUrl ?? null
                }));
                toolTrace.push({ name, summary: `External release search "${query}" → ${top.length} matches` });
                return { matches: top };
            }

            case "get_external_release_tracklist": {
                const source = String(args?.source || "").trim();
                const releaseId = String(args?.releaseId || "").trim();
                if (!source || !releaseId) return { error: "source and releaseId are required" };
                const details = await this.deps.metadataService.getReleaseDetails(source, releaseId);
                if (!details) {
                    toolTrace.push({ name, summary: `No tracklist found for ${source}:${releaseId}` });
                    return { error: `No tracklist details found for ${source} release ${releaseId}. Try another release or provider.` };
                }
                toolTrace.push({ name, summary: `Fetched ${details.tracks.length} tracks from ${source} (${details.title})` });
                return {
                    ...details,
                    tracks: details.tracks.map(t => ({
                        ...t,
                        durationFormatted: formatDurationSec(t.duration)
                    }))
                };
            }

            case "search_external_recordings": {
                const query = String(args?.query || "").trim();
                if (!query) return { error: "query is required" };
                const matches = await this.deps.metadataService.searchRecording(query);
                const top = matches.slice(0, 10);
                toolTrace.push({ name, summary: `External recording search "${query}" → ${top.length} matches` });
                return { matches: top };
            }

            case "search_external_artists": {
                const query = String(args?.query || "").trim();
                if (!query) return { error: "query is required" };
                const matches = await this.deps.metadataService.searchArtist(query);
                const top = matches.slice(0, 8);
                toolTrace.push({ name, summary: `External artist search "${query}" → ${top.length} matches` });
                return { matches: top };
            }

            case "propose_track_updates": {
                const rawUpdates = Array.isArray(args?.updates) ? args.updates.slice(0, 100) : [];
                const reason = typeof args?.reason === "string" ? args.reason : undefined;
                if (rawUpdates.length === 0) return { error: "updates array must not be empty" };

                let stagedCount = 0;
                let skippedCount = 0;
                const errors: string[] = [];

                for (const item of rawUpdates) {
                    const trackId = Number(item?.trackId);
                    if (!Number.isFinite(trackId) || trackId <= 0) {
                        skippedCount++;
                        continue;
                    }
                    const track = this.deps.database.getTrack(trackId);
                    if (!track) {
                        errors.push(`Track ${trackId} not found`);
                        skippedCount++;
                        continue;
                    }
                    if (!this.canAccessTrack(caller, track)) {
                        errors.push(`Access denied for track ${trackId}`);
                        skippedCount++;
                        continue;
                    }

                    const payload: Record<string, any> = {};
                    const diffs: FieldDiff[] = [];

                    const addField = (field: string, beforeVal: unknown, nextVal: unknown, payloadKey = field) => {
                        const diff = buildDiff(field, beforeVal, nextVal);
                        if (diff) {
                            diffs.push(diff);
                            payload[payloadKey] = nextVal;
                        }
                    };

                    if (typeof item.title === "string" && item.title.trim()) {
                        addField("title", track.title, item.title.trim());
                    }
                    if (item.track_num !== undefined && item.track_num !== null) {
                        const tn = Number(item.track_num);
                        if (Number.isFinite(tn) && tn > 0) {
                            addField("track_num", track.track_num, tn);
                        }
                    }
                    if (typeof item.artist === "string" && item.artist.trim()) {
                        addField("artist", track.artist_name, item.artist.trim());
                    }
                    if (typeof item.album === "string" && item.album.trim()) {
                        addField("album", track.album_title, item.album.trim());
                    }
                    if (typeof item.genre === "string" && item.genre.trim()) {
                        addField("genre", track.genre, item.genre.trim());
                    }
                    if (item.year !== undefined && item.year !== null) {
                        const yr = Number(item.year);
                        if (Number.isFinite(yr) && yr > 0) {
                            addField("year", track.year, yr);
                        }
                    }
                    let previewImageUrl: string | undefined;
                    if (typeof item.coverUrl === "string" && item.coverUrl.trim()) {
                        const coverUrl = item.coverUrl.trim();
                        if (!(await isSafeUrl(coverUrl))) {
                            errors.push(`Unsafe coverUrl ignored for track ${trackId}`);
                        } else {
                            addField("coverUrl", track.external_artwork, coverUrl, "externalArtwork");
                            previewImageUrl = coverUrl;
                        }
                    }

                    if (diffs.length === 0) {
                        skippedCount++;
                        continue;
                    }

                    const actionId = `act-${stagedActions.length + 1}`;
                    const label = track.album_title
                        ? `#${track.track_num ?? track.id} ${track.title} (${track.album_title})`
                        : `#${track.id} ${track.title}`;

                    stagedActions.push({
                        id: actionId,
                        type: "track_update",
                        targetId: track.id,
                        label,
                        reason,
                        diffs,
                        previewImageUrl,
                        payload
                    });
                    stagedCount++;
                }

                toolTrace.push({ name, summary: `Staged ${stagedCount} track update(s) for review` });
                return {
                    staged: stagedCount,
                    skipped: skippedCount,
                    errors: errors.length > 0 ? errors : undefined
                };
            }

            case "propose_album_update": {
                const albumId = Number(args?.albumId);
                if (!Number.isFinite(albumId) || albumId <= 0) return { error: "Valid albumId required" };
                const album = this.deps.library.getAlbum(albumId) || this.deps.library.getRelease(albumId);
                if (!album) return { error: `Album ${albumId} not found` };
                if (!this.canAccessAlbum(caller, album)) return { error: "Access denied for this album" };

                const payload: Record<string, any> = {};
                const diffs: FieldDiff[] = [];

                const addField = (field: string, beforeVal: unknown, nextVal: unknown, payloadKey = field) => {
                    const diff = buildDiff(field, beforeVal, nextVal);
                    if (diff) {
                        diffs.push(diff);
                        payload[payloadKey] = nextVal;
                    }
                };

                if (typeof args.title === "string" && args.title.trim()) {
                    addField("title", album.title, args.title.trim());
                }
                if (typeof args.artist === "string" && args.artist.trim()) {
                    addField("artist", album.album_artist || album.artist_name, args.artist.trim());
                }
                if (typeof args.genre === "string" && args.genre.trim()) {
                    addField("genre", album.genre, args.genre.trim());
                }
                if (args.year !== undefined && args.year !== null) {
                    const yr = Number(args.year);
                    if (Number.isFinite(yr) && yr > 0) {
                        addField("year", album.year, yr);
                    }
                }
                if (typeof args.description === "string" && args.description.trim()) {
                    addField("description", album.description, args.description.trim());
                }
                let previewImageUrl: string | undefined;
                if (typeof args.coverUrl === "string" && args.coverUrl.trim()) {
                    const coverUrl = args.coverUrl.trim();
                    if (!(await isSafeUrl(coverUrl))) {
                        return { error: "Unsafe coverUrl rejected" };
                    }
                    addField("coverUrl", album.cover_path, coverUrl, "cover_path");
                    previewImageUrl = coverUrl;
                }

                if (diffs.length === 0) {
                    return { staged: 0, message: "No actual metadata differences to stage." };
                }

                const propagateToTracks = args.propagateToTracks !== false;
                const actionId = `act-${stagedActions.length + 1}`;
                stagedActions.push({
                    id: actionId,
                    type: "album_update",
                    targetId: album.id,
                    label: `Album: ${album.title}`,
                    reason: typeof args.reason === "string" ? args.reason : undefined,
                    diffs,
                    previewImageUrl,
                    payload: {
                        updateData: payload,
                        propagateToTracks
                    }
                });

                toolTrace.push({ name, summary: `Staged album update for "${album.title}"` });
                return { staged: 1, diffsCount: diffs.length };
            }

            case "propose_artist_update": {
                const artistId = Number(args?.artistId);
                if (!Number.isFinite(artistId) || artistId <= 0) return { error: "Valid artistId required" };
                if (!this.canAccessArtist(caller, artistId)) return { error: "Access denied for this artist" };
                const artist = this.deps.library.getArtist(artistId);
                if (!artist) return { error: `Artist ${artistId} not found` };

                const payload: Record<string, any> = {};
                const diffs: FieldDiff[] = [];

                const addField = (field: string, beforeVal: unknown, nextVal: unknown) => {
                    const diff = buildDiff(field, beforeVal, nextVal);
                    if (diff) {
                        diffs.push(diff);
                        payload[field] = nextVal;
                    }
                };

                if (typeof args.name === "string" && args.name.trim()) {
                    addField("name", artist.name, args.name.trim());
                }
                if (typeof args.bio === "string" && args.bio.trim()) {
                    addField("bio", artist.bio, args.bio.trim());
                }
                let previewImageUrl: string | undefined;
                if (typeof args.avatarUrl === "string" && args.avatarUrl.trim()) {
                    const avatarUrl = args.avatarUrl.trim();
                    if (!(await isSafeUrl(avatarUrl))) {
                        return { error: "Unsafe avatarUrl rejected" };
                    }
                    addField("avatarUrl", artist.photo_path, avatarUrl);
                    previewImageUrl = avatarUrl;
                }

                if (diffs.length === 0) {
                    return { staged: 0, message: "No actual artist differences to stage." };
                }

                const actionId = `act-${stagedActions.length + 1}`;
                stagedActions.push({
                    id: actionId,
                    type: "artist_update",
                    targetId: artist.id,
                    label: `Artist: ${artist.name}`,
                    reason: typeof args.reason === "string" ? args.reason : undefined,
                    diffs,
                    previewImageUrl,
                    payload
                });

                toolTrace.push({ name, summary: `Staged artist update for "${artist.name}"` });
                return { staged: 1, diffsCount: diffs.length };
            }

            case "propose_system_action": {
                if (!caller.isAdmin) return { error: "Admin access required" };
                const action = String(args?.action || "") as SystemActionKind;
                const labels: Record<SystemActionKind, string> = {
                    rescan_library: "Rescan Library",
                    sync_tags: "Sync Database Tags to Audio Files",
                    optimize_db: "Optimize DB (Prune Orphans & Dedupe)",
                    prewarm_cache: "Pre-warm Transcode Cache"
                };
                if (!labels[action]) return { error: `Unknown system action: ${action}` };
                if (action === "sync_tags" && !caller.isRootAdmin) {
                    return { error: "Only Root Admin can trigger full tag sync" };
                }

                const actionId = `act-${stagedActions.length + 1}`;
                stagedActions.push({
                    id: actionId,
                    type: "system_action",
                    label: labels[action],
                    reason: typeof args?.reason === "string" ? args.reason : undefined,
                    diffs: [{ field: "system_task", before: "idle", after: action }],
                    payload: { action }
                });

                toolTrace.push({ name, summary: `Staged system action: ${labels[action]}` });
                return { staged: 1, action };
            }

            default:
                return { error: `Unknown tool: ${name}` };
        }
    }

    async chat(
        messages: AssistantChatInputMessage[],
        caller: AssistantCaller,
        context?: AssistantContext
    ): Promise<AssistantChatResponse> {
        if (!this.canUseAssistant(caller)) {
            throw new Error("Access denied: assistant requires publishing or admin access");
        }

        const sanitizedHistory: ChatMessage[] = messages
            .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim().length > 0)
            .slice(-MAX_HISTORY_MESSAGES)
            .map(m => ({ role: m.role, content: m.content.trim() }));

        if (sanitizedHistory.length === 0) {
            throw new Error("At least one non-empty message is required");
        }

        const contextSnapshot = this.buildContextSnapshot(caller, context);
        const systemPrompt = [
            "You are the TuneCamp Library Assistant.",
            "Reply concisely in the same language the user wrote in (e.g. Italian or English).",
            "Always inspect the local library and query external providers using your tools before proposing metadata edits.",
            "When identifying real track titles for an album with generic track names (e.g. AudioTrack 01..10, Track 01, Untitled), ALWAYS call search_external_releases and then get_external_release_tracklist to get the official tracklist and durations, and match tracks by BOTH track position/order and duration (allowing roughly ±10 seconds tolerance).",
            "Never invent or guess track titles from memory when an external tracklist can be retrieved.",
            "NEVER claim you have already modified the database or files. To make changes, ALWAYS call propose_track_updates, propose_album_update, propose_artist_update, or propose_system_action so the user sees a diff preview and clicks Apply.",
            "Never propose changing file paths or moving files on disk."
        ].join(" ") + contextSnapshot;

        const conversation: ChatMessage[] = [
            { role: "system", content: systemPrompt },
            ...sanitizedHistory
        ];

        const tools = this.getToolDefinitions(caller);
        const stagedActions: StoredAction[] = [];
        const toolTrace: Array<{ name: string; summary: string }> = [];
        let reply = "";

        for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
            const res = await this.deps.openRouterService.chat(conversation, {
                tools,
                toolChoice: "auto"
            });

            if (!res.ok) {
                const err: any = new Error(res.error);
                if (res.toolUseUnsupported) err.toolUseUnsupported = true;
                if (res.status) err.status = res.status;
                throw err;
            }

            const assistantMsg = res.message;
            conversation.push(assistantMsg);

            const toolCalls = assistantMsg.tool_calls;
            if (!toolCalls || toolCalls.length === 0) {
                reply = (assistantMsg.content || "").trim();
                break;
            }

            for (const tc of toolCalls) {
                const fnName = tc.function?.name || "unknown";
                let parsedArgs: Record<string, any> = {};
                let toolOutput: any;

                try {
                    parsedArgs = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
                    toolOutput = await this.executeTool(fnName, parsedArgs, caller, stagedActions, toolTrace);
                } catch (err: any) {
                    toolOutput = { error: err?.message || String(err) };
                }

                conversation.push({
                    role: "tool",
                    tool_call_id: tc.id,
                    name: fnName,
                    content: JSON.stringify(toolOutput)
                });
            }
        }

        if (!reply && stagedActions.length > 0) {
            reply = `Prepared ${stagedActions.length} change(s). Review the diff below and click Apply to save.`;
        }

        if (stagedActions.length > 0) {
            this.pruneProposals();
            const proposalId = crypto.randomUUID();
            this.proposals.set(proposalId, {
                id: proposalId,
                userId: caller.userId,
                createdAt: Date.now(),
                actions: stagedActions
            });

            return {
                reply,
                toolTrace,
                proposal: {
                    id: proposalId,
                    actions: stagedActions.map(({ payload: _payload, ...pub }) => pub)
                }
            };
        }

        return { reply, toolTrace };
    }

    async applyProposal(
        proposalId: string,
        selectedActionIds: string[] | undefined,
        caller: AssistantCaller
    ): Promise<AssistantApplyResponse> {
        const proposal = this.proposals.get(proposalId);
        if (!proposal || Date.now() - proposal.createdAt > PROPOSAL_TTL_MS) {
            if (proposal) this.proposals.delete(proposalId);
            const err: any = new Error("Proposal not found or expired");
            err.status = 404;
            throw err;
        }

        if (proposal.userId !== caller.userId) {
            const err: any = new Error("Access denied: proposal belongs to another user");
            err.status = 403;
            throw err;
        }

        const selection = selectedActionIds && selectedActionIds.length > 0 ? new Set(selectedActionIds) : null;
        const targets = proposal.actions.filter(a => !a.applied && (!selection || selection.has(a.id)));

        let applied = 0;
        let failed = 0;
        const errors: string[] = [];
        const results: Array<{ actionId: string; ok: boolean; message: string }> = [];

        for (const action of targets) {
            try {
                if (action.type === "track_update") {
                    const trackId = action.targetId!;
                    const track = this.deps.database.getTrack(trackId);
                    if (!track) throw new Error(`Track ${trackId} not found`);
                    if (!this.canAccessTrack(caller, track)) throw new Error("Access denied");

                    const safePayload: Record<string, any> = { ...action.payload };
                    delete safePayload.fileName;
                    delete safePayload.filename;
                    delete safePayload.file_path;

                    if (safePayload.externalArtwork && !(await isSafeUrl(safePayload.externalArtwork))) {
                        throw new Error("Unsafe cover URL blocked");
                    }

                    await this.deps.catalogService.updateTrack(trackId, safePayload);
                    action.applied = true;
                    applied++;
                    results.push({ actionId: action.id, ok: true, message: `Updated ${action.label}` });
                } else if (action.type === "album_update") {
                    const albumId = action.targetId!;
                    const album = this.deps.library.getAlbum(albumId) || this.deps.library.getRelease(albumId);
                    if (!album) throw new Error(`Album ${albumId} not found`);
                    if (!this.canAccessAlbum(caller, album)) throw new Error("Access denied");

                    const { updateData, propagateToTracks } = action.payload as {
                        updateData: Record<string, any>;
                        propagateToTracks?: boolean;
                    };

                    if (updateData.cover_path && !(await isSafeUrl(updateData.cover_path))) {
                        throw new Error("Unsafe cover URL blocked");
                    }

                    await this.deps.catalogService.updateAlbum(albumId, updateData);
                    if (propagateToTracks && (updateData.genre !== undefined || updateData.year !== undefined)) {
                        await this.deps.maintenanceService.propagateAlbumMetadataToTracks(albumId, {
                            genre: updateData.genre ?? null,
                            year: typeof updateData.year === "number" ? updateData.year : null
                        });
                    }
                    action.applied = true;
                    applied++;
                    results.push({ actionId: action.id, ok: true, message: `Updated ${action.label}` });
                } else if (action.type === "artist_update") {
                    const artistId = action.targetId!;
                    if (!this.canAccessArtist(caller, artistId)) throw new Error("Access denied");
                    const artist = this.deps.library.getArtist(artistId);
                    if (!artist) throw new Error(`Artist ${artistId} not found`);

                    let photoPath = artist.photo_path;
                    if (action.payload.avatarUrl) {
                        const avatarUrl = String(action.payload.avatarUrl);
                        if (!(await isSafeUrl(avatarUrl))) {
                            throw new Error("Unsafe avatar URL blocked");
                        }
                        const artistAssetsDir = path.join(this.deps.musicDir, "artists", artist.slug || String(artistId));
                        await fs.ensureDir(artistAssetsDir);
                        const ext = sanitizeImageExt(avatarUrl);
                        const dest = path.join(artistAssetsDir, `photo-${Date.now()}${ext}`);
                        const downloaded = await downloadImageSafely(avatarUrl, dest);
                        if (downloaded) {
                            photoPath = path.relative(this.deps.musicDir, dest).replace(/\\/g, "/");
                        }
                    }

                    this.deps.library.updateArtist(
                        artistId,
                        action.payload.name || undefined,
                        action.payload.bio || undefined,
                        photoPath || undefined
                    );
                    action.applied = true;
                    applied++;
                    results.push({ actionId: action.id, ok: true, message: `Updated ${action.label}` });
                } else if (action.type === "system_action") {
                    if (!caller.isAdmin) throw new Error("Admin access required");
                    const kind = action.payload.action as SystemActionKind;
                    let msg = "";

                    if (kind === "rescan_library") {
                        const started = taskManager.run("library-rescan", async () => {
                            await this.deps.maintenanceService.runStartupRepairs();
                            const result = await this.deps.scannerService.scanDirectory(
                                this.deps.musicDir,
                                (processed, total) => {
                                    taskManager.updateProgress(
                                        "library-rescan",
                                        processed,
                                        total,
                                        `Scanning library: ${processed}/${total} files`
                                    );
                                }
                            );
                            return { processed: result.successful.length, failed: result.failed.length };
                        });
                        if (!started) throw new Error("Library rescan is already in progress");
                        msg = "Library rescan started in background";
                    } else if (kind === "sync_tags") {
                        if (!caller.isRootAdmin) throw new Error("Only Root Admin can sync tags");
                        const started = taskManager.run("tag-sync", () =>
                            this.deps.maintenanceService.syncAllTagsFromDb((processed, total) => {
                                taskManager.updateProgress(
                                    "tag-sync",
                                    processed,
                                    total,
                                    `Synchronizing tags: ${processed}/${total} tracks`
                                );
                            })
                        );
                        if (!started) throw new Error("Tag synchronization is already in progress");
                        msg = "Tag synchronization started in background";
                    } else if (kind === "optimize_db") {
                        this.deps.library.pruneOrphans();
                        msg = "Orphan records pruned";
                    } else if (kind === "prewarm_cache") {
                        if (taskManager.isRunning("prewarm-cache")) {
                            throw new Error("Pre-warm already running");
                        }
                        const tracks = this.deps.database.getAllTracks().filter((t: any) => t.file_path);
                        taskManager.run("prewarm-cache", async () => {
                            const warmed = await this.deps.mediaEngine.prewarmCache(
                                tracks,
                                (done, total, current) =>
                                    taskManager.updateProgress("prewarm-cache", done, total, current),
                                () => false
                            );
                            return { warmed, total: tracks.length };
                        });
                        msg = `Pre-warm started for ${tracks.length} tracks`;
                    } else {
                        throw new Error(`Unsupported system action: ${kind}`);
                    }

                    action.applied = true;
                    applied++;
                    results.push({ actionId: action.id, ok: true, message: msg });
                }
            } catch (err: any) {
                failed++;
                const msg = err?.message || String(err);
                errors.push(`${action.label}: ${msg}`);
                results.push({ actionId: action.id, ok: false, message: msg });
            }
        }

        return { applied, failed, errors, results };
    }
}
