import crypto from "crypto";
import type { Database } from "better-sqlite3";

/**
 * Durable, at-least-once retry queue for outbound ActivityPub delivery.
 *
 * Federation delivery is fire-and-forget over the network: remote instances go
 * down, rate-limit, or time out, and a process restart mid-fan-out would
 * otherwise lose the activity entirely. This queue persists failed deliveries
 * to SQLite and retries them with exponential backoff until they succeed or a
 * max attempt count is reached (dead-lettered as `status='failed'`).
 *
 * It is intentionally a *fallback*, not the primary path: the caller still
 * attempts immediate delivery first (preserving today's timing semantics) and
 * only enqueues on failure. No Redis required — the existing SQLite database is
 * the backing store.
 */

export interface DeliveryResult {
    ok: boolean;
}

/** Re-attempt a stored delivery. Returns true when the remote accepted it. */
export type DeliverFn = (actorSlug: string, inboxUri: string, activityJson: any) => Promise<boolean>;

const MAX_ATTEMPTS = 12;          // ~spans well over a day with the backoff below
const BASE_DELAY_MS = 60_000;     // 1 minute
const MAX_DELAY_MS = 6 * 60 * 60_000; // 6 hours cap
const POLL_INTERVAL_MS = 30_000;  // how often the worker scans for due rows
const BATCH_SIZE = 20;            // due rows processed per tick

interface QueueRow {
    id: number;
    actor_slug: string;
    inbox_uri: string;
    activity_json: string;
    attempts: number;
}

export class DeliveryQueue {
    private timer: NodeJS.Timeout | null = null;
    private running = false;

    constructor(
        private db: Database,
        private deliver: DeliverFn,
        private baseUrl: string
    ) {}

    /** Persist a delivery for background retry. `activity` may be a Fedify object or a plain JSON-LD object. */
    async enqueue(actorSlug: string, inboxUri: string, activity: any): Promise<void> {
        try {
            let json: any;
            if (activity && typeof activity.toJsonLd === "function") {
                json = await activity.toJsonLd();
            } else {
                json = { ...activity };
            }
            if (!json["@context"]) json["@context"] = "https://www.w3.org/ns/activitystreams";
            if (!json.id) json.id = `${this.baseUrl}/activity/${crypto.randomUUID()}`;

            this.db.prepare(
                `INSERT INTO ap_delivery_queue (actor_slug, inbox_uri, activity_json, attempts, next_attempt_at, status)
                 VALUES (?, ?, ?, 0, ?, 'pending')`
            ).run(actorSlug, inboxUri, JSON.stringify(json), this.nowMs());

            console.warn(`📨 [DeliveryQueue] Queued failed delivery to ${inboxUri} for retry (actor: ${actorSlug})`);
        } catch (e: any) {
            console.error(`❌ [DeliveryQueue] Could not enqueue delivery to ${inboxUri}:`, e?.message || e);
        }
    }

    /** Start the background retry worker. Safe to call once at startup. */
    start(): void {
        if (this.timer) return;
        // Kick once shortly after boot to flush anything left from a previous run,
        // then poll on an interval.
        this.timer = setInterval(() => { void this.processDue(); }, POLL_INTERVAL_MS);
        void this.processDue();
        console.log(`📨 [DeliveryQueue] Retry worker started (poll ${POLL_INTERVAL_MS / 1000}s, max ${MAX_ATTEMPTS} attempts)`);
    }

    stop(): void {
        if (this.timer) { clearInterval(this.timer); this.timer = null; }
    }

    /** Process all currently-due rows (bounded per tick). */
    async processDue(): Promise<void> {
        if (this.running) return; // no overlapping runs
        this.running = true;
        try {
            const rows = this.db.prepare(
                `SELECT id, actor_slug, inbox_uri, activity_json, attempts
                 FROM ap_delivery_queue
                 WHERE status = 'pending' AND next_attempt_at <= ?
                 ORDER BY next_attempt_at ASC
                 LIMIT ?`
            ).all(this.nowMs(), BATCH_SIZE) as QueueRow[];

            for (const row of rows) {
                let activityJson: any;
                try {
                    activityJson = JSON.parse(row.activity_json);
                } catch {
                    // Corrupt payload — drop it rather than retry forever.
                    this.markFailed(row.id, "corrupt payload");
                    continue;
                }

                let ok = false;
                try {
                    ok = await this.deliver(row.actor_slug, row.inbox_uri, activityJson);
                } catch (e: any) {
                    ok = false;
                    this.recordError(row, e?.message || String(e));
                    continue;
                }

                if (ok) {
                    this.db.prepare(`DELETE FROM ap_delivery_queue WHERE id = ?`).run(row.id);
                } else {
                    this.recordError(row, "remote rejected delivery");
                }
            }
        } catch (e: any) {
            console.error(`❌ [DeliveryQueue] processDue failed:`, e?.message || e);
        } finally {
            this.running = false;
        }
    }

    private recordError(row: QueueRow, error: string): void {
        const attempts = row.attempts + 1;
        if (attempts >= MAX_ATTEMPTS) {
            this.markFailed(row.id, error);
            console.error(`💀 [DeliveryQueue] Giving up on delivery to ${row.inbox_uri} after ${attempts} attempts: ${error}`);
            return;
        }
        const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempts - 1), MAX_DELAY_MS);
        this.db.prepare(
            `UPDATE ap_delivery_queue SET attempts = ?, next_attempt_at = ?, last_error = ? WHERE id = ?`
        ).run(attempts, this.nowMs() + delay, error.slice(0, 500), row.id);
    }

    private markFailed(id: number, error: string): void {
        this.db.prepare(
            `UPDATE ap_delivery_queue SET status = 'failed', last_error = ? WHERE id = ?`
        ).run(error.slice(0, 500), id);
    }

    private nowMs(): number {
        return Date.now();
    }
}
