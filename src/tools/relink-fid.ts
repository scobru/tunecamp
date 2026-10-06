#!/usr/bin/env node

/**
 * Tunecamp FID Relink Tool
 *
 * Points an existing account at a new FID identity key.
 *
 * Needed once per account after `fid` 5.0.0, which replaced Zen SEA keys with Ed25519
 * keys: the same alias and passphrase now derive a different key, so an account whose
 * `zen_pub` is the old key can no longer be reached by signing in. FID-only accounts have
 * no password and the server refuses to write one, so the owner cannot fix it from the
 * web UI; the operator, who has the database, can.
 *
 *     npm run fid:relink -- <username> <new-public-key> [--db path/to/db]
 *
 * The new public key is the one shown on the FID profile page after signing in again.
 */

import sqlite3 from "better-sqlite3";
import type { Database } from "better-sqlite3";
import fs from "fs";
import { fileURLToPath } from "url";
import { loadConfig } from "../server/core/config.js";

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

async function main() {
	const args = process.argv.slice(2);
	const dbIdx = args.indexOf("--db");
	const dbArg = dbIdx !== -1 ? args[dbIdx + 1] : null;
	const positional = args.filter((a, i) => a !== "--db" && i !== dbIdx + 1);
	const [username, newPub] = positional;

	if (!username || !newPub) {
		console.error("Usage: npm run fid:relink -- <username> <new-public-key> [--db path/to/db]");
		process.exit(1);
	}

	const config = await loadConfig();
	const dbPath = dbArg || config.dbPath;
	if (!fs.existsSync(dbPath)) {
		console.error(`❌ Database not found at: ${dbPath}`);
		process.exit(1);
	}

	console.log(`\n🔑 Tunecamp FID relink`);
	console.log(`🗄️  Database: ${dbPath}`);
	const db = new sqlite3(dbPath);
	try {
		const result = relinkFid(db, username, newPub);
		console.log(`\n✅ ${result.username} now signs in with ${result.newPub}`);
		console.log(`   (was: ${result.oldPub || "no FID key"})`);
		console.log(`   Existing sessions were signed out. Sign in again through the FID portal.`);
	} catch (err) {
		console.error(`\n❌ ${(err as Error).message}`);
		process.exit(1);
	} finally {
		db.close();
	}
}

// Run only as a script, so the tests can import relinkFid without starting a CLI.
if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
	main().catch((err) => {
		console.error(`\n💥 Fatal error:`, err);
		process.exit(1);
	});
}
