import type { DatabaseService, Track } from "../../core/database.js";
import { VisibilityProfile, VisibilityGuardian, ViewerContext } from "../../common/visibility.js";

/**
 * Deep module for Subsonic protocol logic.
 * Decouples Subsonic DTO mapping and data orchestration from the Express router.
 */
export class SubsonicService {
  constructor(private db: DatabaseService) {}

  // --- Formatters (DTO Mappers) ---

  formatTrack(track: Track, username: string, starredSet?: Set<string>, ratingsMap?: Map<string, number>) {
    const id = `tr_${track.id}`;
    return {
      '@id': id,
      '@parent': track.album_id ? `al_${track.album_id}` : undefined,
      '@isDir': false,
      '@title': track.title,
      '@album': track.album_title,
      '@artist': track.artist_name,
      '@track': track.track_num,
      '@year': track.year,
      '@genre': track.genre,
      '@coverArt': track.album_id ? `al_${track.album_id}` : id,
      '@size': 0,
      '@contentType': this.getContentType(track.format),
      '@suffix': track.format || 'mp3',
      '@duration': Math.floor(track.duration || 0),
      '@bitRate': track.bitrate ? Math.round(track.bitrate / 1000) : 128,
      '@path': track.file_path,
      '@albumId': track.album_id ? `al_${track.album_id}` : undefined,
      '@artistId': track.artist_id ? `ar_${track.artist_id}` : undefined,
      '@type': 'music',
      '@created': track.created_at,
      '@starred': (starredSet ? starredSet.has(id) : this.db.isStarred(username, 'track', id)) ? track.created_at || new Date().toISOString() : undefined,
      '@userRating': (ratingsMap ? ratingsMap.get(id) : this.db.getItemRating(username, 'track', id)) || undefined,
      '@averageRating': (ratingsMap ? ratingsMap.get(id) : this.db.getItemRating(username, 'track', id)) || undefined,
      '@discNumber': (track as any).disc_number || 1,
      '@samplingRate': track.sample_rate || 44100,
      '@bitDepth': (track as any).bit_depth || 16
    };
  }

  formatTracksBulk(tracks: Track[], username: string) {
    if (tracks.length === 0) return [];
    const starredItems = this.db.getStarredItems(username, 'track');
    const starredSet = new Set<string>(starredItems.map((s: any) => s.item_id));
    const ratingsMap = this.db.getItemRatings(username, 'track');
    return tracks.map((t: Track) => this.formatTrack(t, username, starredSet, ratingsMap));
  }

  formatAlbum(album: any, username: string) {
    const id = `al_${album.id}`;
    const artistId = album.artist_id ? `ar_${album.artist_id}` : undefined;
    return {
      '@id': id,
      '@name': album.title,
      '@title': album.title,
      '@artist': album.artist_name || 'Unknown Artist',
      '@artistId': artistId,
      '@isDir': true,
      '@coverArt': id,
      '@songCount': album.songCount || 0,
      '@duration': Math.floor(album.duration || 0),
      '@created': album.created_at,
      '@year': album.year || (album.date ? new Date(album.date).getFullYear() : undefined),
      '@genre': album.genre,
      '@starred': this.db.isStarred(username, 'album', id) ? album.created_at || new Date().toISOString() : undefined,
      '@userRating': this.db.getItemRating(username, 'album', id) || undefined
    };
  }

  formatArtist(artist: any, username: string) {
    const id = `ar_${artist.id}`;
    return {
      '@id': id,
      '@name': artist.name,
      '@coverArt': id,
      '@artistImageUrl': `getCoverArt.view?id=${id}`,
      '@albumCount': artist.albumCount || 0,
      '@starred': this.db.isStarred(username, 'artist', id) ? artist.created_at || new Date().toISOString() : undefined,
      '@userRating': this.db.getItemRating(username, 'artist', id) || undefined
    };
  }

  getContentType(format?: string | null): string {
    if (!format) return 'audio/mpeg';
    const f = format.toLowerCase();
    if (f === 'flac') return 'audio/flac';
    if (f === 'ogg' || f === 'opus') return 'audio/ogg';
    if (f === 'wav') return 'audio/wav';
    if (f === 'm4a' || f === 'mp4') return 'audio/mp4';
    return 'audio/mpeg';
  }

  // --- Logic Methods ---

  getIndexes(username: string) {
    const artists = this.db.getArtists(VisibilityProfile.ALL_ACCESS);
    const indexes: Record<string, any[]> = {};
    const albumCounts = this.db.getArtistAlbumCounts();
    const countMap = new Map<number, number>();
    for (const row of albumCounts) {
      countMap.set(row.artist_id, row.count);
    }

    artists.forEach((artist: any) => {
      let char = artist.name.charAt(0).toUpperCase();
      if (!/[A-Z]/.test(char)) char = '#';
      if (!indexes[char]) indexes[char] = [];
      
      const artistData = this.formatArtist({
        ...artist,
        albumCount: (countMap.get(artist.id) || 0)
      }, username);
      indexes[char].push(artistData);
    });

    const sortedKeys = Object.keys(indexes).sort();
    return sortedKeys.map((key: string) => ({
      '@name': key,
      artist: indexes[key]
    }));
  }

  getMusicDirectory(id: string, username: string) {
    if (id.startsWith('ar_')) {
      const artistId = parseInt(id.substring(3));
      const artist = this.db.getArtist(artistId);
      if (!artist) return null;

      const libraryAlbums = this.db.getAlbumsByArtist(artistId, VisibilityProfile.ALL_ACCESS);
      const albumIds = libraryAlbums.map((album: any) => album.id);
      const albumStats = new Map<number, { songCount: number; duration: number }>();

      if (albumIds.length > 0) {
        const allTracks = this.db.getTracksByAlbumIds(albumIds);
        for (const track of allTracks) {
          if (track.album_id !== null) {
            const stats = albumStats.get(track.album_id) || { songCount: 0, duration: 0 };
            stats.songCount++;
            stats.duration += (track.duration || 0);
            albumStats.set(track.album_id, stats);
          }
        }
      }

      const allAlbums = libraryAlbums.map((album: any) => {
        const stats = albumStats.get(album.id) || { songCount: 0, duration: 0 };
        return { ...album, songCount: stats.songCount, duration: stats.duration };
      });

      return {
        '@id': id,
        '@name': artist.name,
        '@parent': '1',
        child: allAlbums.map((album: any) => this.formatAlbum(album, username))
      };
    }

    if (id.startsWith('al_')) {
      const albumId = parseInt(id.substring(3));
      const album = this.db.getAlbum(albumId) as any;
      if (!album) return null;

      const tracks = this.db.getTracks(albumId);
      return {
        '@id': id,
        '@name': album.title,
        '@parent': album.artist_id ? `ar_${album.artist_id}` : '1',
        child: this.formatTracksBulk(tracks, username)
      };
    }

    return null;
  }

  getAlbumList(type: string, size: number, offset: number, username: string) {
    const allAlbums = this.db.getAlbumsWithStats(VisibilityProfile.ALL_ACCESS);
    let albums = [...allAlbums];
    
    if (type === 'random') albums.sort(() => Math.random() - 0.5);
    else if (type === 'newest' || type === 'recent') albums.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    else if (type === 'alphabeticalByName') albums.sort((a, b) => a.title.localeCompare(b.title));
    else if (type === 'alphabeticalByArtist') albums.sort((a, b) => (a.artist_name || '').localeCompare(b.artist_name || ''));

    const paginated = albums.slice(offset, offset + size);
    return paginated.map((a: any) => this.formatAlbum(a, username));
  }

  search(query: string, username: string) {
    const results = this.db.search(query, VisibilityProfile.ALL_ACCESS);
    return {
      artist: results.artists.map((a: any) => this.formatArtist(a, username)),
      album: results.albums.map((a: any) => {
        const tracks = this.db.getTracks(a.id);
        return this.formatAlbum({ ...a, songCount: tracks.length, duration: tracks.reduce((acc: number, t: Track) => acc + (t.duration || 0), 0) }, username);
      }),
      song: this.formatTracksBulk(results.tracks, username)
    };
  }

  getStarred(username: string) {
    const starred = this.db.getStarredItems(username);
    const response: any = { artist: [], album: [], song: [] };
    const tracksToFormat: Track[] = [];

    starred.forEach((item: any) => {
      const idParts = item.item_id.split('_');
      const id = parseInt(idParts[1] || idParts[0]);
      if (item.item_type === 'artist') {
        const a = this.db.getArtist(id);
        if (a) response.artist.push(this.formatArtist(a, username));
      } else if (item.item_type === 'album') {
        const a = this.db.getAlbum(id);
        if (a) response.album.push(this.formatAlbum(a, username));
      } else if (item.item_type === 'track') {
        const t = this.db.getTrack(id);
        if (t) tracksToFormat.push(t);
      }
    });

    response.song = this.formatTracksBulk(tracksToFormat, username);
    return response;
  }

  getArtist(id: string, username: string) {
    const artistId = parseInt(id.startsWith('ar_') ? id.substring(3) : id);
    const artist = this.db.getArtist(artistId);
    if (!artist) return null;

    const libraryAlbums = this.db.getAlbumsByArtist(artistId, VisibilityProfile.ALL_ACCESS);
    const albumIds = libraryAlbums.map(album => album.id);
    const albumStats = new Map<number, { songCount: number; duration: number }>();

    if (albumIds.length > 0) {
      const allTracks = this.db.getTracksByAlbumIds(albumIds);
      for (const track of allTracks) {
        if (track.album_id !== null) {
          const stats = albumStats.get(track.album_id) || { songCount: 0, duration: 0 };
          stats.songCount++;
          stats.duration += (track.duration || 0);
          albumStats.set(track.album_id, stats);
        }
      }
    }

    const albums = libraryAlbums.map(a => {
      const stats = albumStats.get(a.id) || { songCount: 0, duration: 0 };
      return { ...a, songCount: stats.songCount, duration: stats.duration };
    });

    return {
      ...this.formatArtist(artist, username),
      album: albums.map(a => this.formatAlbum(a, username))
    };
  }

  getAlbum(id: string, username: string) {
    const albumId = parseInt(id.startsWith('al_') ? id.substring(3) : id);
    const album = this.db.getAlbum(albumId) as any;
    if (!album) return null;

    const tracks = this.db.getTracks(albumId);
    return {
      ...this.formatAlbum({ ...album, songCount: tracks.length, duration: tracks.reduce((acc: number, t: Track) => acc + (t.duration || 0), 0) }, username),
      song: this.formatTracksBulk(tracks, username)
    };
  }

  getGenres() {
    const albums = this.db.getAlbums(VisibilityProfile.ALL_ACCESS);
    const genreMap = new Map<string, { count: number, songCount: number }>();
    const albumIds = albums.map((a: any) => a.id);
    const allTracks = this.db.getTracksByAlbumIds(albumIds);

    const trackCounts = new Map<number, number>();
    allTracks.forEach((t: Track) => {
      if (t.album_id) {
        trackCounts.set(t.album_id, (trackCounts.get(t.album_id) || 0) + 1);
      }
    });

    albums.forEach((album: any) => {
      if (!album.genre) return;
      const songCount = trackCounts.get(album.id) || 0;
      album.genre.split(',').forEach((g: string) => {
        const name = g.trim();
        const data = genreMap.get(name) || { count: 0, songCount: 0 };
        data.count++;
        data.songCount += songCount;
        genreMap.set(name, data);
      });
    });

    return Array.from(genreMap.entries()).sort().map(([name, data]: [string, any]) => ({
      '@value': name,
      '@songCount': data.songCount,
      '@albumCount': data.count
    }));
  }

  getPlaylists(username: string) {
    const playlists = this.db.getPlaylists();
    return playlists.map((p: any) => ({
      '@id': `pl_${p.id}`, 
      '@name': p.name, 
      '@owner': p.username, 
      '@public': p.isPublic ? 'true' : 'false',
      '@created': p.created_at, 
      '@songCount': this.db.getPlaylistTracks(p.id).length
    }));
  }

  getPlaylist(id: number, username: string) {
    const playlist = this.db.getPlaylist(id);
    if (!playlist) return null;

    const tracks = this.db.getPlaylistTracks(id);
    return {
      '@id': `pl_${playlist.id}`, 
      '@name': playlist.name, 
      '@owner': playlist.username,
      '@songCount': tracks.length, 
      entry: this.formatTracksBulk(tracks, username)
    };
  }

  formatPodcastChannel(album: any, username: string, includeEpisodes: boolean, context?: any) {
    const id = `al_${album.id}`;
    const publicUrl = (this.db.getSetting("publicUrl") || "").replace(/\/$/, "");
    const url = `${publicUrl}/artists/${album.artist_slug || 'unknown'}/feed.xml`;
    
    const channel: any = {
      '@id': id,
      '@title': album.title,
      '@description': album.description || '',
      '@status': 'completed',
      '@url': url
    };
    
    if (album.podcast_author) channel['@author'] = album.podcast_author;
    if (album.podcast_email) channel['@email'] = album.podcast_email;
    if (album.podcast_category) channel['@category'] = album.podcast_category;
    if (album.podcast_explicit !== undefined) channel['@explicit'] = album.podcast_explicit ? 'true' : 'false';
    
    if (includeEpisodes) {
      const tracks = this.db.getTracks(album.id, context);
      channel.episode = tracks.map((t: Track) => this.formatPodcastEpisode(t, username));
    }
    
    return channel;
  }

  formatPodcastEpisode(track: Track, username: string) {
    const id = `tr_${track.id}`;
    return {
      '@id': id,
      '@streamId': id,
      '@channelId': track.album_id ? `al_${track.album_id}` : undefined,
      '@title': track.title,
      '@description': track.description || track.title,
      '@publishDate': track.created_at,
      '@status': 'completed',
      '@duration': Math.floor(track.duration || 0),
      '@bytes': track.file_size || 0,
      '@coverArt': track.album_id ? `al_${track.album_id}` : id,
      '@contentType': this.getContentType(track.format),
      '@isDir': false
    };
  }

  getPodcasts(id: string | undefined, includeEpisodes: boolean, context: ViewerContext) {
    const filter = VisibilityGuardian.getAlbumFilter(context, 'a');
    let sql = `
      SELECT a.*, ar.slug as artist_slug
      FROM albums a
      LEFT JOIN artists ar ON a.artist_id = ar.id
      WHERE a.product_type = 'podcast' AND (${filter.sql})
    `;
    const params = [...filter.params];
    
    if (id) {
      const albumId = parseInt(id.startsWith('al_') ? id.substring(3) : id);
      sql += ` AND a.id = ?`;
      params.push(albumId);
    }
    
    sql += ` ORDER BY a.title`;
    
    const rows = (this.db as any).db.prepare(sql).all(...params);
    return rows.map((row: any) => this.formatPodcastChannel(row, context.userId ? 'user' : 'guest', includeEpisodes, context));
  }

  getNewestPodcasts(size: number, offset: number, context: ViewerContext) {
    const filter = VisibilityGuardian.getTrackFilter(context, 't');
    const sql = `
      SELECT t.id
      FROM v_tracks t
      JOIN albums a ON t.album_id = a.id
      WHERE a.product_type = 'podcast' AND (${filter.sql})
      ORDER BY t.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const params = [...filter.params, size, offset];
    const rows = (this.db as any).db.prepare(sql).all(...params);
    const tracks: Track[] = [];
    for (const row of rows) {
      const track = this.db.getTrack(row.id);
      if (track) tracks.push(track);
    }
    return tracks.map((t: Track) => this.formatPodcastEpisode(t, context.userId ? 'user' : 'guest'));
  }
}
