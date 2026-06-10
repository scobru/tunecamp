import crypto from 'crypto';

export interface LiveSession {
    roomId: string;
    title: string;
    username: string;
    artistId?: string | number;
    startedAt: string;
}

/**
 * Registry of active live audio sessions.
 *
 * Sessions are announced here so listeners can discover them; the actual
 * audio travels peer-to-peer over WebRTC (Trystero) between the artist's
 * browser and the listeners' browsers. The server never touches the media,
 * so this stays in memory: a restart simply ends the announcements.
 */
export class LiveService {
    private sessions = new Map<string, LiveSession>();

    list(): LiveSession[] {
        return [...this.sessions.values()];
    }

    getByUsername(username: string): LiveSession | undefined {
        return [...this.sessions.values()].find(s => s.username === username);
    }

    start(username: string, title: string, artistId?: string | number): LiveSession {
        // One live session per user: starting again replaces the previous room
        const existing = this.getByUsername(username);
        if (existing) this.sessions.delete(existing.roomId);

        const session: LiveSession = {
            roomId: crypto.randomBytes(16).toString('hex'),
            title,
            username,
            artistId,
            startedAt: new Date().toISOString()
        };
        this.sessions.set(session.roomId, session);
        return session;
    }

    stop(roomId: string): boolean {
        return this.sessions.delete(roomId);
    }
}
