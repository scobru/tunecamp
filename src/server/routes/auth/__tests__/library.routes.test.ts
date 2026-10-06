import express from "express";
import request from "supertest";
import crypto from "node:crypto";
import { jest } from "@jest/globals";
import { generateKeyPair, signPayload } from "fid";
import { createDatabase } from "../../../core/database.js";
import { createLibrarySyncRoutes } from "../library.js";

describe("library sync routes", () => {
	let app: express.Express;
	let keys: { pub: string; priv: string };
	let other: { pub: string; priv: string };
	let active = 1;

	beforeEach(async () => {
		keys = await generateKeyPair();
		other = await generateKeyPair();
		active = 1;
		const database = createDatabase(":memory:");
		const container: any = {
			database,
			authService: {
				getUserByZenPubKey: jest.fn((pub: string) =>
					pub === keys.pub ? { id: 1, username: "alice", is_active: active } : undefined,
				),
			},
		};
		app = express();
		app.use("/api/auth/zen/library", createLibrarySyncRoutes(container));
	});

	/** Signs the way the website does: X-Fid-Auth = `<ts>.<sig>` over method, path, ts and body hash. */
	async function signed(method: string, path: string, body = "", priv = keys.priv, ts = Date.now()) {
		const hash = crypto.createHash("sha256").update(body).digest("hex");
		const sig = await signPayload(`fid-library:${method}:${path}:${ts}:${hash}`, priv);
		return `${ts}.${sig}`;
	}

	async function put(records: unknown[], pub = keys.pub, priv = keys.priv) {
		const path = `/api/auth/zen/library/${pub}`;
		const body = JSON.stringify({ records });
		return request(app).put(path).set("Content-Type", "text/plain").set("X-Fid-Auth", await signed("PUT", path, body, priv)).send(body);
	}

	async function get(since = 0, pub = keys.pub, priv = keys.priv) {
		const path = `/api/auth/zen/library/${pub}`;
		return request(app).get(`${path}?since=${since}`).set("X-Fid-Auth", await signed("GET", path, "", priv));
	}

	const rec = (id: string, at: number, extra: object = {}) => ({ bucket: "favorites", id, d: "ciphertext", at, del: 0, ...extra });

	test("round-trips records and only returns what changed since", async () => {
		expect((await put([rec("a", 100), rec("b", 200)])).status).toBe(200);
		const all = await get(0);
		expect(all.body.records.map((r: any) => r.id)).toEqual(["a", "b"]);
		expect((await get(100)).body.records.map((r: any) => r.id)).toEqual(["b"]);
	});

	test("an older write never overwrites a newer record, a newer one does", async () => {
		await put([rec("a", 200, { d: "new" })]);
		await put([rec("a", 100, { d: "old" })]);
		expect((await get(0)).body.records[0].d).toBe("new");
		await put([rec("a", 300, { d: "newer" })]);
		expect((await get(0)).body.records[0].d).toBe("newer");
	});

	test("a tombstone keeps the id but drops the payload", async () => {
		await put([rec("a", 100)]);
		await put([rec("a", 200, { del: 1 })]);
		expect((await get(0)).body.records[0]).toMatchObject({ id: "a", d: "", del: 1 });
	});

	test("rejects a signature from another key, a tampered body and a stale timestamp", async () => {
		const path = `/api/auth/zen/library/${keys.pub}`;
		const body = JSON.stringify({ records: [rec("a", 1)] });
		const forged = await signed("PUT", path, body, other.priv);
		expect((await request(app).put(path).set("X-Fid-Auth", forged).send(body)).status).toBe(401);

		const good = await signed("PUT", path, body);
		const tampered = JSON.stringify({ records: [rec("evil", 1)] });
		expect((await request(app).put(path).set("X-Fid-Auth", good).set("Content-Type", "text/plain").send(tampered)).status).toBe(401);

		const stale = await signed("PUT", path, body, keys.priv, Date.now() - 10 * 60 * 1000);
		expect((await request(app).put(path).set("X-Fid-Auth", stale).set("Content-Type", "text/plain").send(body)).status).toBe(401);
		expect((await request(app).get(path)).status).toBe(401);
	});

	test("a valid key that is not an active account here is refused", async () => {
		expect((await put([rec("a", 1)], other.pub, other.priv)).status).toBe(403);
		active = 0;
		expect((await put([rec("a", 1)])).status).toBe(403);
	});

	test("rejects malformed records and oversized payloads", async () => {
		expect((await put([{ bucket: "nope", id: "a", d: "x", at: 1, del: 0 }])).status).toBe(400);
		expect((await put([rec("a", 1, { d: "x".repeat(70 * 1024) })])).status).toBe(400);
		expect((await put(Array.from({ length: 201 }, (_, i) => rec(`r${i}`, 1)))).status).toBe(400);
	});

	test("shared playlists are public in the clear; deleted ones are gone", async () => {
		const shared = { bucket: "shared", id: "p1", d: JSON.stringify({ name: "Mix", items: [{ t: 1 }] }), at: 500, del: 0 };
		await put([shared]);
		const open = await request(app).get(`/api/auth/zen/library/${keys.pub}/shared/p1`);
		expect(open.status).toBe(200);
		expect(open.body).toMatchObject({ name: "Mix", at: 500 });
		await put([{ ...shared, at: 600, del: 1 }]);
		expect((await request(app).get(`/api/auth/zen/library/${keys.pub}/shared/p1`)).status).toBe(404);
	});
});
