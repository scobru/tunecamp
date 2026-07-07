
import type { Artist, User, Album, RemoteActor, Follower, Release, Track, Post, ApNote, ApReply } from "../../core/database.types.js";

/**
 * FederationProvider Interface
 * This is the "Seam" between ActivityPub/Federation logic and the Storage layer.
 */
export interface FederationProvider {
  // Settings
  getSetting(key: string): string | undefined;
  setSetting(key: string, value: string): void;

  // Local Users (Phase 4)
  getUser(id: number): User | undefined;
  getUserByUsername(username: string): User | undefined;
  updateUserApKeys(userId: number, pubKey: string, privKey: string): void;

  // Local Artists
  getArtist(id: number): Artist | undefined;
  getArtistBySlug(slug: string): Artist | undefined;
  getArtists(profile?: any): Artist[];
  isArtistLinkedToUser(id: number): boolean;
  updateArtistKeys(id: number, publicKey: string, privateKey: string): void;
  updateArtistMigrationStatus(id: number, alsoKnownAs: string[] | null, movedTo: string | null): void;
  updateArtist(id: number, name?: string, bio?: string, photoPath?: string, links?: any, postParams?: any, walletAddress?: string, visibility?: 'public' | 'private' | 'unlisted'): void;

  // Local Tracks & Albums (Phase 3)
  getTrack(id: number): Track | undefined;
  getAlbum(id: number): Album | undefined;

  // Local Content
  getReleases(allAccess?: boolean): Release[];
  getReleasesByArtist(artistId: number): Release[];
  getTracksByReleaseId(releaseId: number): Track[];
  getPostsByArtist(artistId: number): Post[];

  // Remote Content
  getRemoteActor(uri: string): RemoteActor | undefined;
  getRemoteActorsByUris(uris: string[]): RemoteActor[];
  upsertRemoteActor(actor: Partial<RemoteActor>): void;
  upsertRemoteContent(content: any): void;
  unfollowActor(uri: string): void;

  // Following (per-artist follow-back of remote actors)
  addFollowing(artistId: number, actorUri: string, inboxUri?: string): void;
  removeFollowing(artistId: number, actorUri: string): void;
  isFollowing(artistId: number, actorUri: string): boolean;

  // Social
  getFollowers(artistId: number): Follower[];
  getFollowerInboxes(artistId: number): string[];
  getPendingFollowers(artistId: number): Follower[];
  getFollower(artistId: number, actorUri: string): Follower | undefined;
  addFollower(artistId: number, actorUri: string, inboxUri: string, sharedInboxUri?: string, followId?: string): void;
  acceptFollower(artistId: number, actorUri: string): void;
  acceptPendingFollowers(artistId: number): void;
  transaction?<T>(fn: () => T): T;
  rejectFollower(artistId: number, actorUri: string): void;
  removeFollower(artistId: number, actorUri: string): void;
  removeAllFollowers(actorUri: string): void;
  updateFollowerUri(oldActorUri: string, newActorUri: string, newInboxUri: string, newSharedInboxUri?: string): void;

  // AP Notes
  createApNote(artistId: number, noteId: string, noteType: 'post' | 'release' | 'board', contentId: number, contentSlug: string, contentTitle: string): number;
  getApNotes(artistId: number, includeDeleted?: boolean): ApNote[];
  getApNotesByArtistIds(artistIds: number[], includeDeleted?: boolean): ApNote[];
  getApNoteByContent(artistId: number, noteType: string, contentId: number): ApNote | undefined;
  getApNote(noteId: string): ApNote | undefined;
  markApNoteDeleted(noteId: string): void;
  addApReply(noteId: string, replyUri: string, actorUri: string, content: string, publishedAt?: string): boolean;
  getApReplies(noteId: string): ApReply[];
  getApReply(replyUri: string): ApReply | undefined;
  deleteApReply(replyUri: string): boolean;
}
