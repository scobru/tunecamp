# Domain glossary

Terms this codebase uses with a specific meaning. Kept short on purpose: only
words whose everyday sense would mislead, or that name a seam worth protecting.

## Request identity

Who the caller of an HTTP request is, as every guard reports it: role, active
status, account and artist ids, root-admin status, and the `ViewerContext` the
`VisibilityGuardian` reasons about.

Derived in exactly one place, `src/server/middleware/identity.ts`. It has two
adapters — a verified JWT payload plus the account row it names, and the FID
path, which resolves a `zen_pub` key to an account with no token involved.
Guards decide *who may pass*; they never decide *what an identity is made of*.

The account row wins wherever it disagrees with the token. A token carries the
role it was issued with, and roles change; trusting the token means honouring a
privilege the database has already withdrawn.

Related: `docs/ROLES.md` for what each role may do.
