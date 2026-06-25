# Turso evaluation (experimental)

This document captures the evaluation of [`tursodatabase/turso`](https://github.com/tursodatabase/turso)
— the Rust rewrite of SQLite — as a potential replacement for `better-sqlite3`
in TuneCamp, plus the groundwork added to make a future swap low-friction.

## TL;DR

Promising, **not production-ready for TuneCamp yet**. The SQL surface TuneCamp
uses is well covered, but:

1. The **published JS driver is async-only**, while TuneCamp's data layer is
   fully synchronous. This is the real blocker today.
2. The Turso **core engine is still beta**, and its headline feature
   (concurrent writes via MVCC) is explicitly marked "not for critical data".

Recommendation: keep `better-sqlite3` in production; revisit when Turso ships a
synchronous binding **and** declares the core stable.

## Compatibility against TuneCamp's actual usage

| Feature | TuneCamp uses it? | Turso status | Impact |
|---|---|---|---|
| Full-text search (FTS5) | **No** — search is `LIKE` + `lower()` indexes | FTS experimental | None — not a dependency |
| Triggers | **Yes** — 2 `AFTER INSERT/UPDATE` triggers on `albums` (`src/server/core/database.ts`) | Ambiguous (COMPAT says supported, manual says no triggers) | **Must validate**; logic is trivially replaceable in app code |
| Views | **Yes** — `v_artists`, `v_albums`, `releases`, `release_tracks`, `v_releases`, `v_tracks` | Supported | OK |
| Recursive CTEs (`WITH RECURSIVE`) | **No** | Not supported | None |
| Generated columns | **No** | Experimental (flag) | None |
| Multi-process DB access | **Yes** — CLI tools (`migrate-*`, `relink-tracks`, `fix-paths`, `scratch_inspect_db.js`) open the DB directly | Mixed SQLite/Turso multi-process unsupported | Low risk (one-off tools, not concurrent with the server) |

## The blocker: sync vs async

TuneCamp's repositories/services use the synchronous `better-sqlite3` API
(`db.prepare(...).get()/.all()/.run()`), called from ~18 sites including
`server.ts` and the test suite.

The currently published driver `@tursodatabase/database` (0.6.x) is **async**:

```js
import { connect } from '@tursodatabase/database';
const db = await connect('my-database.db');
await db.prepare('SELECT 1').all();
```

A real swap therefore needs one of:

- Turso shipping a **synchronous binding** (the project's own manual shows a
  sync example, so this may land), or
- an **async refactor** of the repository layer (invasive; not worth it while
  the engine is beta).

## What was done here

`src/server/core/db-driver.ts` centralizes construction of the raw DB handle
behind `openRawDatabase(dbPath)`, selected by the `TUNECAMP_DB_DRIVER` env var
(`better-sqlite3` by default). `database.ts` now calls it instead of
`new Database()` directly.

This is a no-op for production (default driver unchanged) but isolates the one
place a future engine swap touches. Setting `TUNECAMP_DB_DRIVER=turso` today
throws a clear error explaining the async blocker, rather than failing
obscurely.

## Validation checklist (when Turso is ready)

1. Install `@tursodatabase/database`; confirm a synchronous open API exists.
2. Implement the `turso` branch in `openRawDatabase`.
3. Verify the 2 `albums` triggers fire correctly (visibility → status sync).
4. Verify the 6 views resolve.
5. Run CLI migration tools against a Turso DB (multi-process behaviour).
6. Run the full Jest suite (many tests use `createDatabase(':memory:')`).
