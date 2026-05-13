
import type { Artist, RemoteActor, Follower, Release, Track, Post, ApNote } from "../../core/database.types.js";

/**
 * FederationProvider Interface
 * This is the "Seam" between ActivityPub/Federation logic and the Storage layer.
 */
export interface FederationProvider {
  // Settings
  getSetting(key: string): string | undefined;
  setSetting(key: string, value: string): void;

  // Local Artists
  getArtist(id: number): Artist | undefined;
  getArtistBySlug(slug: string): Artist | undefined;
  getArtists(): Artist[];
  updateArtistKeys(id: number, publicKey: string, privateKey: string): void;

  // Local Content
  getReleases(): Release[];
  getReleasesByArtist(artistId: number): Release[];
  getTracksByReleaseId(releaseId: number): Track[];
  getPostsByArtist(artistId: number): Post[];

  // Remote Content
  getRemoteActor(uri: string): RemoteActor | undefined;
  upsertRemoteActor(actor: Partial<RemoteActor>): void;
  upsertRemoteContent(content: any): void;
  unfollowActor(uri: string): void;

  // Social
  getFollowers(artistId: number): Follower[];
  addFollower(artistId: number, actorUri: string, inboxUri: string): void;

  // AP Notes
  createApNote(artistId: number, noteId: string, noteType: 'post' | 'release', contentId: number, contentSlug: string, contentTitle: string): number;
  getApNotes(artistId: number, includeDeleted?: boolean): ApNote[];
  getApNote(noteId: string): ApNote | undefined;
  markApNoteDeleted(noteId: string): void;
}
