import type { Database as DatabaseType } from "better-sqlite3";
import type { TrackRepository } from "../../repositories/track.repository.js";
import type { AlbumRepository } from "../../repositories/album.repository.js";
import type { ArtistRepository } from "../../repositories/artist.repository.js";
import type { ReleaseTrackRepository } from "../../repositories/release-track.repository.js";
import type { RemoteContentRepository } from "../../repositories/remote-content.repository.js";
import type { LibraryManager, Artist, Album, Release, Track, ReleaseTrack, Playlist } from "../database.types.js";
import { VisibilityProfile, ViewerContext, getContextFromProfile, VisibilityGuardian, UserRole } from "../../common/visibility.js";

export function createLibraryManager(
    db: DatabaseType,
    artistRepository: ArtistRepository,
    albumRepository: AlbumRepository,
    trackRepository: TrackRepository,
    releaseTrackRepository: ReleaseTrackRepository,
    remoteContentRepository: RemoteContentRepository
): LibraryManager {
    return {
        // Artists
        getArtists: (p?: VisibilityProfile | ViewerContext) => artistRepository.getAll(p),
        getArtist: (id: number) => artistRepository.getById(id),
        getArtistSimple: (id: number) => artistRepository.getByIdSimple(id),
        getArtistBySlug: (s: string) => artistRepository.getBySlug(s),
        getArtistBySlugSimple: (s: string) => artistRepository.getBySlug(s) as any,
        getArtistByName: (n: string) => artistRepository.getByName(n),
        getArtistsByIds: (ids: number[]) => artistRepository.getByIds(ids),
        createArtist: (n: string, b?: string, p?: string, l?: any, pp?: any, w?: string, v: any = 'private', e?: string) => artistRepository.create(n, b, p, l, pp, w, v, e),
        updateArtist: (id: number, n?: string, b?: string, p?: string, l?: any, pp?: any, w?: string, v?: any) => artistRepository.update(id, n, b, p, l, pp, w, v),
        updateArtistKeys: (id: number, publicKey: string, privateKey: string) => artistRepository.updateKeys(id, publicKey, privateKey),
        deleteArtist: (id: number) => artistRepository.delete(id),
        deleteArtistsBatch: (ids: number[]) => { ids.forEach(id => artistRepository.delete(id)); },
        updateArtistsVisibilityBatch: (ids: number[], v: any) => { db.transaction(() => ids.forEach(id => artistRepository.update(id, undefined, undefined, undefined, undefined, undefined, undefined, v)))(); },
        isArtistLinkedToUser: (id: number) => artistRepository.isLinkedToUser(id),
        isArtistLinkedToUserBySlug: (s: string) => artistRepository.isLinkedToUserBySlug(s),

        // Releases
        getReleases: (p?: VisibilityProfile | ViewerContext) => albumRepository.getReleases(p),
        getRelease: (id: number) => albumRepository.getById(id) as any,
        getReleaseBySlug: (s: string) => albumRepository.getBySlug(s) as any,
        getRecentReleaseByMetadata: (t: string, aid: number | null, seconds: number) => db.prepare("SELECT * FROM releases WHERE title = ? AND (artist_id = ? OR (artist_id IS NULL AND ? IS NULL)) AND created_at >= datetime('now', ?) ORDER BY created_at DESC LIMIT 1").get(t, aid, aid, `-${seconds} seconds`) as any,
        getReleasesByArtist: (id: number, p?: VisibilityProfile | ViewerContext, n?: string) => albumRepository.getReleasesByArtist(id, p, n),
        getReleasesByOwner: (id: number, p?: VisibilityProfile | ViewerContext) => albumRepository.getReleasesByOwner(id, p),
        createRelease: (r: any) => albumRepository.createRelease(r),
        updateRelease: (id: number, d: any) => albumRepository.update(id, d),
        getReleaseTracks: (id: number) => releaseTrackRepository.getByReleaseId(id),
        getReleaseTrackIds: (id: number) => db.prepare("SELECT track_id FROM release_tracks WHERE release_id = ?").all(id).map((r: any) => r.track_id).filter(i => i !== null),
        addTrackToRelease: (rid: number, tid: number, m?: any) => releaseTrackRepository.add(rid, { ...m, track_id: tid }),
        syncReleaseTracks: (rid: number, tids: number[]) => releaseTrackRepository.sync(rid, tids),
        deleteRelease: (id: number) => albumRepository.delete(id),
        deleteReleasesBatch: (ids: number[]) => { ids.forEach(id => albumRepository.delete(id)); },

        // Albums
        getAlbums: (p?: VisibilityProfile | ViewerContext) => albumRepository.getLibraryAlbums(p),
        getAlbumsWithStats: (p?: VisibilityProfile | ViewerContext) => albumRepository.getWithStats(p),
        getLibraryAlbums: (p?: VisibilityProfile | ViewerContext) => albumRepository.getLibraryAlbums(p),
        getAlbum: (id: number) => albumRepository.getById(id),
        getAlbumsByIds: (ids: number[]) => albumRepository.getByIds(ids),
        getAlbumBySlug: (s: string) => albumRepository.getBySlug(s),
        getAlbumByTitle: (t: string, aid?: number) => albumRepository.getByTitle(t, aid),
        getAlbumByExternalId: (e: string) => albumRepository.getByExternalId(e) as any,
        getArtistAlbumCounts: () => albumRepository.getArtistAlbumCounts(),
        getArtistCovers: (artistId: number) => albumRepository.getCovers(artistId),
        getAlbumsByArtist: (artistId: number, p?: VisibilityProfile | ViewerContext, n?: string) => albumRepository.getByArtist(artistId, p, n),
        getAlbumsByOwner: (id: number, p?: VisibilityProfile | ViewerContext) => albumRepository.getByOwner(id, p),
        createAlbum: (album: any) => albumRepository.create(album),
        updateAlbumVisibility: (id: number, v: 'public' | 'private' | 'unlisted') => albumRepository.update(id, { visibility: v }),
        updateAlbumStatus: (id: number, s: string) => albumRepository.update(id, { status: s as any }),
        updateReleaseStatus: (id: number, s: string) => albumRepository.update(id, { status: s as any }),
        updateAlbum: (id: number, album: Partial<Album>) => albumRepository.update(id, album),
        updateAlbumFederationSettings: (id: number, g: boolean, a: boolean) => albumRepository.update(id, { published_to_gundb: g, published_to_ap: a }),
        updateAlbumArtist: (id: number, aid: number) => albumRepository.update(id, { artist_id: aid }),
        updateAlbumOwner: (id: number, oid: number) => albumRepository.update(id, { owner_id: oid }),
        updateAlbumTitle: (id: number, t: string) => albumRepository.update(id, { title: t }),
        updateAlbumCover: (id: number, p: string | null) => albumRepository.update(id, { cover_path: p }),
        updateAlbumGenre: (id: number, g: string | null) => albumRepository.update(id, { genre: g }),
        updateAlbumYear: (id: number, y: any) => albumRepository.update(id, { year: Number(y) }),
        updateAlbumDownload: (id: number, d: string | null) => albumRepository.update(id, { download: d }),
        updateAlbumPrice: (id: number, p: any, pu: any, c: any = 'ETH') => albumRepository.update(id, { price: p || 0, price_usdc: pu || 0, currency: c }),
        updateAlbumLinks: (id: number, l: string | null) => albumRepository.update(id, { external_links: l }),
        promoteToRelease: (id: number) => albumRepository.promoteToRelease(id),
        deleteAlbum: (id: number, k = false) => albumRepository.delete(id, k),
        deleteAlbumsBatch: (ids: number[], k = false) => { ids.forEach(id => albumRepository.delete(id, k)); },
        updateAlbumsVisibilityBatch(ids: number[], v: any) { ids.forEach(id => this.updateAlbumVisibility(id, v)); },
        searchAlbums: (q: string, l: number, p?: VisibilityProfile | ViewerContext) => albumRepository.search(q, l, p),
        addAlbumOwner: (aid: number, oid: number) => { albumRepository.addOwner(aid, oid); },

        // Tracks
        getTracks: (aid?: number, p?: VisibilityProfile | ViewerContext) => aid ? trackRepository.getByAlbumId(aid, p) : trackRepository.getAll(p),
        getTracksByAlbum: (aid: number, p?: VisibilityProfile | ViewerContext) => trackRepository.getByAlbumId(aid, p),
        getTracksByArtist: (aid: number, p?: VisibilityProfile | ViewerContext, n?: string) => trackRepository.getByArtist(aid, p, n),
        repairArtistLinks(aid: number, n: string) { return db.transaction(() => ({ tracks: db.prepare("UPDATE tracks SET artist_id = ? WHERE (artist_id IS NULL OR artist_id IN (SELECT id FROM artists WHERE name LIKE ? AND id != ?)) AND (artist_name LIKE ? OR artist_name = ?)").run(aid, n, aid, `%${n}%`, n).changes, albums: db.prepare("UPDATE albums SET artist_id = ? WHERE (artist_id IS NULL OR artist_id IN (SELECT id FROM artists WHERE name LIKE ? AND id != ?)) AND (title = ? OR title LIKE ?)").run(aid, n, aid, n, `%${n}%`).changes }))(); },
        getTracksByOwner: (oid: number, p?: VisibilityProfile | ViewerContext) => trackRepository.getByOwner(oid, p),
        getTrack: (id: number) => trackRepository.getById(id),
        getTracksByIds: (ids: number[]) => trackRepository.getByIds(ids),
        getTrackByPath: (p: string) => trackRepository.getByPath(p),
        getTracksByPaths: (ps: string[]) => trackRepository.getByIds(ps.map(p => trackRepository.getByPath(p)?.id).filter(id => id !== undefined) as number[]),
        getTracksByAlbumIds: (aids: number[]) => db.prepare(`SELECT id FROM tracks WHERE album_id IN (${aids.map(() => "?").join(",")})`).all(...aids).map((r: any) => trackRepository.getById(r.id)).filter(t => t !== undefined) as Track[],
        getRandomTracks: (l: number) => trackRepository.getRandom(l),
        createTrack: (t: any) => { const tid = trackRepository.create(t); if (t.owner_id) trackRepository.addOwner(tid, t.owner_id); return tid; },
        updateTrack: (id: number, d: any) => trackRepository.update(id, d),
        updateTrackPath: (id: number, p: string, aid?: number | null) => trackRepository.update(id, { file_path: p, album_id: aid }),
        updateTrackLosslessPath: (id: number, p: string | null) => trackRepository.update(id, { lossless_path: p }),
        updateTrackTitle: (id: number, t: string) => trackRepository.update(id, { title: t }),
        updateTrackArtist: (id: number, aid: number | null) => trackRepository.updateArtist(id, aid, null),
        updateTrackArtistName: (id: number, n: string | null) => trackRepository.updateArtist(id, null, n),
        updateTrackArtistInfo: (id: number, aid: number | null, n: string | null) => trackRepository.updateArtist(id, aid, n),
        updateTrackAlbum: (id: number, aid: number | null) => trackRepository.update(id, { album_id: aid }),
        updateTracksAlbum: (ids: number[], aid: number | null) => { ids.forEach(id => trackRepository.update(id, { album_id: aid })); },
        updateTrackOrder: (id: number, n: number) => trackRepository.updateOrder(id, n),
        updateTrackNumber: (id: number, n: number | null) => trackRepository.updateOrder(id, n || 0),
        updateTracksOrder: (os: any[]) => { os.forEach(o => trackRepository.updateOrder(o.id, o.trackNum)); },
        updateTrackDuration: (id: number, d: number) => trackRepository.update(id, { duration: d }),
        updateTrackBitrate: (id: number, b: number) => trackRepository.update(id, { bitrate: b }),
        updateTrackWaveform: (id: number, w: string) => trackRepository.update(id, { waveform: w }),
        updateTrackPrice: (id: number, p: any, pu: any, c: any = 'ETH') => trackRepository.update(id, { price: p || 0, price_usdc: pu || 0, currency: c }),
        updateTrackLyrics: (id: number, l: string | null) => trackRepository.update(id, { lyrics: l }),
        updateTrackGenre: (id: number, g: string | null) => trackRepository.update(id, { genre: g }),
        updateTrackYear: (id: number, y: number | null) => trackRepository.update(id, { year: y }),
        updateTrackExternalArtwork: (id: number, u: string | null) => trackRepository.update(id, { external_artwork: u }),
        updateTrackService: (id: number, s: string | null) => trackRepository.update(id, { service: s }),
        updateTrackUrl: (id: number, u: string | null) => trackRepository.update(id, { url: u }),
        updateTrackExternalId: (id: number, eid: string | null) => trackRepository.update(id, { external_id: eid }),
        updateTrackHash: (id: number, h: string) => trackRepository.update(id, { hash: h }),
        updateTrackPathsPrefix: (o: string, n: string) => trackRepository.updatePathsPrefix(o, n),
        getTrackByExternalId: (e: string) => trackRepository.getByExternalId(e) as any,
        getTrackByMetadata: (t: string, aid: number | null, albid: number | null) => trackRepository.getByMetadata(t, aid, albid),
        getRemoteTracks: () => remoteContentRepository.getRemoteTracks(),
        getRemotePosts: () => remoteContentRepository.getRemotePosts(),
        getRemoteTrack: (id: string) => remoteContentRepository.getRemoteTrack(id),
        deleteTrack: (id: number, oid?: number) => trackRepository.delete(id, oid),
        deleteTracksBatch: (ids: number[]) => { ids.forEach(id => trackRepository.delete(id)); },
        getAlbumOwners: (id: number) => albumRepository.getAlbumOwners(id),
        addTrackOwner: (tid: number, oid: number) => { trackRepository.addOwner(tid, oid); },
        updateTrackOwner: (id: number, oid: number | null) => { trackRepository.updateOwner(id, oid); },
        getTracksByReleaseId: (id: number) => trackRepository.getByReleaseId(id),
        getReleasesByTrackId: (tid: number) => db.prepare("SELECT r.* FROM releases r JOIN release_tracks rt ON r.id = rt.release_id WHERE rt.track_id = ?").all(tid) as Release[],
        updateReleaseTrackMetadata: (rid: number, tid: number, m: any) => releaseTrackRepository.updateMetadata(rid, tid, m),
        getTrackPriceFromRelease: (rid: number, tid: number) => releaseTrackRepository.getPriceFromRelease(rid, tid),
        getTracksSummaryByReleaseId: (id: number) => trackRepository.getByReleaseId(id),
        getTrackByHash: (h: string) => trackRepository.getByHash(h) as any,
        mergeTracks: (f: number, t: number) => { const target = trackRepository.getById(t); if (target) trackRepository.merge(f, t, target.file_path || ""); },
        getAllTracks: () => trackRepository.getAll(),
        *iterateTracks(w?: string, p: any[] = []) {
            const it = db.prepare(w ? `SELECT id FROM tracks WHERE ${w}` : "SELECT id FROM tracks").iterate(...p);
            for (const r of it) {
                yield trackRepository.getById((r as any).id)!;
            }
        },
        updateTrackDeep(trackId: number, data: any, primaryAdminId: number | null): any {
            return db.transaction(() => {
                const track = trackRepository.getById(trackId);
                if (!track) throw new Error("Track not found");

                const title = data.title;
                const artistName = data.artistName ?? data.artist_name ?? data.artist;
                const artistId = data.artistId ?? data.artist_id;
                const albumName = data.albumName ?? data.album_name ?? data.album;
                const albumId = data.albumId ?? data.album_id;
                const ownerId = data.ownerId ?? data.owner_id;
                const trackNumber = data.trackNumber ?? data.track_num ?? data.track_number;
                const genre = data.genre;
                const year = data.year;
                const price = data.price;
                const priceUsdc = data.priceUsdc ?? data.price_usdc;
                const priceUsdt = data.priceUsdt ?? data.price_usdt;
                const currency = data.currency;
                const lyrics = data.lyrics;
                const externalArtwork = data.externalArtwork ?? data.external_artwork;
                const fileName = data.fileName ?? data.filename ?? data.file_path;
                const duration = data.duration;

                // 1. Resolve Owner
                let finalOwnerId = ownerId !== undefined ? ownerId : track.owner_id;
                if (finalOwnerId) {
                    const isValidAdmin = db.prepare("SELECT 1 FROM admin WHERE id = ?").get(finalOwnerId);
                    if (!isValidAdmin) {
                        finalOwnerId = primaryAdminId;
                    }
                } else {
                    finalOwnerId = primaryAdminId;
                }

                // 2. Resolve Artist
                let finalArtistId = artistId !== undefined ? (artistId === null || artistId === 'null' || artistId === 'undefined' || artistId === '' ? null : Number(artistId)) : track.artist_id;
                let finalArtistName = typeof artistName === 'string' ? artistName.trim() : (track.artist_name || null);

                if (typeof artistName === 'string') {
                    const trimmedName = artistName.trim();
                    const lowerName = trimmedName.toLowerCase();
                    if (trimmedName === "" || lowerName === "null" || lowerName === "undefined") {
                        finalArtistId = null;
                        finalArtistName = null;
                    } else {
                        const existingArtist = artistRepository.getByName(trimmedName);
                        if (existingArtist) {
                            finalArtistId = existingArtist.id;
                            finalArtistName = existingArtist.name;
                        } else {
                            finalArtistId = artistRepository.create(trimmedName);
                            finalArtistName = trimmedName;
                        }
                    }
                } else if (artistName === null) {
                    finalArtistId = null;
                    finalArtistName = null;
                } else if (finalArtistId) {
                    const existingArtist = artistRepository.getById(finalArtistId);
                    if (existingArtist) {
                        finalArtistName = existingArtist.name;
                    }
                }

                // 3. Resolve Album
                let finalAlbumId = albumId !== undefined ? (albumId === null || albumId === 'null' || albumId === 'undefined' || albumId === '' || albumId === 0 || albumId === '0' ? null : Number(albumId)) : track.album_id;
                
                if (albumId === undefined && typeof albumName === "string") {
                    const currentAlbum = track.album_id ? albumRepository.getById(track.album_id) : null;
                    if (!currentAlbum || currentAlbum.title.trim().toLowerCase() !== albumName.trim().toLowerCase()) {
                        finalAlbumId = null; // Force resolution
                    }
                }

                if ((finalAlbumId === null || finalAlbumId === undefined) && typeof albumName === "string") {
                    const trimmedAlbum = albumName.trim();
                    const lowerAlbum = trimmedAlbum.toLowerCase();
                    if (trimmedAlbum === "" || lowerAlbum === "null" || lowerAlbum === "undefined") {
                        finalAlbumId = null;
                    } else {
                        const slug = "lib-" + trimmedAlbum.toLowerCase().replace(/[^a-z0-9]/g, "-");
                        const existingAlbum = albumRepository.getBySlug(slug);
                        finalAlbumId = existingAlbum
                            ? existingAlbum.id
                            : albumRepository.create({
                                  title: trimmedAlbum,
                                  slug,
                                  artist_id: finalArtistId || track.artist_id,
                                  owner_id: finalOwnerId,
                                  date: null,
                                  cover_path: null,
                                  genre: "Library",
                                  description: "",
                                  type: "album",
                                  year: null,
                                  download: null,
                                  price: 0,
                                  price_usdc: 0,
                                  currency: "ETH",
                                  external_links: null,
                                  is_public: false,
                                  visibility: "private",
                                  is_release: false,
                                  published_at: null,
                                  published_to_gundb: false,
                                  published_to_ap: false,
                                  license: null,
                                  status: "draft",
                              });
                    }
                }

                // 4. File renaming plan
                let fileChanges: any = undefined;
                if (track.file_path && fileName && typeof fileName === 'string') {
                    const oldPath = track.file_path;
                    const oldDir = oldPath.includes("/") ? oldPath.substring(0, oldPath.lastIndexOf("/")) : "";
                    const oldExt = oldPath.includes(".") ? oldPath.substring(oldPath.lastIndexOf(".")) : "";
                    let sanitizedName = fileName.replace(/[^a-z0-9_\-]/gi, '_');
                    const newPath = oldDir ? `${oldDir}/${sanitizedName}${oldExt}` : `${sanitizedName}${oldExt}`;

                    if (newPath !== oldPath) {
                        fileChanges = {
                            oldPath,
                            newPath,
                        };
                        trackRepository.update(trackId, { file_path: newPath, album_id: finalAlbumId });

                        if (track.lossless_path) {
                            const losslessPath = track.lossless_path;
                            const losslessExt = losslessPath.includes(".") ? losslessPath.substring(losslessPath.lastIndexOf(".")) : "";
                            const losslessDir = losslessPath.includes("/") ? losslessPath.substring(losslessPath.lastIndexOf(".")) : "";
                            const newLosslessPath = losslessDir ? `${losslessDir}/${sanitizedName}${losslessExt}` : `${sanitizedName}${losslessExt}`;
                            fileChanges.oldLossless = losslessPath;
                            fileChanges.newLossless = newLosslessPath;
                            trackRepository.update(trackId, { lossless_path: newLosslessPath });
                        }
                    }
                }

                // 5. Build dynamic updates
                const updates: any = {};
                if (title !== undefined) updates.title = title;
                updates.artist_id = finalArtistId;
                updates.artist_name = finalArtistName;

                if (finalAlbumId !== undefined) updates.album_id = finalAlbumId;
                if (ownerId !== undefined) updates.owner_id = finalOwnerId;
                if (trackNumber !== undefined) updates.track_num = trackNumber ? Number(trackNumber) : null;
                if (duration !== undefined) updates.duration = parseFloat(duration);

                if (price !== undefined || priceUsdc !== undefined || priceUsdt !== undefined) {
                    updates.price = price ?? track.price;
                    updates.price_usdc = priceUsdc ?? track.price_usdc;
                    updates.currency = currency ?? track.currency;
                    if (priceUsdt !== undefined) {
                        updates.price_usdt = priceUsdt;
                    }
                }

                if (lyrics !== undefined) updates.lyrics = lyrics;
                if (genre !== undefined) updates.genre = genre;
                if (year !== undefined) updates.year = year ? Number(year) : null;

                if (externalArtwork !== undefined) {
                    updates.external_artwork = externalArtwork;
                }

                if (data.service !== undefined) updates.service = data.service;
                if (data.url !== undefined) updates.url = data.url;
                if (data.external_id !== undefined || data.externalId !== undefined) {
                    updates.external_id = data.external_id ?? data.externalId;
                }

                // Apply update
                trackRepository.update(trackId, updates);

                // Fetch the updated track row
                const updatedTrack = trackRepository.getById(trackId)!;

                return {
                    track: updatedTrack,
                    fileChanges,
                    requiresTagSync: !data.skipTagWrite,
                    requiresPublishingSync: !data.skipSync
                };
            })();
        },

        // Playlists
        getPlaylists(u?: string, profile?: VisibilityProfile | ViewerContext): Playlist[] {
            const context = getContextFromProfile(profile);
            const po = context.role === UserRole.GUEST;
            let sql = po ? "SELECT id, name, username, description, is_public as isPublic, cover_path as coverPath, created_at as createdAt FROM playlists WHERE is_public = 1" : "SELECT id, name, username, description, is_public as isPublic, cover_path as coverPath, created_at as createdAt FROM playlists";
            if (u) sql += po ? " AND username = ?" : " WHERE username = ?";
            return (u ? db.prepare(sql).all(u) : db.prepare(sql).all()) as any[];
        },
        getPlaylist: (id: number) => db.prepare("SELECT id, name, username, description, is_public as isPublic, cover_path as coverPath, created_at as createdAt FROM playlists WHERE id = ?").get(id) as any,
        createPlaylist: (n: string, u: string, d?: string, ip = false) => Number(db.prepare("INSERT INTO playlists (name, username, description, is_public) VALUES (?, ?, ?, ?)").run(n, u, d || null, ip ? 1 : 0).lastInsertRowid),
        updatePlaylistVisibility: (id: number, ip: boolean) => { db.prepare("UPDATE playlists SET is_public = ? WHERE id = ?").run(ip ? 1 : 0, id); },
        updatePlaylistCover: (id: number, p: string | null) => { db.prepare("UPDATE playlists SET cover_path = ? WHERE id = ?").run(p, id); },
        deletePlaylist: (id: number) => { db.prepare("DELETE FROM playlists WHERE id = ?").run(id); },
        getPlaylistTracks: (id: number) => db.prepare("SELECT t.* FROM tracks t JOIN playlist_tracks pt ON t.id = pt.track_id WHERE pt.playlist_id = ? ORDER BY pt.position").all(id) as any[],
        isTrackInPublicPlaylist: (id: number) => !!db.prepare("SELECT 1 FROM playlist_tracks pt JOIN playlists p ON pt.playlist_id = p.id WHERE pt.track_id = ? AND p.is_public = 1").get(id),
        addTrackToPlaylist: (pid: number, tid: number) => { const m = db.prepare("SELECT MAX(position) as m FROM playlist_tracks WHERE playlist_id = ?").get(pid) as any; db.prepare("INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)").run(pid, tid, (m?.m || 0) + 1); },
        removeTrackFromPlaylist: (pid: number, tid: number) => { db.prepare("DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?").run(pid, tid); },

        // Search
        search: (q: string, p?: VisibilityProfile | ViewerContext) => ({ 
            artists: artistRepository.getAll(p).filter(a => a.name.toLowerCase().includes(q.toLowerCase())), 
            albums: albumRepository.search(q, 10, p), 
            tracks: trackRepository.getAll(p).filter(t => t.title.toLowerCase().includes(q.toLowerCase())) 
        }),

        // Stats
        async getStats(aid?: number, oid?: number) { 
            const isAdmin = aid === undefined && oid === undefined;
            const profile = isAdmin ? VisibilityProfile.ALL_ACCESS : VisibilityProfile.PUBLIC_STAGE;
            const genres = this.getGenres(profile);

            return { 
                artists: artistRepository.getCount(), 
                albums: albumRepository.getCount(), 
                tracks: trackRepository.getCount(), 
                publicAlbums: albumRepository.getLibraryAlbums(VisibilityProfile.PUBLIC_STAGE).length, 
                totalUsers: (db.prepare("SELECT COUNT(*) as count FROM admin").get() as any).count, 
                storageUsed: 0, networkSites: 0, totalTracks: trackRepository.getCount(), 
                genresCount: genres.length, genres: genres 
            }; 
        },
        getPublicTracksCount: () => trackRepository.getAll(VisibilityProfile.PUBLIC_STAGE).length,
        getGenres(p?: VisibilityProfile | ViewerContext): string[] {
            const context = getContextFromProfile(p);
            const filter = VisibilityGuardian.getTrackFilter(context, 'v_tracks');
            const rows = db.prepare(`SELECT DISTINCT genre FROM v_tracks WHERE genre IS NOT NULL AND genre != '' AND (${filter.sql})`).all(...filter.params) as any[];
            const genreSet = new Set<string>();
            rows.forEach(r => {
                r.genre.split(',').forEach((g: string) => {
                    const trimmed = g.trim();
                    if (trimmed) genreSet.add(trimmed);
                });
            });
            return Array.from(genreSet).sort();
        },
        getTracksByGenre(g: string, p?: VisibilityProfile | ViewerContext): Track[] {
            const context = getContextFromProfile(p);
            const filter = VisibilityGuardian.getTrackFilter(context, 'v_tracks');
            const rows = db.prepare(`SELECT * FROM v_tracks WHERE (genre = ? OR genre LIKE ? OR genre LIKE ? OR genre LIKE ?) AND (${filter.sql}) ORDER BY artist_name, album_title, track_num`).all(g, `${g},%`, `%, ${g},%`, `%, ${g}`, ...filter.params);
            return rows.map(r => (trackRepository as any).mapTrack(r));
        },
        getGenreTrackCounts(p?: VisibilityProfile | ViewerContext): Map<string, number> {
            const context = getContextFromProfile(p);
            const filter = VisibilityGuardian.getTrackFilter(context, 'v_tracks');
            const rows = db.prepare(`SELECT genre, COUNT(*) as count FROM v_tracks WHERE genre IS NOT NULL AND genre != '' AND (${filter.sql}) GROUP BY genre`).all(...filter.params) as any[];
            const counts = new Map<string, number>();
            rows.forEach(r => {
                r.genre.split(',').forEach((g: string) => {
                    const trimmed = g.trim().toLowerCase();
                    if (trimmed) {
                        counts.set(trimmed, (counts.get(trimmed) || 0) + r.count);
                    }
                });
            });
            return counts;
        },
        getListeningStats: () => ({ totalPlays: 0, uniqueTracks: 0, totalListeningTime: 0, playsToday: 0, playsThisWeek: 0, playsThisMonth: 0 }),

        // Maintenance
        getTracksMissingMetadata: (f: any) => trackRepository.getMissingMetadata(f),
        getAlbumsMissingMetadata: (f: any) => albumRepository.getMissingMetadata(f),
        getArtistsMissingMetadata: (f: any) => artistRepository.getMissingMetadata(f),
        consolidateLibrary(): void {
            db.transaction(() => {
                db.prepare("DELETE FROM albums WHERE id NOT IN (SELECT DISTINCT album_id FROM tracks WHERE album_id IS NOT NULL) AND is_release = 0").run();
                db.prepare("DELETE FROM albums WHERE id NOT IN (SELECT DISTINCT album_id FROM tracks WHERE album_id IS NOT NULL) AND is_release = 1").run();
                db.prepare("DELETE FROM artists WHERE id != -1 AND id NOT IN (SELECT DISTINCT artist_id FROM albums WHERE artist_id IS NOT NULL) AND id NOT IN (SELECT DISTINCT artist_id FROM tracks WHERE artist_id IS NOT NULL)").run();
            })();
        },
        pruneOrphans(): void {
            db.transaction(() => {
                db.prepare("DELETE FROM albums WHERE id NOT IN (SELECT DISTINCT album_id FROM tracks WHERE album_id IS NOT NULL) AND is_release = 0").run();
                db.prepare("DELETE FROM albums WHERE id NOT IN (SELECT DISTINCT release_id FROM release_tracks WHERE release_id IS NOT NULL) AND is_release = 1").run();
                db.prepare("DELETE FROM artists WHERE id != -1 AND id NOT IN (SELECT artist_id FROM albums) AND id NOT IN (SELECT artist_id FROM tracks)").run();
            })();
        },
    };
}
