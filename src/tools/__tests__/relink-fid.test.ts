import { describe, test, expect, beforeEach, afterEach } from "@jest/globals";
import { createDatabase } from "../../server/core/database.js";
import { relinkFid } from "../relink-fid.js";

const OLD = "0DGULtYbQYzYDlRUddrRNoS7NrEzGIZAsQrXSKQYThMX1";
const NEW_A = "bE9DAycqb9gbxMJHTxh5RRxVQRPpG-wrCojHVl0s9sM";
const NEW_B = "WZIxm8Lu1Pco9Y-FnOOQcA_wNtjRUr5MFVMjmHf5Zp0";

describe("relink-fid", () => {
	let dbService: any;
	let db: any;
	let aliceId: number;

	beforeEach(() => {
		dbService = createDatabase(":memory:");
		db = dbService.db;
		const insert = db.prepare("INSERT INTO admin (username, password_hash, role, zen_pub, zen_auth_mode, is_active) VALUES (?, '', 'user', ?, 'zen', 1)");
		aliceId = Number(insert.run("Alice", OLD).lastInsertRowid);
		insert.run("bob", NEW_B);
		db.prepare("INSERT INTO zen_users (pub, alias) VALUES (?, 'alice')").run(OLD);
		db.prepare("INSERT INTO library_sync (pub, bucket, id, d, at, del) VALUES (?, 'favorites', 'a', 'ciphertext', 1, 0)").run(OLD);
		db.prepare("INSERT INTO fid_registry (user_id, instance_domain, public_key, passport_signature, verified) VALUES (?, 'x.test', ?, 'sig', 1)").run(aliceId, OLD);
	});

	afterEach(() => db.close());

	test("moves the account to the new key and invalidates what depended on the old one", () => {
		const before = db.prepare("SELECT token_version FROM admin WHERE id = ?").get(aliceId).token_version || 0;
		const result = relinkFid(db, "alice", NEW_A); // case-insensitive, like sign-in
		expect(result).toEqual({ username: "Alice", oldPub: OLD, newPub: NEW_A });
		const row = db.prepare("SELECT zen_pub, token_version FROM admin WHERE id = ?").get(aliceId);
		expect(row.zen_pub).toBe(NEW_A);
		expect(row.token_version).toBe(before + 1);
		expect(db.prepare("SELECT COUNT(*) AS n FROM zen_users WHERE pub = ?").get(OLD).n).toBe(0);
		expect(db.prepare("SELECT COUNT(*) AS n FROM library_sync WHERE pub = ?").get(OLD).n).toBe(0);
		expect(db.prepare("SELECT public_key, verified, passport_signature FROM fid_registry WHERE user_id = ?").get(aliceId))
			.toEqual({ public_key: NEW_A, verified: 0, passport_signature: null });
	});

	test("refuses a malformed key, an unknown user and a key another account owns, changing nothing", () => {
		expect(() => relinkFid(db, "alice", "short")).toThrow(/43 base64url/);
		expect(() => relinkFid(db, "alice", OLD)).toThrow(/43 base64url/); // a Zen-era key is not an Ed25519 key
		expect(() => relinkFid(db, "nobody", NEW_A)).toThrow(/No account/);
		expect(() => relinkFid(db, "alice", NEW_B)).toThrow(/already belongs to "bob"/);
		expect(db.prepare("SELECT zen_pub FROM admin WHERE id = ?").get(aliceId).zen_pub).toBe(OLD);
	});
});
