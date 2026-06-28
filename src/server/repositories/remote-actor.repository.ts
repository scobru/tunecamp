import type { Database as DatabaseType } from "better-sqlite3";
import { BaseRepository } from "./base.repository.js";
import type { RemoteActor } from "../core/database.types.js";

export class RemoteActorRepository extends BaseRepository {
    constructor(db: DatabaseType) {
        super(db);
    }

    upsertRemoteActor(actor: Omit<RemoteActor, "id" | "last_seen" | "is_followed" | "public_key"> & { is_followed?: boolean, public_key?: string | null }): void {
        const b = (val: any) => {
            if (val === null || val === undefined) return null;
            if (typeof val === 'string' || typeof val === 'number' || typeof val === 'bigint' || Buffer.isBuffer(val)) return val;
            return String(val);
        };

        const existing = this.getRemoteActor(actor.uri);
        const isFollowed = actor.is_followed !== undefined ? (actor.is_followed ? 1 : 0) : (existing?.is_followed ? 1 : 0);
        const publicKey = actor.public_key !== undefined ? actor.public_key : existing?.public_key;

        this.db.prepare(`
            INSERT INTO remote_actors (uri, type, username, name, summary, icon_url, inbox_url, outbox_url, public_key, is_followed, last_seen)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(uri) DO UPDATE SET
                type=excluded.type,
                username=excluded.username,
                name=excluded.name,
                summary=excluded.summary,
                icon_url=excluded.icon_url,
                inbox_url=excluded.inbox_url,
                outbox_url=excluded.outbox_url,
                public_key=excluded.public_key,
                is_followed=excluded.is_followed,
                last_seen=CURRENT_TIMESTAMP
        `).run(
            actor.uri,
            actor.type,
            b(actor.username),
            b(actor.name),
            b(actor.summary),
            b(actor.icon_url),
            b(actor.inbox_url),
            b(actor.outbox_url),
            publicKey ? b(publicKey) : null,
            isFollowed
        );
    }

    getRemoteActor(uri: string): RemoteActor | undefined {
        return this.db.prepare("SELECT * FROM remote_actors WHERE uri = ?").get(uri) as RemoteActor | undefined;
    }

    getRemoteActors(): RemoteActor[] {
        const rows = this.db.prepare("SELECT * FROM remote_actors ORDER BY last_seen DESC").all() as any[];
        return rows.map(r => ({ ...r, is_followed: !!r.is_followed }));
    }

    getRemoteActorsByUris(uris: string[]): RemoteActor[] {
        if (!uris || uris.length === 0) return [];
        const CHUNK_SIZE = 900;
        const results: any[] = [];
        for (let i = 0; i < uris.length; i += CHUNK_SIZE) {
            const chunk = uris.slice(i, i + CHUNK_SIZE);
            const placeholders = chunk.map(() => '?').join(',');
            const rows = this.db.prepare(`SELECT * FROM remote_actors WHERE uri IN (${placeholders})`).all(...chunk) as any[];
            results.push(...rows);
        }
        return results.map(r => ({ ...r, is_followed: !!r.is_followed }));
    }

    getFollowedActors(): RemoteActor[] {
        const rows = this.db.prepare("SELECT * FROM remote_actors WHERE is_followed = 1 ORDER BY last_seen DESC").all() as any[];
        return rows.map(r => ({ ...r, is_followed: !!r.is_followed }));
    }

    unfollowActor(uri: string): void {
        this.db.prepare("UPDATE remote_actors SET is_followed = 0 WHERE uri = ?").run(uri);
    }

    saveRemoteActor(actor: any): void {
        this.db.prepare(`
            INSERT INTO remote_actors (uri, type, username, name, summary, icon_url, inbox_url, outbox_url, is_followed, last_seen)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(uri) DO UPDATE SET
                type=excluded.type,
                username=excluded.username,
                name=excluded.name,
                summary=excluded.summary,
                icon_url=excluded.icon_url,
                inbox_url=excluded.inbox_url,
                outbox_url=excluded.outbox_url,
                is_followed=excluded.is_followed,
                last_seen=CURRENT_TIMESTAMP
        `).run(
            actor.uri,
            actor.type,
            actor.username || null,
            actor.name || null,
            actor.summary || null,
            actor.icon_url || null,
            actor.inbox_url || null,
            actor.outbox_url || null,
            actor.is_followed ? 1 : 0
        );
    }
}
