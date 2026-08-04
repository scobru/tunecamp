import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import type { Database } from "better-sqlite3";
import crypto from "crypto";
import { UserRole, VisibilityGuardian } from "../../common/visibility.js";

// Polyfill WebCrypto for ZEN.SEA in Node.js ESM
if (typeof global !== "undefined" && !global.crypto) {
	// Fallback to standard Node crypto if available (Node 18+)
	global.crypto = crypto.webcrypto || crypto;
	console.log("🔐 [AUTH] WebCrypto linked to standard Node crypto");
}

const SALT_ROUNDS = 10;
const JWT_EXPIRES_IN = "7d";

export interface TokenPayload {
	isAdmin: boolean;
	username: string;
	artistId: number | null;
	role: UserRole;
	isActive: boolean;
	userId: number;
	tokenVersion: number;
	isRootAdmin?: boolean;
}

export interface AuthService {
	hashPassword(password: string): Promise<string>;
	verifyPassword(password: string, hash: string): Promise<boolean>;
	generateToken(payload: TokenPayload): string;
	verifyToken(token: string): Promise<TokenPayload | null>;
	revokeTokens(userId: number): void;
	// ... rest of methods

	// Multi-user management
	authenticateUser(
		username: string,
		password: string,
	): Promise<
		| {
				success: boolean;
				artistId: number | null;
				isAdmin: boolean;
				id: number;
				role: UserRole;
				isActive: boolean;
				tokenVersion: number;
		  }
		| false
	>;
	verifySubsonicToken(
		username: string,
		token: string,
		salt: string,
	): Promise<boolean>;
	createAdmin(
		username: string,
		password: string,
		artistId?: number | null,
		role?: UserRole,
		zenPubKey?: string,
	): Promise<{ id: number }>;
	createUser(
		username: string,
		password: string,
		artistId: number | null,
		storageQuota?: number,
		pubKey?: string,
		role?: UserRole,
	): Promise<{ id: number }>;
	updateAdmin(
		id: number,
		artistId: number | null,
		role?: UserRole,
		storageQuota?: number,
	): void;
	updateStorageUsed(userId: number, bytesUsed: number): void;
	getStorageInfo(
		userId: number,
	): { storage_quota: number; storage_used: number } | null;
	getTrackQuotaInfo(
		userId: number,
	): { track_quota: number | null; track_quota_floor: number } | null;
	/** Sets the per-user track quota override. Clamped up to track_quota_floor unless trackQuota is 0 (unlimited). */
	updateTrackQuota(id: number, trackQuota: number | null): void;
	/** Grants purchased track slots: raises both track_quota and track_quota_floor to currentEffectiveQuota + count. */
	addPurchasedTracks(
		userId: number,
		count: number,
		currentEffectiveQuota: number,
	): void;
	getAdminById(id: number):
		| {
				id: number;
				username: string;
				artist_id: number | null;
				artist_name: string | null;
				role: UserRole;
				storage_quota: number;
				is_active: number;
				created_at: string;
				is_root: boolean;
				can_peer: number;
		  }
		| undefined;
	getUserByUsername(username: string):
		| {
				id: number;
				username: string;
				artist_id: number | null;
				artist_name: string | null;
				role: UserRole;
				storage_quota: number;
				is_active: number;
				created_at: string;
				is_root: boolean;
				can_peer: number;
				zen_auth_mode: string;
		  }
		| undefined;
	getUserByZenPubKey(zenPubKey: string):
		| {
				id: number;
				username: string;
				artist_id: number | null;
				artist_name: string | null;
				role: UserRole;
				storage_quota: number;
				is_active: number;
				created_at: string;
				is_root: boolean;
				can_peer: number;
		  }
		| undefined;
	authenticateByFid(zenPubKey: string): Promise<
		| {
				success: boolean;
				artistId: number | null;
				isAdmin: boolean;
				id: number;
				role: UserRole;
				isActive: boolean;
				tokenVersion: number;
		  }
		| false
	>;
	listAdmins(): {
		id: number;
		username: string;
		artist_id: number | null;
		artist_name: string | null;
		role: UserRole;
		storage_quota: number;
		is_active: number;
		created_at: string;
		is_root: boolean;
		can_peer: number;
		zen_auth_mode: string;
	}[];
	deleteAdmin(id: number): void;
	deleteUsersBatch(ids: number[]): void;
	toggleUserStatus(id: number, active: boolean): void;
	/** Marks (or clears) a listener's pending request for an artist profile. */
	setArtistRequest(userId: number, requested: boolean): void;
	/** Returns the timestamp of the user's pending artist request, or null. */
	getArtistRequest(userId: number): string | null;
	changePassword(username: string, newPassword: string): Promise<void>;
	/** Sets (or clears, with null) the account's email used for password-reset delivery. */
	setEmail(username: string, email: string | null): void;
	setSecurityQuestions(
		userId: number,
		q1: string,
		a1: string,
		q2: string,
		a2: string,
	): Promise<void>;
	getSecurityQuestions(username: string): { q1: string; q2: string } | null;
	resetPasswordWithSecurityQuestions(
		username: string,
		a1: string,
		a2: string,
		newPassword: string,
	): Promise<boolean>;
	/** Generates a password reset token for the account with this email, valid 30 minutes. Returns null if no account has that email. */
	createPasswordResetToken(
		email: string,
	): { token: string; username: string } | null;
	/** Validates a reset token and, if valid and unused, sets the new password. Returns false if the token is invalid/expired/used. */
	resetPasswordWithToken(token: string, newPassword: string): Promise<boolean>;
	isFirstRun(): boolean;
	/** Returns true if the username belongs to the root admin (id=1, first created). */
	isRootAdmin(username: string): boolean;
	/** Returns the Zen pair for a user if they have one. */
	getUserPair(username: string): any | null;
	/** Updates or sets the ZEN pair for a user. */
	updateZenPair(username: string, pair: any): void;

	// ZEN Key Management
	encryptZenPriv(priv: any): string;
	decryptZenPriv(encrypted: string): any;

	/** Derives an Ethereum-compatible private key from a ZEN pair. */
	deriveZenWallet(pair: any, id?: string): Promise<string>;

	// Default password check
	isDefaultPassword(username: string): Promise<boolean>;
	init(): Promise<void>;
	/** Returns the avatar stored in zen_users for this username, or null. */
	getZenAvatar(username: string): string | null;
	/** Returns alias and avatar from the admin table. */
	getUserProfile(username: string): {
		alias: string | null;
		avatar: string | null;
		email: string | null;
	} | null;
	/** Updates alias and/or avatar in the admin table. */
	updateUserProfile(
		username: string,
		data: { alias?: string; avatar?: string },
	): void;
	/** Whether the user opted into sharing their "now listening" presence. */
	getNowPlayingEnabled(userId: number): boolean;
	/** Sets the user's "now listening" opt-in flag. */
	setNowPlayingEnabled(userId: number, enabled: boolean): void;
	/** Whether the user opted into a public listener profile at /u/:username. */
	getPublicProfileEnabled(userId: number): boolean;
	/** Sets the user's public-profile opt-in flag. */
	setPublicProfileEnabled(userId: number, enabled: boolean): void;
}

export function createAuthService(
	db: Database,
	jwtSecret: string,
	adminUser: string = "admin",
	adminPass: string = "admin",
): AuthService {
	// Ensure admin table exists with new schema
	try {
		// Check if table exists
		const tableExists = db
			.prepare(
				"SELECT name FROM sqlite_master WHERE type='table' AND name='admin'",
			)
			.get();

		if (!tableExists) {
			db.exec(`
                CREATE TABLE admin (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    artist_id INTEGER DEFAULT NULL,
                    artist_unlinked INTEGER DEFAULT 0,
                    role TEXT NOT NULL DEFAULT 'admin',
                    storage_quota INTEGER NOT NULL DEFAULT 0,
                    storage_used INTEGER NOT NULL DEFAULT 0,
                    subsonic_token TEXT,
                    subsonic_password TEXT,
                    zen_pub TEXT,
                    zen_priv TEXT,
                    zen_auth_mode TEXT NOT NULL DEFAULT 'local',
                    is_active INTEGER DEFAULT 1,
                    token_version INTEGER DEFAULT 0,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `);
		} else {
			// Legacy ZEN naming: rename in place so existing FID identity links survive.
			const legacyGunColumns: [string, string][] = [
				["gun_pub", "zen_pub"],
				["gun_priv", "zen_priv"],
				["gun_auth_mode", "zen_auth_mode"],
			];
			const preRenameColumns = db
				.prepare("PRAGMA table_info(admin)")
				.all() as any[];
			for (const [oldName, newName] of legacyGunColumns) {
				const hasOld = preRenameColumns.some((c) => c.name === oldName);
				const hasNew = preRenameColumns.some((c) => c.name === newName);
				if (hasOld && !hasNew) {
					console.log(
						`📦 Migrating admin table: renaming column ${oldName} -> ${newName}...`,
					);
					try {
						// Allowlisted legacy columns only — not user input.
						db.exec(`ALTER TABLE admin RENAME COLUMN ${oldName} TO ${newName}`);
					} catch (e) {
						console.error(
							`Failed to rename column ${oldName} to ${newName}:`,
							e,
						);
					}
				}
			}

			// Check if columns exist (migration)
			const columns = db.prepare("PRAGMA table_info(admin)").all() as any[];
			const hasUsername = columns.some((c) => c.name === "username");
			const hasArtistId = columns.some((c) => c.name === "artist_id");
			const hasRole = columns.some((c) => c.name === "role");
			const hasZenPub = columns.some((c) => c.name === "zen_pub");
			const hasSubsonic = columns.some((c) => c.name === "subsonic_token");
			const hasIsActive = columns.some((c) => c.name === "is_active");
			const hasTokenVersion = columns.some((c) => c.name === "token_version");

			if (!hasTokenVersion) {
				console.log("📦 Migrating admin table: Adding token_version column...");
				try {
					db.exec(
						"ALTER TABLE admin ADD COLUMN token_version INTEGER DEFAULT 0",
					);
				} catch (e) {
					console.error("Failed to add token_version column:", e);
				}
			}

			const hasArtistUnlinked = columns.some(
				(c) => c.name === "artist_unlinked",
			);
			if (!hasArtistUnlinked) {
				console.log(
					"📦 Migrating admin table: Adding artist_unlinked column...",
				);
				try {
					db.exec(
						"ALTER TABLE admin ADD COLUMN artist_unlinked INTEGER DEFAULT 0",
					);
				} catch (e) {
					console.error("Failed to add artist_unlinked column:", e);
				}
			}

			// Self-heal: older buggy migrations could recreate the table without
			// this column, which then breaks every login query that selects it.
			const hasZenAuthMode = columns.some((c) => c.name === "zen_auth_mode");
			if (!hasZenAuthMode) {
				console.log(
					"📦 Migrating admin table: Adding zen_auth_mode column...",
				);
				try {
					db.exec(
						"ALTER TABLE admin ADD COLUMN zen_auth_mode TEXT NOT NULL DEFAULT 'local'",
					);
				} catch (e) {
					console.error("Failed to add zen_auth_mode column:", e);
				}
			}

			if (
				!hasUsername ||
				!hasArtistId ||
				!hasRole ||
				!hasZenPub ||
				!hasSubsonic ||
				!hasIsActive
			) {
				console.log(
					"📦 Migrating admin table to multi-user support (with roles, quotas, keys, and status)...",
				);
				// We need to recreate the table.
				// The rename below makes SQLite rewrite every referencing table's FK
				// (tracks.owner_id, albums.owner_id, ...) to point at admin_old, so the
				// final DROP fails with SQLITE_CONSTRAINT_FOREIGNKEY once those tables
				// hold rows. Foreign keys stay off for the whole sequence.
				db.pragma("foreign_keys = OFF");
				try {
					// 1. Rename existing table
					db.exec("ALTER TABLE admin RENAME TO admin_old");

					// 2. Create new table with role + storage + gun keys
					db.exec(`
                    CREATE TABLE admin (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        username TEXT NOT NULL UNIQUE,
                        password_hash TEXT NOT NULL,
                        artist_id INTEGER DEFAULT NULL,
                        artist_unlinked INTEGER DEFAULT 0,
                        role TEXT NOT NULL DEFAULT 'admin',
                        storage_quota INTEGER NOT NULL DEFAULT 0,
                        storage_used INTEGER NOT NULL DEFAULT 0,
                        subsonic_token TEXT,
                        subsonic_password TEXT,
                        zen_pub TEXT,
                        zen_priv TEXT,
                        zen_auth_mode TEXT NOT NULL DEFAULT 'local',
                        is_active INTEGER DEFAULT 1,
                        token_version INTEGER DEFAULT 0,
                        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                    )
                `);

					// 3. Migrate data - existing users keep role='admin' and unlimited quota (0)
					const hasCreatedAt = columns.some((c) => c.name === "created_at");
					const hasUpdatedAt = columns.some((c) => c.name === "updated_at");

					const insertQuery = `
                    INSERT INTO admin (
                        id, username, password_hash, created_at, updated_at,
                        artist_id, role, storage_quota, storage_used,
                        zen_pub, zen_priv, zen_auth_mode, subsonic_token, subsonic_password,
                        is_active, token_version
                    )
                    SELECT
                        id,
                        CASE WHEN ${!hasUsername ? "id = 1" : "0"} THEN 'admin' ELSE ${!hasUsername ? "NULL" : "username"} END,
                        password_hash,
                        ${hasCreatedAt ? "created_at" : "CURRENT_TIMESTAMP"},
                        ${hasUpdatedAt ? "updated_at" : "CURRENT_TIMESTAMP"},
                        ${!hasArtistId ? "NULL" : "NULLIF(artist_id, 0)"},
                        'admin',
                        0,
                        0,
                        ${!hasZenPub ? "NULL" : "NULLIF(zen_pub, '')"},
                        ${!hasZenPub ? "NULL" : "NULLIF(zen_priv, '')"},
                        ${!hasZenAuthMode ? "'local'" : "IFNULL(zen_auth_mode, 'local')"},
                        ${!hasSubsonic ? "NULL" : "NULLIF(subsonic_token, '')"},
                        ${!hasSubsonic ? "NULL" : "NULLIF(subsonic_password, '')"},
                        ${!hasIsActive ? "1" : "IFNULL(is_active, 1)"},
                        ${!hasTokenVersion ? "0" : "IFNULL(token_version, 0)"}
                    FROM admin_old
                `;
					db.exec(insertQuery);

					// 4. Drop old table
					db.exec("DROP TABLE admin_old");
				} finally {
					db.pragma("foreign_keys = ON");
				}
			} else {
				// Migration: Existing users with 10MB quota (likely early test users) get upgraded to 1GB
				const TEN_MB = 10 * 1024 * 1024;
				const ONE_GB = 1024 * 1024 * 1024;
				db.prepare(
					"UPDATE admin SET storage_quota = ? WHERE storage_quota = ?",
				).run(ONE_GB, TEN_MB);
			}
		}
	} catch (e) {
		console.error("Database migration error:", e);
	}

	return {
		async init(): Promise<void> {
			const user = db
				.prepare("SELECT id, password_hash, role FROM admin WHERE username = ?")
				.get(adminUser) as
				| { id: number; password_hash: string; role: UserRole }
				| undefined;

			if (!user) {
				console.log(
					`🔐 Admin user '${adminUser}' not found. Creating from configuration...`,
				);
				await this.createAdmin(adminUser, adminPass, null, UserRole.ROOT_ADMIN);
			} else {
				// We no longer overwrite the password from configuration if it exists.
				// This allows users to change their password via the UI without it being reset on restart.
				// Only enforce the role if it's the configured primary admin.
				if (user.role !== "admin" && user.role !== "root_admin") {
					console.log(
						`🔐 Updating role for primary admin '${adminUser}' to 'admin'...`,
					);
					db.prepare("UPDATE admin SET role = 'admin' WHERE id = ?").run(
						user.id,
					);
				}
			}

			const count = (
				db.prepare("SELECT COUNT(*) as count FROM admin").get() as any
			).count;
			if (count === 0) {
				console.log("🆕 First run detected: No users found in database.");
			}
		},

		async isDefaultPassword(username: string): Promise<boolean> {
			const user = db
				.prepare("SELECT password_hash FROM admin WHERE username = ?")
				.get(username) as { password_hash: string } | undefined;
			if (!user) return false;
			// Known weak/built-in defaults that MUST be changed before the instance is exposed:
			// - "tunecamp": sentinel set after an admin resets a user's password
			// - "admin": the built-in initial admin password (TUNECAMP_ADMIN_PASS default)
			// Matching either forces the "change your password" setup wizard on login.
			for (const weak of ["tunecamp", "admin"]) {
				if (await this.verifyPassword(weak, user.password_hash)) return true;
			}
			return false;
		},

		async hashPassword(password: string): Promise<string> {
			return bcrypt.hash(password, SALT_ROUNDS);
		},

		async verifyPassword(password: string, hash: string): Promise<boolean> {
			return bcrypt.compare(password, hash);
		},

		generateToken(payload: TokenPayload): string {
			return jwt.sign(payload, jwtSecret, { expiresIn: JWT_EXPIRES_IN });
		},

		async verifyToken(token: string): Promise<TokenPayload | null> {
			try {
				if (token.startsWith("tc_")) {
					const apiTokenRow = db
						.prepare("SELECT user_id FROM api_tokens WHERE token = ?")
						.get(token) as { user_id: number } | undefined;
					if (!apiTokenRow) {
						return null;
					}
					const user = db
						.prepare("SELECT * FROM admin WHERE id = ?")
						.get(apiTokenRow.user_id) as any;
					if (!user || user.is_active === 0) {
						return null;
					}
					const role = (user.role as UserRole) || UserRole.NORMAL_USER;
					const isRoot = role === UserRole.ROOT_ADMIN || user.id === 1;

					return {
						isAdmin:
							role === UserRole.ADMIN ||
							role === UserRole.SUPER_USER ||
							role === UserRole.ROOT_ADMIN ||
							isRoot,
						username: user.username,
						artistId: user.artist_id ?? null,
						role: role,
						isActive: user.is_active === 1,
						userId: user.id,
						tokenVersion: user.token_version,
						isRootAdmin: isRoot,
					};
				}

				const decoded = jwt.verify(token, jwtSecret) as TokenPayload;
				const role = (decoded.role as UserRole) || UserRole.NORMAL_USER;
				const isRoot =
					decoded.isRootAdmin ??
					(role === UserRole.ROOT_ADMIN || decoded.userId === 1);

				// SECURITY CHECK: Verify token version against database
				const user = db
					.prepare("SELECT token_version, is_active FROM admin WHERE id = ?")
					.get(decoded.userId) as
					| { token_version: number; is_active: number }
					| undefined;

				if (
					!user ||
					user.is_active === 0 ||
					user.token_version !== decoded.tokenVersion
				) {
					console.warn(
						`🚨 [AUTH] Token verification failed: User inactive or token revoked (User: ${decoded.username})`,
					);
					return null;
				}

				return {
					isAdmin:
						decoded.isAdmin ??
						(role === UserRole.ADMIN ||
							role === UserRole.SUPER_USER ||
							role === UserRole.ROOT_ADMIN ||
							isRoot),
					username: decoded.username,
					artistId: decoded.artistId ?? null,
					role: role,
					isActive: user.is_active === 1,
					userId: decoded.userId || 0,
					tokenVersion: user.token_version,
					isRootAdmin: isRoot,
				};
			} catch {
				return null;
			}
		},

		revokeTokens(userId: number): void {
			db.prepare(
				"UPDATE admin SET token_version = token_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
			).run(userId);
			console.log(`🛡️ [AUTH] Revoked all tokens for user ID: ${userId}`);
		},

		async authenticateUser(
			username: string,
			password: string,
		): Promise<
			| {
					success: boolean;
					artistId: number | null;
					isAdmin: boolean;
					id: number;
					role: UserRole;
					isActive: boolean;
					tokenVersion: number;
					zenPub: string | null;
					zenPriv: string | null;
					zenAuthMode: string;
			  }
			| false
		> {
			console.log(`[AUTH] Attempting login for user: '${username}'`);
			let user = db
				.prepare(
					"SELECT id, username, password_hash, artist_id, artist_unlinked, role, is_active, token_version, zen_pub, zen_priv, zen_auth_mode FROM admin WHERE username = ?",
				)
				.get(username) as
				| {
						id: number;
						username: string;
						password_hash: string;
						artist_id: number | null;
						artist_unlinked?: number;
						role: UserRole;
						is_active: number;
						token_version: number;
						zen_pub: string | null;
						zen_priv: string | null;
						zen_auth_mode: string | null;
				  }
				| undefined;

			if (!user) {
				// Try case-insensitive fallback
				user = db
					.prepare(
						"SELECT id, username, password_hash, artist_id, artist_unlinked, role, is_active, token_version, zen_pub, zen_priv, zen_auth_mode FROM admin WHERE username = ? COLLATE NOCASE",
					)
					.get(username) as any;
				if (user)
					console.log(
						`[AUTH] Found user '${user.username}' via case-insensitive lookup for '${username}'`,
					);
			}

			if (!user) {
				console.log(`❌ [AUTH] User not found: '${username}'`);
				return false;
			}

			if (!password) {
				console.log(`❌ [AUTH] No password provided for: ${username}`);
				return false;
			}
			const valid = await this.verifyPassword(password, user.password_hash);
			if (!valid) {
				console.log(`❌ [AUTH] Password mismatch for ${username}`);
				return false;
			}
			console.log(`✅ [AUTH] Password verified for ${username}`);

			// Also store encrypted cleartext password for Subsonic token+salt auth
			const encryptedPass = encryptZenPrivHelper(password, jwtSecret);
			try {
				db.prepare("UPDATE admin SET subsonic_password = ? WHERE id = ?").run(
					encryptedPass,
					user.id,
				);
			} catch (e) {
				// Column might not exist yet
			}

			let userRole: UserRole = user.role
				? (user.role as UserRole)
				: UserRole.ADMIN;
			if (user.id === 1) userRole = UserRole.ROOT_ADMIN;

			let artistId = user.artist_id;

			// Handle Artist Profile (Actor) Management.
			// Reserved to curators and admins: listeners must never be auto-linked
			// to an artist that happens to share their username — they become
			// artists only through the request + approval flow (which promotes them).
			if (
				!artistId &&
				!user?.artist_unlinked &&
				(userRole === UserRole.SUPER_USER ||
					userRole === UserRole.ROOT_ADMIN ||
					userRole === UserRole.ADMIN)
			) {
				console.log(
					`🔍 Checking for existing artist profile for ${userRole} ${username}...`,
				);

				// Check if an artist with the same name exists
				let existingArtist = db
					.prepare("SELECT id FROM artists WHERE name = ? COLLATE NOCASE")
					.get(username) as { id: number } | undefined;

				if (!existingArtist) {
					console.log(
						`🎨 Auto-creating artist profile for ${userRole}: ${username}`,
					);

					const slug =
						username
							.toLowerCase()
							.replace(/[^a-z0-9]+/g, "-")
							.replace(/^-|-$/g, "") || "artist";
					let finalSlug = slug;
					let attempt = 0;

					while (attempt < 100) {
						try {
							const result = db
								.prepare(
									"INSERT INTO artists (name, slug, visibility) VALUES (?, ?, 'public')",
								)
								.run(username, finalSlug);
							existingArtist = { id: Number(result.lastInsertRowid) };
							break;
						} catch (e: any) {
							if (
								e.message &&
								e.message.includes("UNIQUE constraint failed: artists.slug")
							) {
								attempt++;
								finalSlug = `${slug}-${attempt}`;
								continue;
							}
							// If it's another error (like name collision), we let it fail or handle it
							console.error(
								`❌ Failed to auto-create artist profile: ${e.message}`,
							);
							break;
						}
					}
				}

				if (existingArtist) {
					console.log(
						`🔗 Linking artist profile for ${username}, id: ${existingArtist.id}`,
					);
					artistId = existingArtist.id;
					db.prepare("UPDATE admin SET artist_id = ? WHERE id = ?").run(
						artistId,
						user.id,
					);
				}
			}

			return {
				success: true,
				id: user.id,
				isAdmin: VisibilityGuardian.isAdminRole(userRole),
				artistId: artistId,
				role: userRole,
				isActive: user.is_active === 1,
				tokenVersion: user.token_version,
				zenPub: user.zen_pub,
				zenPriv: user.zen_priv,
				zenAuthMode: user.zen_auth_mode || "local",
			};
		},

		async verifySubsonicToken(
			username: string,
			token: string,
			salt: string,
		): Promise<boolean> {
			const user = db
				.prepare("SELECT subsonic_password FROM admin WHERE username = ?")
				.get(username) as { subsonic_password: string } | undefined;
			if (!user || !token) return false;

			// Method 1: Use stored encrypted password (preferred, standard Subsonic auth)
			// Standard: token = md5(password + salt)
			if (user.subsonic_password) {
				try {
					const clearPassword = decryptZenPrivHelper(
						user.subsonic_password,
						jwtSecret,
					);
					// Subsonic API requires MD5 for token auth; not a general-purpose hash.
					const expectedToken = crypto
						.createHash("md5")
						.update(clearPassword + salt)
						.digest("hex");
					if (
						token.length === expectedToken.length &&
						crypto.timingSafeEqual(
							Buffer.from(token),
							Buffer.from(expectedToken),
						)
					)
						return true;
				} catch (e) {
					// Decryption failed or lengths differ
				}
			}

			return false;
		},

		async authenticateByFid(zenPubKey: string): Promise<
			| {
					success: boolean;
					artistId: number | null;
					isAdmin: boolean;
					id: number;
					role: UserRole;
					isActive: boolean;
					tokenVersion: number;
			  }
			| false
		> {
			const user = db
				.prepare(`
                SELECT a.id, a.username, a.artist_id, a.role, a.is_active, a.token_version, a.can_peer, ar.name as artist_name
                FROM admin a
                LEFT JOIN artists ar ON a.artist_id = ar.id
                WHERE a.zen_pub = ?
            `)
				.get(zenPubKey) as any;

			if (!user) {
				return false;
			}

			if (!user.is_active) {
				return false;
			}
			const userRole = user.role || "admin";

			return {
				success: true,
				id: user.id,
				isAdmin: VisibilityGuardian.isAdminRole(userRole),
				artistId: user.artist_id,
				role: userRole,
				isActive: user.is_active === 1,
				tokenVersion: user.token_version,
			};
		},

		async createAdmin(
			username: string,
			password: string | null,
			artistId: number | null = null,
			role: UserRole = UserRole.ADMIN,
			zenPubKey?: string,
		): Promise<{ id: number }> {
			const mode =
				!password && zenPubKey ? "zen" : zenPubKey ? "hybrid" : "local";
			const hash = password ? await this.hashPassword(password) : "";
			const result = db
				.prepare(
					"INSERT INTO admin (username, password_hash, artist_id, role, storage_quota, zen_pub, zen_auth_mode, is_active) VALUES (?, ?, ?, ?, 0, ?, ?, 1)",
				)
				.run(username, hash, artistId, role, zenPubKey || null, mode);
			return { id: Number(result.lastInsertRowid) };
		},

		async createUser(
			username: string,
			password: string | null,
			artistId: number | null,
			storageQuota: number = 1024 * 1024 * 1024,
			pubKey?: string,
			role: UserRole = UserRole.NORMAL_USER,
		): Promise<{ id: number }> {
			const mode = !password && pubKey ? "zen" : pubKey ? "hybrid" : "local";
			const hash = password ? await this.hashPassword(password) : "";
			const result = db
				.prepare(
					"INSERT INTO admin (username, password_hash, artist_id, role, storage_quota, storage_used, zen_pub, zen_auth_mode, is_active) VALUES (?, ?, ?, ?, ?, 0, ?, ?, 1)",
				)
				.run(
					username,
					hash,
					artistId,
					role,
					storageQuota,
					pubKey || null,
					mode,
				);
			return { id: Number(result.lastInsertRowid) };
		},

		updateAdmin(
			id: number,
			artistId: number | null,
			role?: UserRole,
			storageQuota?: number,
		): void {
			const updates: string[] = [
				"artist_id = ?",
				"artist_unlinked = ?",
				"updated_at = CURRENT_TIMESTAMP",
			];
			const params: any[] = [artistId, artistId === null ? 1 : 0];

			if (role) {
				if (id === 1 && role !== "admin" && role !== "root_admin") {
					throw new Error("Cannot demote the primary admin");
				}
				updates.push("role = ?");
				params.push(role);
			}

			if (storageQuota !== undefined) {
				updates.push("storage_quota = ?");
				params.push(storageQuota);
			}

			params.push(id);
			db.prepare(`UPDATE admin SET ${updates.join(", ")} WHERE id = ?`).run(
				...params,
			);
		},

		updateStorageUsed(userId: number, bytesUsed: number): void {
			db.prepare(
				"UPDATE admin SET storage_used = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
			).run(bytesUsed, userId);
		},

		getStorageInfo(
			userId: number,
		): { storage_quota: number; storage_used: number } | null {
			return db
				.prepare("SELECT storage_quota, storage_used FROM admin WHERE id = ?")
				.get(userId) as { storage_quota: number; storage_used: number } | null;
		},

		getTrackQuotaInfo(
			userId: number,
		): { track_quota: number | null; track_quota_floor: number } | null {
			return db
				.prepare(
					"SELECT track_quota, track_quota_floor FROM admin WHERE id = ?",
				)
				.get(userId) as {
				track_quota: number | null;
				track_quota_floor: number;
			} | null;
		},

		updateTrackQuota(id: number, trackQuota: number | null): void {
			const row = db
				.prepare("SELECT track_quota_floor FROM admin WHERE id = ?")
				.get(id) as { track_quota_floor: number } | undefined;
			const floor = row?.track_quota_floor || 0;
			const effective =
				trackQuota !== null && trackQuota !== 0 && floor > 0
					? Math.max(trackQuota, floor)
					: trackQuota;
			db.prepare(
				"UPDATE admin SET track_quota = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
			).run(effective, id);
		},

		addPurchasedTracks(
			userId: number,
			count: number,
			currentEffectiveQuota: number,
		): void {
			const newQuota = currentEffectiveQuota + count;
			db.prepare(
				"UPDATE admin SET track_quota = ?, track_quota_floor = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
			).run(newQuota, newQuota, userId);
		},

		getAdminById(id: number):
			| {
					id: number;
					username: string;
					artist_id: number | null;
					artist_name: string | null;
					role: UserRole;
					storage_quota: number;
					is_active: number;
					created_at: string;
					is_root: boolean;
					can_peer: number;
			  }
			| undefined {
			const row = db
				.prepare(`
                SELECT a.id, a.username, a.artist_id, a.role, a.storage_quota, a.is_active, a.created_at, a.can_peer, ar.name as artist_name
                FROM admin a
                LEFT JOIN artists ar ON a.artist_id = ar.id
                WHERE a.id = ?
            `)
				.get(id) as any;

			if (!row) {
				return undefined;
			}

			return {
				...row,
				role: row.role || "admin",
				is_root: row.id === 1,
			};
		},

		getUserByUsername(username: string):
			| {
					id: number;
					username: string;
					artist_id: number | null;
					artist_name: string | null;
					role: UserRole;
					storage_quota: number;
					is_active: number;
					created_at: string;
					is_root: boolean;
					can_peer: number;
					zen_auth_mode: string;
			  }
			| undefined {
			const row = db
				.prepare(`
                SELECT a.id, a.username, a.artist_id, a.role, a.storage_quota, a.is_active, a.created_at, a.can_peer, ar.name as artist_name, a.zen_auth_mode
                FROM admin a
                LEFT JOIN artists ar ON a.artist_id = ar.id
                WHERE a.username = ? COLLATE NOCASE OR a.alias = ? COLLATE NOCASE
            `)
				.get(username, username) as any;

			if (!row) {
				return undefined;
			}

			return {
				...row,
				role: row.role || "admin",
				is_root: row.id === 1,
				zen_auth_mode: row.zen_auth_mode || "local",
			};
		},

		getUserByZenPubKey(zenPubKey: string):
			| {
					id: number;
					username: string;
					artist_id: number | null;
					artist_name: string | null;
					role: UserRole;
					storage_quota: number;
					is_active: number;
					created_at: string;
					is_root: boolean;
					can_peer: number;
			  }
			| undefined {
			const row = db
				.prepare(`
                SELECT a.id, a.username, a.artist_id, a.role, a.storage_quota, a.is_active, a.created_at, a.can_peer, ar.name as artist_name
                FROM admin a
                LEFT JOIN artists ar ON a.artist_id = ar.id
                WHERE a.zen_pub = ?
            `)
				.get(zenPubKey) as any;

			if (!row) {
				return undefined;
			}

			return {
				...row,
				role: row.role || "admin",
				is_root: row.id === 1,
			};
		},

		getZenAvatar(username: string): string | null {
			const row = db
				.prepare(`
                SELECT gu.avatar FROM admin a
                JOIN zen_users gu ON a.zen_pub = gu.pub
                WHERE a.username = ? COLLATE NOCASE OR a.alias = ? COLLATE NOCASE
            `)
				.get(username, username) as { avatar: string | null } | undefined;
			return row?.avatar ?? null;
		},

		getUserProfile(username: string): {
			alias: string | null;
			avatar: string | null;
			email: string | null;
		} | null {
			const row = db
				.prepare(
					"SELECT alias, avatar, email FROM admin WHERE username = ? COLLATE NOCASE OR alias = ? COLLATE NOCASE",
				)
				.get(username, username) as
				| { alias: string | null; avatar: string | null; email: string | null }
				| undefined;
			return row ?? null;
		},

		updateUserProfile(
			username: string,
			data: { alias?: string; avatar?: string },
		): void {
			const parts: string[] = [];
			const params: any[] = [];
			if (data.alias !== undefined) {
				parts.push("alias = ?");
				params.push(data.alias);
			}
			if (data.avatar !== undefined) {
				parts.push("avatar = ?");
				params.push(data.avatar);
			}
			if (parts.length === 0) return;
			params.push(username);
			db.prepare(
				`UPDATE admin SET ${parts.join(", ")} WHERE username = ? COLLATE NOCASE`,
			).run(...params);
		},

		getNowPlayingEnabled(userId: number): boolean {
			const row = db
				.prepare("SELECT now_playing_enabled FROM admin WHERE id = ?")
				.get(userId) as { now_playing_enabled: number } | undefined;
			return !!row?.now_playing_enabled;
		},

		setNowPlayingEnabled(userId: number, enabled: boolean): void {
			db.prepare("UPDATE admin SET now_playing_enabled = ? WHERE id = ?").run(
				enabled ? 1 : 0,
				userId,
			);
		},

		getPublicProfileEnabled(userId: number): boolean {
			const row = db
				.prepare("SELECT public_profile_enabled FROM admin WHERE id = ?")
				.get(userId) as { public_profile_enabled: number } | undefined;
			return !!row?.public_profile_enabled;
		},

		setPublicProfileEnabled(userId: number, enabled: boolean): void {
			db.prepare(
				"UPDATE admin SET public_profile_enabled = ? WHERE id = ?",
			).run(enabled ? 1 : 0, userId);
		},

		listAdmins(): {
			id: number;
			username: string;
			artist_id: number | null;
			artist_name: string | null;
			role: UserRole;
			storage_quota: number;
			is_active: number;
			created_at: string;
			is_root: boolean;
			can_peer: number;
			zen_auth_mode: string;
		}[] {
			const rows = db
				.prepare(`
                SELECT a.id, a.username, a.artist_id, a.role, a.storage_quota, a.is_active, a.created_at, a.artist_requested_at, a.can_peer, ar.name as artist_name, a.zen_auth_mode
                FROM admin a
                LEFT JOIN artists ar ON a.artist_id = ar.id
                ORDER BY a.username
            `)
				.all() as any[];

			return rows.map((r) => ({
				...r,
				role: r.role || "admin",
				is_root: r.id === 1,
				zen_auth_mode: r.zen_auth_mode || "local",
			}));
		},

		setArtistRequest(userId: number, requested: boolean): void {
			if (requested) {
				db.prepare(
					"UPDATE admin SET artist_requested_at = CURRENT_TIMESTAMP WHERE id = ?",
				).run(userId);
			} else {
				db.prepare(
					"UPDATE admin SET artist_requested_at = NULL WHERE id = ?",
				).run(userId);
			}
		},

		getArtistRequest(userId: number): string | null {
			const row = db
				.prepare("SELECT artist_requested_at FROM admin WHERE id = ?")
				.get(userId) as { artist_requested_at: string | null } | undefined;
			return row?.artist_requested_at ?? null;
		},

		deleteAdmin(id: number): void {
			// Prevent deleting the root admin (id=1)
			if (id === 1) {
				throw new Error("Cannot delete the primary admin");
			}
			// Prevent deleting the last admin
			const adminCount = (
				db
					.prepare("SELECT COUNT(*) as count FROM admin WHERE role = 'admin'")
					.get() as any
			).count;
			const user = db.prepare("SELECT role FROM admin WHERE id = ?").get(id) as
				| { role: string }
				| undefined;
			if (user?.role === "admin" && adminCount <= 1) {
				throw new Error("Cannot delete the last admin user");
			}

			// Perform cleanups in a transaction to satisfy foreign key constraints
			db.transaction(() => {
				// 1. Re-assign tracks owned by this user to primary admin (id = 1)
				db.prepare("UPDATE tracks SET owner_id = 1 WHERE owner_id = ?").run(id);

				// 2. Re-assign albums owned by this user to primary admin (id = 1)
				db.prepare("UPDATE albums SET owner_id = 1 WHERE owner_id = ?").run(id);

				// 3. Clear explicit user ownerships
				db.prepare("DELETE FROM track_ownership WHERE owner_id = ?").run(id);
				db.prepare("DELETE FROM album_ownership WHERE owner_id = ?").run(id);

				// 4. Delete storage accounts (OAuth tokens)
				db.prepare("DELETE FROM storage_accounts WHERE user_id = ?").run(id);

				// 5. Reset torrent ownership
				db.prepare(
					"UPDATE torrents SET owner_id = NULL WHERE owner_id = ?",
				).run(id);

				// 7. Finally, delete the user
				db.prepare("DELETE FROM admin WHERE id = ?").run(id);
			})();
		},
		deleteUsersBatch(ids: number[]): void {
			db.transaction(() => {
				for (const id of ids) {
					try {
						this.deleteAdmin(id);
					} catch (e) {
						console.error(`Failed to delete user ${id}:`, e);
						// Skip if it fails (e.g. root admin or last admin)
					}
				}
			});
		},

		toggleUserStatus(id: number, active: boolean): void {
			// Cannot disable root admin
			if (id === 1 && !active) {
				throw new Error("Cannot disable the primary admin");
			}
			db.prepare(
				"UPDATE admin SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
			).run(active ? 1 : 0, id);
		},

		async changePassword(username: string, newPassword: string): Promise<void> {
			const user = db
				.prepare(
					"SELECT zen_auth_mode FROM admin WHERE username = ? COLLATE NOCASE",
				)
				.get(username) as { zen_auth_mode: string } | undefined;
			if (user?.zen_auth_mode === "zen") {
				throw new Error("Cannot reset password for ZEN-only account");
			}
			const hash = await this.hashPassword(newPassword);
			db.prepare(
				"UPDATE admin SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ? COLLATE NOCASE",
			).run(hash, username);
		},

		setEmail(username: string, email: string | null): void {
			db.prepare(
				"UPDATE admin SET email = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ? COLLATE NOCASE",
			).run(email, username);
		},

		createPasswordResetToken(
			email: string,
		): { token: string; username: string } | null {
			const user = db
				.prepare(
					"SELECT id, username FROM admin WHERE email = ? COLLATE NOCASE AND is_active = 1",
				)
				.get(email) as { id: number; username: string } | undefined;
			if (!user) return null;

			const token = crypto.randomBytes(32).toString("hex");
			const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

			// One live reset token per account — a fresh request invalidates any earlier one.
			db.prepare("DELETE FROM password_reset_tokens WHERE admin_id = ?").run(
				user.id,
			);
			db.prepare(
				"INSERT INTO password_reset_tokens (admin_id, token_hash, expires_at) VALUES (?, ?, datetime('now', '+30 minutes'))",
			).run(user.id, tokenHash);

			return { token, username: user.username };
		},

		async resetPasswordWithToken(
			token: string,
			newPassword: string,
		): Promise<boolean> {
			const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
			const row = db
				.prepare(
					"SELECT id, admin_id FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')",
				)
				.get(tokenHash) as { id: number; admin_id: number } | undefined;
			if (!row) return false;

			const hash = await this.hashPassword(newPassword);
			db.prepare(
				"UPDATE admin SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
			).run(hash, row.admin_id);
			db.prepare(
				"UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?",
			).run(row.id);
			this.revokeTokens(row.admin_id);
			return true;
		},

		async setSecurityQuestions(
			userId: number,
			q1: string,
			encryptedPayload1: string,
			q2: string,
			encryptedPayload2: string,
		): Promise<void> {
			// In ZK mode, the client already encrypts the hint deterministically.
			// We just store the payloads directly in the hash columns.
			// Legacy fallback: if it's plaintext being hashed, we'd hash it.
			// To keep it simple, we assume the caller passes the encrypted hint directly.
			// But for backward compatibility with existing non-ZK clients, if the payload isn't ZK formatted,
			// the auth route should handle hashing. We'll just store what we're given.
			db.prepare(
				"UPDATE admin SET security_q1 = ?, security_a1_hash = ?, security_q2 = ?, security_a2_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
			).run(q1, encryptedPayload1, q2, encryptedPayload2, userId);
		},

		getSecurityQuestions(username: string): {
			q1: string;
			q2: string;
			hintPayload1?: string;
			hintPayload2?: string;
		} | null {
			const row = db
				.prepare(
					"SELECT security_q1, security_q2, security_a1_hash, security_a2_hash FROM admin WHERE username = ? COLLATE NOCASE AND is_active = 1",
				)
				.get(username) as
				| {
						security_q1: string | null;
						security_q2: string | null;
						security_a1_hash: string | null;
						security_a2_hash: string | null;
				  }
				| undefined;
			if (!row || !row.security_q1 || !row.security_q2) return null;
			return {
				q1: row.security_q1,
				q2: row.security_q2,
				hintPayload1: row.security_a1_hash || undefined,
				hintPayload2: row.security_a2_hash || undefined,
			};
		},

		async resetPasswordWithSecurityQuestions(
			username: string,
			a1: string,
			a2: string,
			newPassword: string,
		): Promise<boolean> {
			const user = db
				.prepare(
					"SELECT id, security_a1_hash, security_a2_hash FROM admin WHERE username = ? COLLATE NOCASE AND is_active = 1",
				)
				.get(username) as
				| {
						id: number;
						security_a1_hash: string | null;
						security_a2_hash: string | null;
				  }
				| undefined;
			if (!user || !user.security_a1_hash || !user.security_a2_hash)
				return false;

			const v1 = await this.verifyPassword(
				a1.trim().toLowerCase(),
				user.security_a1_hash,
			);
			const v2 = await this.verifyPassword(
				a2.trim().toLowerCase(),
				user.security_a2_hash,
			);
			if (!v1 || !v2) return false;

			const hash = await this.hashPassword(newPassword);
			db.prepare(
				"UPDATE admin SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
			).run(hash, user.id);
			this.revokeTokens(user.id);
			return true;
		},

		isFirstRun(): boolean {
			const count = (
				db.prepare("SELECT COUNT(*) as count FROM admin").get() as any
			).count;
			return count === 0;
		},

		isRootAdmin(username: string): boolean {
			const row = db
				.prepare("SELECT id FROM admin WHERE username = ? COLLATE NOCASE")
				.get(username) as { id: number } | undefined;
			return row?.id === 1;
		},

		getUserPair(username: string): any | null {
			const user = db
				.prepare("SELECT zen_priv FROM admin WHERE username = ? COLLATE NOCASE")
				.get(username) as { zen_priv: string | null } | undefined;
			if (!user || !user.zen_priv) return null;
			try {
				return this.decryptZenPriv(user.zen_priv);
			} catch (e) {
				console.error(
					`⚠️ Failed to decrypt ZEN keys for ${username}. (Secret mismatch?)`,
				);
				return null;
			}
		},

		updateZenPair(username: string, pair: any): void {
			const encryptedPriv = this.encryptZenPriv(pair);
			db.prepare(
				"UPDATE admin SET zen_pub = ?, zen_priv = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ? COLLATE NOCASE",
			).run(pair.pub, encryptedPriv, username);

			// Also ensure it's in zen_users for profile lookups
			db.prepare(
				`INSERT OR IGNORE INTO zen_users (pub, epub, alias) VALUES (?, ?, ?)`,
			).run(pair.pub, pair.epub, username);
		},

		// Encryption helpers
		encryptZenPriv(priv: any): string {
			return encryptZenPrivHelper(priv, jwtSecret);
		},

		decryptZenPriv(encrypted: string): any {
			return decryptZenPrivHelper(encrypted, jwtSecret);
		},

		async deriveZenWallet(pair: any, id?: string): Promise<string> {
			if (!pair || !pair.priv) {
				throw new Error("Valid ZEN pair with 'priv' key is required.");
			}
			// Logic ported from gun/lib/wallet.js but adapted for ZEN
			const text = String(pair.priv) + (id || "");
			const hashHex = crypto.createHash("sha256").update(text).digest("hex");
			return "0x" + hashHex;
		},
	};
}

/**
 * Encrypts a private key using AES-256-GCM (Authenticated Encryption)
 */
export function encryptZenPrivHelper(priv: any, secret: string): string {
	const json = JSON.stringify(priv);
	// GCM standard IV is 12 bytes
	const iv = crypto.randomBytes(12);
	// Derive a 32-byte key from secret
	const key = crypto.createHash("sha256").update(secret).digest();
	const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
	let encrypted = cipher.update(json, "utf8", "hex");
	encrypted += cipher.final("hex");
	const authTag = cipher.getAuthTag();
	// Format: IV:Data:AuthTag
	return `${iv.toString("hex")}:${encrypted}:${authTag.toString("hex")}`;
}

/**
 * Decrypts a private key using AES-256-GCM (or AES-256-CBC for legacy data)
 */
export function decryptZenPrivHelper(encrypted: string, secret: string): any {
	const parts = encrypted.split(":");
	const key = crypto.createHash("sha256").update(secret).digest();

	if (parts.length === 3) {
		// GCM (New Format)
		const [ivHex, dataHex, authTagHex] = parts;
		const iv = Buffer.from(ivHex, "hex");
		const authTag = Buffer.from(authTagHex, "hex");

		// Reject malformed auth tags before passing them to GCM.
		// A shorter tag weakens authentication and can enable forgeries.
		if (authTag.length !== 16) {
			return null;
		}

		const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
		decipher.setAuthTag(authTag);
		let decrypted = decipher.update(dataHex, "hex", "utf8");
		decrypted += decipher.final("utf8");
		try {
			return JSON.parse(decrypted);
		} catch {
			return null;
		}
	} else {
		// CBC (Legacy Format) - no auth tag
		const [ivHex, dataHex] = parts;
		const iv = Buffer.from(ivHex, "hex");
		const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
		let decrypted = decipher.update(dataHex, "hex", "utf8");
		decrypted += decipher.final("utf8");
		try {
			return JSON.parse(decrypted);
		} catch {
			return null;
		}
	}
}
