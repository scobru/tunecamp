# Karma System — Shelved

Evaluated as a per-instance reputation/currency system (event-sourced ledger, earn/spend hooks, admin toggle). **Decision: not pursuing it.** The only real problem it would solve — surfacing that a user is seeding/sharing well on Sidecamp — doesn't need a ledger, a spend economy, and coordinated changes across `tunecamp` + `sidecamp` (+ eventually `tunecamp-sso`/`tunecamp-website` for a cross-instance leaderboard). A simple read-only stat ("shared X GB over Y hours") gets the same value at a fraction of the engineering surface, without the anti-abuse and "pay to boost visibility" concerns a spend economy raises on an artist-first catalog.

No karma code was ever merged (`karma_ledger`, `karmaService`, `/api/karma/*` never existed in `src/` or `webapp/src/`), so there is nothing to revert there.

## SSO cross-instance (was scoped as a karma/leaderboard prerequisite)

The instance-side pieces built for this (`POST /api/oauth/authorize` in `tunecamp`, the `webapp/src/pages/SsoAuthorize.tsx` handoff page, and the `ssoRedirectUris`/`TUNECAMP_SSO_REDIRECT_URIS` config) have been **removed from this repo** along with karma, since their only purpose was to feed a cross-instance leaderboard that isn't happening.

The standalone `tunecamp-sso` service (separate repo) is untouched and still has a working `/auth/start` + `/auth/callback` implementation with real assertion verification — it's just an orphaned counterpart now, since the `tunecamp` side it talked to no longer exists. Its `README.md` still says the instance side isn't built; that's now doubly stale (it was already out of date before this change, since the instance side had briefly existed). No action needed there unless the service itself gets repurposed for something else.
