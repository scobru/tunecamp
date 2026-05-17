import path from "path";
import type { DatabaseService, Album, Release, Track, TrackDTO, AlbumDTO } from "../../core/database.js";

/**
 * Shared DTO Mappers for Catalog and Discovery services.
 * Centralizes the translation from DB entities to frontend-friendly objects.
 */

export function mapTrackDTO(t: Track, database: DatabaseService, username?: string): TrackDTO {
    return {
        ...t,
        albumId: t.album_id,
        artistId: t.artist_id,
        losslessPath: t.lossless_path,
        externalArtwork: t.external_artwork,
        albumName: t.album_title,
        album_download: t.album_download,
        artistName: t.artist_name || null,
        path: t.file_path,
        filename: t.file_path ? path.basename(t.file_path) : undefined,
        coverUrl: t.external_artwork ? `/api/tracks/${t.id}/cover` : (t.album_id ? `/api/albums/${t.album_id}/cover` : null),
        waveform: t.waveform || (t.file_path ? `/api/waveform/${t.id}` : null),
        starred: username ? database.isStarred(username, 'track', String(t.id)) : false,
        rating: username ? database.getItemRating(username, 'track', String(t.id)) : 0
    };
}

export function mapAlbumDTO(a: Album | Release, database: DatabaseService, username?: string): AlbumDTO {
    const album = a as any;
    const is_public = ('is_public' in album) ? !!album.is_public : (album.visibility === 'public' || album.visibility === 'unlisted');
    return {
        ...album,
        is_public,
        is_release: ('is_release' in album) ? !!album.is_release : true,
        coverImage: album.cover_path,
        starred: username ? database.isStarred(username, 'album', String(album.id)) : false,
        rating: username ? database.getItemRating(username, 'album', String(album.id)) : 0
    } as AlbumDTO;
}
