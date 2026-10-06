import { Router, text } from "express";
import crypto from "node:crypto";
import { verifySignature } from "fid";
import type { ServiceContainer } from "../../core/container.js";
import { rateLimit } from "../../middleware/rateLimit.js";

/**
 * Cross-device sync of a listener's library (favorites, artists, playlists) and the
 * public "shared" playlists of the TuneCamp website player.
 *
 * The server stores opaque records and never interprets them: the private buckets
 * arrive already encrypted in the browser, so all this instance can see is how many
 * records an identity has and when they changed. `shared` is the deliberate exception,
 * a playlist its owner chose to publish, stored in the clear so a link opens for anyone.
 *
 * Auth is a signature, not a session (the caller is the website, another origin):
 * `X-Fid-Auth: <ts>.<sig>`, where `sig` is the identity key's signature over
 * `fid-library:<METHOD>:<path>:<ts>:<sha256 of the body>`. The key must belong to an
 * active account on this instance, so the instance is never free storage for strangers.
 */

const BUCKETS = new Set(["favorites", "artists", "playlists", "shared"]);
const MAX_BODY = 1024 * 1024;
const MAX_RECORDS_PER_PUT = 200;
const MAX_RECORD_BYTES = 64 * 1024;
const MAX_ROWS_PER_PUB = 5000;
const MAX_BYTES_PER_PUB = 8 * 1024 * 1024;
const MAX_SKEW_MS = 5 * 60 * 1000;
const PUB_RE = /^[A-Za-z0-9_-]{20,100}$/;

interface SyncRecord {
	bucket: string;
	id: string;
	d: string;
	at: number;
	del: 0 | 1;
}

function isRecord(r: any): r is SyncRecord {
	return (
		r &&
		BUCKETS.has(r.bucket) &&
		typeof r.id === "string" && r.id.length > 0 && r.id.length <= 200 &&
		typeof r.d === "string" && Buffer.byteLength(r.d) <= MAX_RECORD_BYTES &&
		Number.isSafeInteger(r.at) && r.at >= 0 &&
		(r.del === 0 || r.del === 1)
	);
}

export function createLibrarySyncRoutes(container: ServiceContainer): Router {
	const authService = container.authService;
	const db = ((container.database as any).db || container.database) as import("better-sqlite3").Database;
	const router = Router();
	// Raw text, not json(): the signature covers the exact bytes the client sent.
	router.use(text({ type: "*/*", limit: MAX_BODY }));
	router.use(rateLimit({ windowMs: 60 * 1000, max: 120 }));

	/** Returns the pub key if the request is signed by an active account here, else answers 401/403. */
	async function authenticate(req: any, res: any): Promise<string | null> {
		const pub = String(req.params.pub || "");
		const [ts, sig] = String(req.headers["x-fid-auth"] || "").split(".");
		const issuedAt = Number(ts);
		if (!PUB_RE.test(pub) || !sig || !Number.isSafeInteger(issuedAt) || Math.abs(Date.now() - issuedAt) > MAX_SKEW_MS) {
			res.status(401).json({ error: "Missing or stale signature" });
			return null;
		}
		const body = typeof req.body === "string" ? req.body : "";
		const bodyHash = crypto.createHash("sha256").update(body).digest("hex");
		const payload = `fid-library:${req.method}:${req.baseUrl}${req.path}:${ts}:${bodyHash}`;
		if (!(await verifySignature(payload, sig, pub))) {
			res.status(401).json({ error: "Invalid signature" });
			return null;
		}
		const user = authService.getUserByZenPubKey(pub);
		if (!user || !user.is_active) {
			res.status(403).json({ error: "This identity is not linked to an account on this instance" });
			return null;
		}
		return pub;
	}

	// GET /:pub/shared/:id — the one public read: a playlist its owner chose to publish.
	router.get("/:pub/shared/:id", (req, res) => {
		if (!PUB_RE.test(req.params.pub)) return res.status(404).json({ error: "Not found" });
		const row = db
			.prepare("SELECT d, at FROM library_sync WHERE pub = ? AND bucket = 'shared' AND id = ? AND del = 0")
			.get(req.params.pub, req.params.id) as { d: string; at: number } | undefined;
		if (!row) return res.status(404).json({ error: "Not found" });
		try {
			res.json({ ...JSON.parse(row.d), at: row.at });
		} catch {
			res.status(404).json({ error: "Not found" });
		}
	});

	// GET /:pub?since=<ms> — every record changed after `since`, tombstones included.
	router.get("/:pub", async (req, res) => {
		const pub = await authenticate(req, res);
		if (!pub) return;
		const since = Math.max(0, Number(req.query.since) || 0);
		const records = db
			.prepare("SELECT bucket, id, d, at, del FROM library_sync WHERE pub = ? AND at > ? ORDER BY at LIMIT ?")
			.all(pub, since, MAX_ROWS_PER_PUB);
		res.json({ records });
	});

	// PUT /:pub — upserts a batch; a record only lands if it is newer than the one stored.
	router.put("/:pub", async (req, res) => {
		const pub = await authenticate(req, res);
		if (!pub) return;
		let records: unknown;
		try {
			records = JSON.parse(req.body).records;
		} catch {
			return res.status(400).json({ error: "Invalid JSON" });
		}
		if (!Array.isArray(records) || records.length > MAX_RECORDS_PER_PUT || !records.every(isRecord)) {
			return res.status(400).json({ error: "Invalid records" });
		}
		const usage = db
			.prepare("SELECT COUNT(*) AS rows, COALESCE(SUM(LENGTH(d)), 0) AS bytes FROM library_sync WHERE pub = ?")
			.get(pub) as { rows: number; bytes: number };
		const incoming = (records as SyncRecord[]).reduce((n, r) => n + r.d.length, 0);
		if (usage.rows + records.length > MAX_ROWS_PER_PUB || usage.bytes + incoming > MAX_BYTES_PER_PUB) {
			return res.status(413).json({ error: "Library storage limit reached" });
		}
		const upsert = db.prepare(
			`INSERT INTO library_sync (pub, bucket, id, d, at, del) VALUES (?, ?, ?, ?, ?, ?)
			 ON CONFLICT(pub, bucket, id) DO UPDATE SET d = excluded.d, at = excluded.at, del = excluded.del
			 WHERE excluded.at > library_sync.at`,
		);
		db.transaction((rows: SyncRecord[]) => {
			for (const r of rows) upsert.run(pub, r.bucket, r.id, r.del ? "" : r.d, r.at, r.del);
		})(records as SyncRecord[]);
		res.json({ ok: true, stored: records.length });
	});

	return router;
}
