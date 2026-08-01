/**
 * Structural contracts for optional "grey" provider plugins (torrent,
 * ytdlp). Defined here — not imported from the plugin folders — so container.ts
 * has no compile-time dependency on plugins/*; deleting a plugin folder for a
 * white-label build never breaks the container's types.
 */
import type { Track } from "./database.types.js";

export interface TorrentServiceContract {
	shutdown(): void;
	addTorrent(magnetUri: string, ownerId: number | null): Promise<string>;
	removeTorrent(infoHash: string): Promise<void>;
	seedFiles(
		filePaths: string[],
		name: string,
		ownerId: number | null,
		artist?: string,
	): Promise<string>;
	getTorrentsStatus(includeFiles?: boolean): any[];
	purgeStuck(timeoutMs?: number): Promise<string[]>;
	syncTorrentFiles(infoHash: string): Promise<{ message: string }>;
}

export interface YtdlpServiceContract {
	localizeTrack(trackId: number): Promise<Track>;
	setCookiesPath(path: string): void;
}
