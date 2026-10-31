import { createHash } from "crypto";

/**
 * tc_ API tokens are stored only as this hash: a copy of the database (a backup,
 * a leaked file) must not hand out working Curator/Admin tokens.
 */
export function hashApiToken(token: string): string {
    return "sha256:" + createHash("sha256").update(token).digest("hex");
}

/** What the token list shows: enough to recognise a token, not to use it. */
export function apiTokenHint(token: string): string {
    return token.length > 10 ? `${token.substring(0, 7)}...${token.substring(token.length - 4)}` : "tc_...";
}
