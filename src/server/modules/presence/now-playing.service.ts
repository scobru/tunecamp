/**
 * NowPlayingService — in-memory "now listening" presence.
 *
 * Tracks what opted-in users are currently playing. Presence is ephemeral by
 * design (a heartbeat from the player keeps it alive; it expires after the TTL),
 * so there is nothing to persist — a restart simply clears it, like the live
 * session registry. The per-user opt-in itself lives in the admin table.
 */

export interface NowPlayingEntry {
    username: string;
    trackId: number | string | null;
    title: string;
    artist: string;
    updatedAt: number;
}

const TTL_MS = 60_000; // a user counts as "listening" if they pinged within this window

export class NowPlayingService {
    private entries = new Map<string, NowPlayingEntry>();

    /** Records or refreshes what a user is currently listening to. */
    set(username: string, data: { trackId: number | string | null; title: string; artist: string }): void {
        this.entries.set(username, {
            username,
            trackId: data.trackId ?? null,
            title: data.title,
            artist: data.artist,
            updatedAt: Date.now(),
        });
    }

    /** Removes a user's presence (paused, stopped, or opted out). */
    clear(username: string): void {
        this.entries.delete(username);
    }

    /** Opted-in users seen within the TTL window; prunes stale entries as it goes. */
    list(): NowPlayingEntry[] {
        const cutoff = Date.now() - TTL_MS;
        const out: NowPlayingEntry[] = [];
        for (const [username, entry] of this.entries) {
            if (entry.updatedAt < cutoff) this.entries.delete(username);
            else out.push(entry);
        }
        return out;
    }
}
