import type { TokenPayload } from "../modules/auth/auth.service.js";
import { VisibilityGuardian, UserRole, ViewerContext } from "../common/visibility.js";
import type { AuthenticatedRequest } from "./auth.js";

/**
 * Who the caller is, as every guard in this codebase reports it.
 *
 * This exists so that "what a request identity is made of" is written once.
 * It used to be inlined in six guards, and the copies had drifted into three
 * different behaviours — some re-read the account row, some trusted the token,
 * and they disagreed about which fields to set at all. Divergence there is an
 * authorization bug that still compiles, so the shape is a type now.
 */
export interface RequestIdentity {
	isAdmin: boolean;
	isSuperUser: boolean;
	isRootAdmin: boolean;
	username: string | undefined;
	role: UserRole;
	isActive: boolean;
	userId: number | undefined;
	artistId: number | null | undefined;
	context: ViewerContext;
	zenPubKey?: string;
}

/**
 * The account row as the derivation needs it. Both `getAdminById` and
 * `getUserByZenPubKey` already return a superset of this, which is the point:
 * the JWT path and the FID path are two adapters onto one identity.
 */
export interface ResolvedAccount {
	id: number;
	username: string;
	role: UserRole;
	artist_id: number | null;
	is_active: number;
}

/** The caller we assume when no credential was presented at all. */
export const GUEST_IDENTITY: RequestIdentity = Object.freeze({
	isAdmin: false,
	isSuperUser: false,
	isRootAdmin: false,
	username: undefined,
	role: UserRole.GUEST,
	isActive: false,
	userId: undefined,
	artistId: undefined,
	context: { role: UserRole.GUEST },
});

function build(fields: {
	userId: number | undefined;
	username: string | undefined;
	role: UserRole;
	artistId: number | null | undefined;
	isActive: boolean;
	isRoot: boolean;
}): RequestIdentity {
	const context = VisibilityGuardian.deriveContext({
		userId: fields.userId,
		username: fields.username,
		role: fields.role,
		artistId: fields.artistId ?? null,
		isActive: fields.isActive,
	} as TokenPayload);

	return {
		isAdmin: VisibilityGuardian.isAdminRole(fields.role),
		isSuperUser: fields.role === UserRole.SUPER_USER,
		isRootAdmin: fields.isRoot,
		username: fields.username,
		role: fields.role,
		isActive: fields.isActive,
		userId: fields.userId,
		artistId: fields.artistId,
		context,
	};
}

/**
 * Derive the caller's identity from a verified token and the account row it
 * points at.
 *
 * The account row wins wherever the two disagree. A token carries a snapshot
 * of the role taken when it was issued, and `updateAdmin` can change a role
 * without invalidating outstanding tokens, so trusting the token means
 * honouring a privilege the database has already withdrawn. Where the row is
 * missing the token's own claims are used, which is reachable only in the
 * narrow window between `verifyToken` reading the row and this reading it
 * again.
 *
 * Pure: the caller performs the lookup. Tests exercise the rule without an
 * Express request or a database.
 */
export function deriveIdentity(
	payload: TokenPayload,
	account: ResolvedAccount | { is_root?: boolean } & ResolvedAccount | undefined,
): RequestIdentity {
	if (!account) {
		return build({
			userId: payload.userId,
			username: payload.username,
			role: (payload.role as UserRole) ?? UserRole.NORMAL_USER,
			artistId: payload.artistId,
			isActive: payload.isActive ?? true,
			isRoot:
				payload.isRootAdmin ??
				(payload.role === UserRole.ROOT_ADMIN || payload.userId === 1),
		});
	}

	return build({
		userId: account.id,
		username: account.username,
		role: account.role,
		artistId: account.artist_id,
		isActive: account.is_active === 1,
		// The primary admin is row 1 by construction; getAdminById reports it
		// directly, so no second lookup by username is needed.
		isRoot: (account as { is_root?: boolean }).is_root ?? account.id === 1,
	});
}

/**
 * Derive an identity straight from an account, for credentials that carry no
 * token — today the FID header, which names a `zen_pub` key instead.
 */
export function deriveIdentityFromAccount(
	account: ResolvedAccount & { is_root?: boolean },
	zenPubKey?: string,
): RequestIdentity {
	const identity = build({
		userId: account.id,
		username: account.username,
		role: account.role,
		artistId: account.artist_id,
		isActive: account.is_active === 1,
		isRoot: account.is_root ?? account.id === 1,
	});
	return zenPubKey ? { ...identity, zenPubKey } : identity;
}

/**
 * Stamp an identity onto the request. The single writer: guards decide who may
 * pass, never what a request identity looks like.
 */
export function applyIdentity(req: AuthenticatedRequest, identity: RequestIdentity): void {
	req.isAdmin = identity.isAdmin;
	req.isSuperUser = identity.isSuperUser;
	req.isRootAdmin = identity.isRootAdmin;
	req.username = identity.username;
	req.role = identity.role;
	req.isActive = identity.isActive;
	req.userId = identity.userId;
	req.artistId = identity.artistId;
	req.context = identity.context;
	if (identity.zenPubKey !== undefined) req.zenPubKey = identity.zenPubKey;
}
