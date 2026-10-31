import type { Database } from "better-sqlite3";

/** An Ed25519 public key as `fid` 5 writes it: 32 bytes, base64url, 43 characters. */
const KEY_RE = /^[A-Za-z0-9_-]{43}$/;

export interface RelinkResult {
	username: string;
	oldPub: string | null;
	newPub: string;
}

/**
 * Moves `username` to `newPub`. Throws, and changes nothing, if the key is malformed, the
 * account does not exist, or another account already owns the key.
 */
export function relinkFid(db: Database, username: string, newPub: string): RelinkResult {
	if (!KEY_RE.test(newPub)) {
		throw new Error("The new public key must be 43 base64url characters (an Ed25519 key from fid 5).");
	}
	const user = db
		.prepare("SELECT id, username, zen_pub FROM admin WHERE username = ? COLLATE NOCASE")
		.get(username) as { id: number; username: string; zen_pub: string | null } | undefined;
	if (!user) throw new Error(`No account named "${username}".`);

	const owner = db
		.prepare("SELECT username FROM admin WHERE zen_pub = ? AND id != ?")
		.get(newPub, user.id) as { username: string } | undefined;
	if (owner) throw new Error(`That key already belongs to "${owner.username}".`);

	db.transaction(() => {
		// token_version + 1 signs out every session issued for the old identity.
		db.prepare("UPDATE admin SET zen_pub = ?, token_version = COALESCE(token_version, 0) + 1 WHERE id = ?").run(newPub, user.id);
		// Passports and the cached profile were issued for the old key; the library records are
		// ciphertext under it and nobody can read them any more.
		db.prepare("UPDATE fid_registry SET public_key = ?, verified = 0, passport_signature = NULL WHERE user_id = ?").run(newPub, user.id);
		if (user.zen_pub) {
			db.prepare("DELETE FROM zen_users WHERE pub = ?").run(user.zen_pub);
			db.prepare("DELETE FROM library_sync WHERE pub = ?").run(user.zen_pub);
		}
	})();

	return { username: user.username, oldPub: user.zen_pub, newPub };
}

/**
 * What the SSO does when a signed-in-with-a-new-key request names an account that already has a
 * different FID key (one created before fid 5.0 re-keyed every identity). The new key proves only
 * that the requester holds it, not that they own the account, so the request is just recorded for
 * an administrator to approve.
 *
 *  - `requested`: recorded (or the same key was already waiting).
 *  - `pending`: a request for another key is already waiting; the first one wins until the
 *    administrator dismisses it, so a stranger cannot replace the owner's request.
 *  - `not-eligible`: the account has no FID key to replace, or logs in with a password.
 */
export function requestRelink(db: Database, username: string, newPub: string): "requested" | "pending" | "not-eligible" {
	if (!KEY_RE.test(newPub)) return "not-eligible";
	const user = db
		.prepare("SELECT id, zen_pub, zen_auth_mode, fid_relink_pub FROM admin WHERE username = ? COLLATE NOCASE")
		.get(username) as { id: number; zen_pub: string | null; zen_auth_mode: string | null; fid_relink_pub: string | null } | undefined;
	if (!user || !user.zen_pub || user.zen_pub === newPub || user.zen_auth_mode !== "zen") return "not-eligible";
	if (user.fid_relink_pub) return user.fid_relink_pub === newPub ? "requested" : "pending";
	db.prepare("UPDATE admin SET fid_relink_pub = ?, fid_relink_requested_at = CURRENT_TIMESTAMP WHERE id = ?").run(newPub, user.id);
	return "requested";
}

/** Drops a waiting request without changing the account. */
export function dismissRelink(db: Database, userId: number): void {
	db.prepare("UPDATE admin SET fid_relink_pub = NULL, fid_relink_requested_at = NULL WHERE id = ?").run(userId);
}

/** Applies the waiting request: the account moves to the requested key. Throws if there is none. */
export function approveRelink(db: Database, userId: number): RelinkResult {
	const row = db.prepare("SELECT username, fid_relink_pub FROM admin WHERE id = ?").get(userId) as
		| { username: string; fid_relink_pub: string | null }
		| undefined;
	if (!row) throw new Error("User not found.");
	if (!row.fid_relink_pub) throw new Error("There is no relink request for this account.");
	const result = relinkFid(db, row.username, row.fid_relink_pub);
	dismissRelink(db, userId);
	return result;
}
