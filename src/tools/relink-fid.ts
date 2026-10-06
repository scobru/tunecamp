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
import fs from "fs";
import { fileURLToPath } from "url";
import { loadConfig } from "../server/core/config.js";
import { relinkFid } from "../server/modules/auth/fid-relink.js";

export { relinkFid };

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
