/**
 * Test double for the `fid` package (github:scobru/fid), wired up in jest.config.js.
 *
 * `fid` is a git dependency whose crypto layer is Zen SEA (secp256k1, via the
 * `@akaoio/zen` git dependency). This stand-in keeps the suite hermetic and installable
 * without those checkouts.
 *
 * Everything that is not SEA is a faithful port of upstream: the passport HMAC, the
 * challenge lifecycle, the replay guard and the SSO token checks behave exactly like the
 * real ones — same argument order, same return shapes, same error strings — because the
 * routes under test branch on them (`validateSsoToken().error` decides 400 vs 401) and
 * the tests assert on them.
 *
 * Only sign/verify are substituted: Node's Ed25519 stands in for secp256k1, keeping SEA's
 * shape — a signature carries the message it was made over, and verification decodes that
 * message and compares it to the expected payload. So a signature made with the wrong key,
 * or over a different payload, still fails, which is what the forgery tests exercise.
 */
import crypto from "node:crypto";
import { Buffer } from "node:buffer";

// ── Types (mirrors fid/src/types.ts) ──────────────────────────────────────────

export interface FidChallenge {
	instanceDomain: string;
	username: string;
	nonce: string;
	timestamp: number;
}

export interface ActiveChallenge {
	username: string;
	nonce: string;
	timestamp: number;
}

export interface FidPassport {
	instanceDomain: string;
	localUsername: string;
	zenPubKey: string;
	issuedAt: number;
	passportSignature: string;
	publicDataEndpoint: string;
}

export interface FidKeyPair {
	pub: string;
	priv: string;
	epub: string;
	epriv: string;
}

export interface FidSignedPayload<T = unknown> {
	payload: T;
	signature: string;
	pubKey: string;
}

export type MasterKeySource = { type: "zen"; privKey: string; pubKey: string };

export type PublicMasterKeySource = { type: "zen"; pubKey: string };

export interface DerivedApIdentity {
	instanceDomain: string;
	username: string;
	actorUri: string;
	webfingerHandle: string;
	masterKeySource: MasterKeySource;
	zenPubKey: string;
	publicKeyPem: string;
	privateKeyPem: string;
}

export interface FidSsoRequest {
	clientId: string;
	redirectUri: string;
	instanceDomain: string;
	nonce: string;
	scope?: string[];
}

export interface FidSsoToken {
	clientId?: string;
	instanceDomain?: string;
	username: string;
	zenPubKey: string;
	actorUri?: string;
	issuedAt: number;
	passport?: FidPassport;
	signature?: string;
	nonce?: string;
	masterKeySource?: PublicMasterKeySource;
}

// ── Crypto: SEA stand-in (mirrors fid/src/crypto/sea.ts) ──────────────────────

/** An Ed25519 pair encoded as base64url DER, standing in for a Zen SEA secp256k1 pair. */
function newEd25519Pair(): { pub: string; priv: string } {
	const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
	return {
		pub: publicKey.export({ type: "spki", format: "der" }).toString("base64url"),
		priv: privateKey
			.export({ type: "pkcs8", format: "der" })
			.toString("base64url"),
	};
}

export function generateNonce(lengthBytes: number = 16): string {
	return crypto.randomBytes(lengthBytes).toString("hex");
}

export async function generateKeyPair(): Promise<FidKeyPair> {
	const identity = newEd25519Pair();
	const ephemeral = newEd25519Pair();
	return {
		pub: identity.pub,
		priv: identity.priv,
		epub: ephemeral.pub,
		epriv: ephemeral.priv,
	};
}

export async function signPayload(
	payload: string,
	priv: string,
): Promise<string> {
	const key = crypto.createPrivateKey({
		key: Buffer.from(priv, "base64url"),
		format: "der",
		type: "pkcs8",
	});
	const signature = crypto.sign(null, Buffer.from(payload, "utf8"), key);
	// SEA signatures carry the message they were made over; zenVerify returns that
	// message rather than a boolean, which is why verifySignature below compares.
	return Buffer.from(
		JSON.stringify({ m: payload, s: signature.toString("base64url") }),
		"utf8",
	).toString("base64url");
}

export async function verifySignature(
	payload: string,
	signature: string,
	pubKey: string,
): Promise<boolean> {
	if (!payload || !signature || !pubKey) {
		return false;
	}
	try {
		const envelope = JSON.parse(
			Buffer.from(signature, "base64url").toString("utf8"),
		) as { m?: string; s?: string };
		if (typeof envelope.m !== "string" || typeof envelope.s !== "string") {
			return false;
		}
		const key = crypto.createPublicKey({
			key: Buffer.from(pubKey, "base64url"),
			format: "der",
			type: "spki",
		});
		const signed = crypto.verify(
			null,
			Buffer.from(envelope.m, "utf8"),
			key,
			Buffer.from(envelope.s, "base64url"),
		);
		return signed && envelope.m === payload;
	} catch {
		return false;
	}
}

// ── Crypto: passport HMAC (mirrors fid/src/crypto/hmac.ts) ────────────────────

export function generatePassportSignature(
	instanceDomain: string,
	username: string,
	zenPubKey: string,
	issuedAt: number,
	secret: string,
): string {
	const payload = `${instanceDomain}:${username}:${zenPubKey}:${issuedAt}`;
	return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function verifyPassportSignature(
	passport: FidPassport,
	secret: string,
): boolean {
	const expectedSignature = generatePassportSignature(
		passport.instanceDomain,
		passport.localUsername,
		passport.zenPubKey,
		passport.issuedAt,
		secret,
	);
	const actual = Buffer.from(passport.passportSignature, "hex");
	const expected = Buffer.from(expectedSignature, "hex");
	if (actual.length !== expected.length) return false;
	return crypto.timingSafeEqual(actual, expected);
}

// ── Crypto: ActivityPub derivation (mirrors fid/src/crypto/derivation.ts) ──────

const ED25519_PKCS8_HEADER = Buffer.from(
	"302e020100300506032b657004220420",
	"hex",
);
const PBKDF2_ITERATIONS = 10000;
const SEED_LENGTH = 32;
const HASH_ALGO = "sha256";

export function deriveApSeed(
	source: MasterKeySource,
	instanceDomain: string,
	username: string,
): Uint8Array {
	const salt = `fid:activitypub:${instanceDomain.toLowerCase()}:${username.toLowerCase()}`;

	if (!source.privKey) {
		throw new Error(
			"Zen source requires a non-empty privKey for seed derivation",
		);
	}

	return crypto.pbkdf2Sync(
		Buffer.from(source.privKey, "utf8"),
		salt,
		PBKDF2_ITERATIONS,
		SEED_LENGTH,
		HASH_ALGO,
	);
}

export function seedToEd25519Pem(seed: Uint8Array): {
	privateKeyPem: string;
	publicKeyPem: string;
} {
	const derPrivateKey = Buffer.concat([
		ED25519_PKCS8_HEADER,
		Buffer.from(seed),
	]);

	const privateKeyObj = crypto.createPrivateKey({
		key: derPrivateKey,
		format: "der",
		type: "pkcs8",
	});
	const publicKeyObj = crypto.createPublicKey(privateKeyObj);

	return {
		privateKeyPem: privateKeyObj
			.export({ type: "pkcs8", format: "pem" })
			.toString(),
		publicKeyPem: publicKeyObj.export({ type: "spki", format: "pem" }).toString(),
	};
}

export function deriveApIdentity(
	source: MasterKeySource,
	instanceDomain: string,
	username: string,
): DerivedApIdentity {
	const seed = deriveApSeed(source, instanceDomain, username);
	const { privateKeyPem, publicKeyPem } = seedToEd25519Pem(seed);

	return {
		instanceDomain: instanceDomain.toLowerCase(),
		username: username.toLowerCase(),
		actorUri: `https://${instanceDomain.toLowerCase()}/users/${username.toLowerCase()}`,
		webfingerHandle: `@${username.toLowerCase()}@${instanceDomain.toLowerCase()}`,
		masterKeySource: source,
		zenPubKey: source.pubKey,
		publicKeyPem,
		privateKeyPem,
	};
}

// ── Crypto: master key helpers (mirrors fid/src/crypto/master-key.ts) ─────────

export function createZenMasterKeySource(
	privKey: string,
	pubKey: string,
): MasterKeySource {
	return { type: "zen", privKey, pubKey };
}

export function isZenSource(
	source: MasterKeySource,
): source is MasterKeySource & { type: "zen" } {
	return source.type === "zen";
}

export function toPublicMasterKeySource(
	source: MasterKeySource,
): PublicMasterKeySource {
	return { type: "zen", pubKey: source.pubKey };
}

// ── Server: challenge manager (mirrors fid/src/server/challenge.ts) ───────────

export class FidChallengeManager {
	private activeChallenges = new Map<string, ActiveChallenge>();
	private ttlMs: number;

	constructor(ttlMinutes: number = 10, cleanupIntervalMinutes: number = 5) {
		this.ttlMs = ttlMinutes * 60 * 1000;

		const cleanupTimer = setInterval(
			() => this.cleanupExpired(),
			cleanupIntervalMinutes * 60 * 1000,
		);
		(cleanupTimer as unknown as { unref?: () => void }).unref?.();
	}

	public createChallenge(
		username: string,
		instanceDomain: string,
	): FidChallenge {
		const nonce = generateNonce(16);
		const timestamp = Date.now();

		this.activeChallenges.set(`${username}:${nonce}`, {
			username,
			nonce,
			timestamp,
		});

		return { instanceDomain, username, nonce, timestamp };
	}

	public async consumeChallenge(
		username: string,
		nonce: string,
		signature: string,
		zenPubKey: string,
	): Promise<boolean> {
		const challengeKey = `${username}:${nonce}`;
		const stored = this.activeChallenges.get(challengeKey);

		if (!stored || stored.username !== username) {
			return false;
		}

		if (Date.now() - stored.timestamp > this.ttlMs) {
			this.activeChallenges.delete(challengeKey);
			return false;
		}

		const verified = await verifySignature(challengeKey, signature, zenPubKey);
		if (!verified) {
			return false;
		}

		this.activeChallenges.delete(challengeKey);
		return true;
	}

	private cleanupExpired(): void {
		const now = Date.now();
		for (const [key, item] of this.activeChallenges.entries()) {
			if (now - item.timestamp > this.ttlMs) {
				this.activeChallenges.delete(key);
			}
		}
	}
}

// ── Server: replay guard (mirrors fid/src/server/replay.ts) ───────────────────

export class FidReplayGuard {
	private seen = new Map<string, number>();
	private retentionMs: number;

	constructor(
		retentionMs: number = 15 * 60 * 1000,
		sweepIntervalMs: number = 5 * 60 * 1000,
	) {
		this.retentionMs = retentionMs;

		const sweepTimer = setInterval(() => this.sweep(), sweepIntervalMs);
		(sweepTimer as unknown as { unref?: () => void }).unref?.();
	}

	public claim(nonce: string, issuedAt: number): boolean {
		if (this.seen.has(nonce)) {
			return false;
		}
		this.seen.set(nonce, issuedAt);
		return true;
	}

	private sweep(): void {
		const cutoff = Date.now() - this.retentionMs;
		for (const [nonce, issuedAt] of this.seen.entries()) {
			if (issuedAt < cutoff) {
				this.seen.delete(nonce);
			}
		}
	}
}

// ── Server: passport issuer (mirrors fid/src/server/passport.ts) ──────────────

export class FidPassportIssuer {
	private secret: string;

	constructor(secret: string) {
		this.secret = secret;
	}

	public issuePassport(
		instanceDomain: string,
		username: string,
		zenPubKey: string,
	): FidPassport {
		const issuedAt = Date.now();
		return {
			instanceDomain,
			localUsername: username,
			zenPubKey,
			issuedAt,
			passportSignature: generatePassportSignature(
				instanceDomain,
				username,
				zenPubKey,
				issuedAt,
				this.secret,
			),
			publicDataEndpoint: `https://${instanceDomain}/api/auth/zen/user/${username}/public`,
		};
	}

	public verifyPassport(passport: FidPassport): boolean {
		return verifyPassportSignature(passport, this.secret);
	}
}

// ── SSO (mirrors fid/src/sso/flow.ts and fid/src/sso/redirect.ts) ─────────────

export function resolveRedirectUri(
	rawRedirectUri: string | null | undefined,
	instanceDomain: string | null | undefined,
): string | null {
	if (!rawRedirectUri || !instanceDomain) return null;

	let url: URL;
	try {
		url = new URL(rawRedirectUri);
	} catch {
		return null;
	}

	const isLoopback =
		url.hostname === "localhost" || url.hostname === "127.0.0.1";
	if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback))
		return null;

	const domain = instanceDomain.toLowerCase();
	if (url.host.toLowerCase() !== domain && url.hostname.toLowerCase() !== domain)
		return null;

	return url.href;
}

export class FidSsoHandler {
	private passportIssuer: FidPassportIssuer;
	private replayStore: FidReplayGuard;

	constructor(
		secret: string,
		replayStore: FidReplayGuard = new FidReplayGuard(),
	) {
		this.passportIssuer = new FidPassportIssuer(secret);
		this.replayStore = replayStore;
	}

	public createSsoRequest(
		clientId: string,
		redirectUri: string,
		instanceDomain: string,
		scope?: string[],
	): FidSsoRequest {
		return {
			clientId,
			redirectUri,
			instanceDomain,
			nonce: generateNonce(16),
			scope,
		};
	}

	public async issueSsoToken(
		ssoReq: FidSsoRequest,
		username: string,
		masterKeySource: MasterKeySource,
	): Promise<FidSsoToken> {
		const issuedAt = Date.now();
		const apIdentity = deriveApIdentity(
			masterKeySource,
			ssoReq.instanceDomain,
			username,
		);

		const passport = this.passportIssuer.issuePassport(
			ssoReq.instanceDomain,
			username,
			masterKeySource.pubKey,
		);

		const tokenPayload = `${ssoReq.clientId}:${ssoReq.instanceDomain}:${username}:${masterKeySource.pubKey}:${issuedAt}:${ssoReq.nonce}`;

		return {
			clientId: ssoReq.clientId,
			instanceDomain: ssoReq.instanceDomain,
			username,
			zenPubKey: masterKeySource.pubKey,
			actorUri: apIdentity.actorUri,
			issuedAt,
			nonce: ssoReq.nonce,
			passport,
			signature: await signPayload(tokenPayload, masterKeySource.privKey),
			masterKeySource: toPublicMasterKeySource(masterKeySource),
		};
	}

	public async validateSsoToken(
		token: Partial<FidSsoToken>,
		maxAgeMs: number = 15 * 60 * 1000,
	): Promise<{ valid: boolean; error?: string }> {
		if (!token) {
			return { valid: false, error: "Missing token payload" };
		}

		const verificationKey =
			token.masterKeySource?.pubKey ?? token.zenPubKey ?? "";
		const sourceId = verificationKey;

		if (
			!token.username ||
			!token.issuedAt ||
			!verificationKey ||
			!token.signature ||
			!token.clientId ||
			!token.instanceDomain ||
			!token.nonce
		) {
			return {
				valid: false,
				error:
					"Missing required ssoToken fields (username, issuedAt, verificationKey, signature, clientId, instanceDomain, nonce)",
			};
		}

		if (Date.now() - token.issuedAt > maxAgeMs) {
			return { valid: false, error: "SSO token expired" };
		}

		const tokenPayload = `${token.clientId}:${token.instanceDomain}:${token.username}:${sourceId}:${token.issuedAt}:${token.nonce}`;

		const signatureValid = await verifySignature(
			tokenPayload,
			token.signature,
			verificationKey,
		);

		if (!signatureValid) {
			return { valid: false, error: "Invalid SSO token signature" };
		}

		if (token.passport) {
			const passportValid = this.passportIssuer.verifyPassport(token.passport);
			if (!passportValid) {
				return { valid: false, error: "Invalid passport signature" };
			}
		}

		// Last check, so a token that fails an earlier one does not burn its nonce.
		if (!this.replayStore.claim(token.nonce, token.issuedAt)) {
			return { valid: false, error: "SSO token already used (replay)" };
		}

		return { valid: true };
	}
}
