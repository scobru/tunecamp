import { describe, test, expect, beforeEach, afterEach } from "@jest/globals";
import { createDatabase } from "../../../core/database.js";
import { requestRelink, approveRelink, dismissRelink } from "../fid-relink.js";

const OLD = "0DGULtYbQYzYDlRUddrRNoS7NrEzGIZAsQrXSKQYThMX1";
const NEW_A = "bE9DAycqb9gbxMJHTxh5RRxVQRPpG-wrCojHVl0s9sM";
const NEW_B = "WZIxm8Lu1Pco9Y-FnOOQcA_wNtjRUr5MFVMjmHf5Zp0";

describe("FID relink requests", () => {
	let db: any;
	let fidOnlyId: number;
	let passwordId: number;

	const waiting = (id: number) => db.prepare("SELECT fid_relink_pub AS pub, fid_relink_requested_at AS at FROM admin WHERE id = ?").get(id);

	beforeEach(() => {
		db = createDatabase(":memory:").db;
		const insert = db.prepare("INSERT INTO admin (username, password_hash, role, zen_pub, zen_auth_mode, is_active) VALUES (?, ?, 'user', ?, ?, 1)");
		fidOnlyId = Number(insert.run("scobru", "", OLD, "zen").lastInsertRowid);
		passwordId = Number(insert.run("carla", "hash", OLD.replace("0", "1"), "hybrid").lastInsertRowid);
	});

	afterEach(() => db.close());

	test("a new key for a FID-only account is recorded as a request, not applied", () => {
		expect(requestRelink(db, "scobru", NEW_A)).toBe("requested");
		const row = waiting(fidOnlyId);
		expect(row.pub).toBe(NEW_A);
		expect(row.at).toBeTruthy();
		expect(db.prepare("SELECT zen_pub FROM admin WHERE id = ?").get(fidOnlyId).zen_pub).toBe(OLD);
	});

	test("the first request wins: another key cannot replace it, the same key is idempotent", () => {
		requestRelink(db, "scobru", NEW_A);
		expect(requestRelink(db, "scobru", NEW_B)).toBe("pending");
		expect(waiting(fidOnlyId).pub).toBe(NEW_A);
		expect(requestRelink(db, "SCOBRU", NEW_A)).toBe("requested");
	});

	test("accounts that do not qualify never get a request", () => {
		expect(requestRelink(db, "carla", NEW_A)).toBe("not-eligible"); // has a password: link from the profile instead
		expect(requestRelink(db, "nobody", NEW_A)).toBe("not-eligible");
		expect(requestRelink(db, "scobru", OLD)).toBe("not-eligible"); // not an Ed25519 key
		expect(requestRelink(db, "scobru", "short")).toBe("not-eligible");
		expect(waiting(passwordId).pub).toBeNull();
	});

	test("approving moves the account to the requested key and clears the request", () => {
		requestRelink(db, "scobru", NEW_A);
		const result = approveRelink(db, fidOnlyId);
		expect(result).toEqual({ username: "scobru", oldPub: OLD, newPub: NEW_A });
		expect(db.prepare("SELECT zen_pub FROM admin WHERE id = ?").get(fidOnlyId).zen_pub).toBe(NEW_A);
		expect(waiting(fidOnlyId).pub).toBeNull();
	});

	test("approving needs a request; dismissing leaves the account alone", () => {
		expect(() => approveRelink(db, fidOnlyId)).toThrow(/no relink request/);
		expect(() => approveRelink(db, 99999)).toThrow(/not found/);
		requestRelink(db, "scobru", NEW_A);
		dismissRelink(db, fidOnlyId);
		expect(waiting(fidOnlyId).pub).toBeNull();
		expect(db.prepare("SELECT zen_pub FROM admin WHERE id = ?").get(fidOnlyId).zen_pub).toBe(OLD);
	});
});
