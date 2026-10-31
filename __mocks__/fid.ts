/**
 * Test double for the `fid` package (github:scobru/fid), wired up in jest.config.js.
 *
 * Keeps the suite hermetic and installable without fetching the git dependency. It is a
 * faithful port of upstream: Ed25519 sign/verify, the passport HMAC, the challenge lifecycle,
 * the replay guard and the SSO token checks behave exactly like the real ones — same argument
 * order, same return shapes, same error strings — because the routes under test branch on
 * them (`validateSsoToken().error` decides 400 vs 401) and the tests assert on them.
 */
import crypto from "node:crypto";
import { Buffer } from "node:buffer";

/** Mirrors fid's MAX_CLOCK_SKEW_MS. */
const MOCK_MAX_CLOCK_SKEW_MS = 60 * 1000;

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

// ── Crypto: Ed25519 (mirrors fid/src/crypto/sea.ts) ───────────────────────────
// `pub` / `priv` are the base64url JWK `x` / `d` of an Ed25519 key; signatures are detached
// base64url over the UTF-8 payload.

export function generateNonce(lengthBytes: number = 16): string {
	return crypto.randomBytes(lengthBytes).toString("hex");
}

export async function generateKeyPair(): Promise<FidKeyPair> {
	const { x, d } = crypto
		.generateKeyPairSync("ed25519")
		.privateKey.export({ format: "jwk" });
	return { pub: x!, priv: d! };
}

export async function signPayload(
	payload: string,
	priv: string,
): Promise<string> {
	const key = crypto.createPrivateKey({
		key: Buffer.concat([ED25519_PKCS8_HEADER, Buffer.from(priv, "base64url")]),
		format: "der",
		type: "pkcs8",
	});
	return crypto
		.sign(null, Buffer.from(payload, "utf8"), key)
		.toString("base64url");
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
		const key = crypto.createPublicKey({
			key: { kty: "OKP", crv: "Ed25519", x: pubKey },
			format: "jwk",
		});
		return crypto.verify(
			null,
			Buffer.from(payload, "utf8"),
			key,
			Buffer.from(signature, "base64url"),
		);
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

		// Ported from fid 4.0.1: the challenge is spent on failure too, so a wrong
		// signature costs an attempt instead of leaving the challenge attackable
		// for its whole TTL.
		this.activeChallenges.delete(challengeKey);

		return await verifySignature(challengeKey, signature, zenPubKey);
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

		// Ported from fid 4.0.1. A token names the identity key twice and both
		// copies come off the wire; verifying one while the route below resolves
		// the account from the other was an account takeover. issueSsoToken writes
		// the same key into both, so a mismatch is refused rather than resolved.
		if (
			token.masterKeySource?.pubKey &&
			token.zenPubKey &&
			token.masterKeySource.pubKey !== token.zenPubKey
		) {
			return {
				valid: false,
				error: "SSO token identity mismatch (masterKeySource.pubKey != zenPubKey)",
			};
		}

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

		const age = Date.now() - token.issuedAt;
		if (age > maxAgeMs) {
			return { valid: false, error: "SSO token expired" };
		}

		// Also from 4.0.1: the age check was one-sided, so a future-dated token had
		// a negative age and never expired.
		if (age < -MOCK_MAX_CLOCK_SKEW_MS) {
			return { valid: false, error: "SSO token issued in the future" };
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
