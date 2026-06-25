import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";

/**
 * Centralizes the construction of the raw database handle so that the engine
 * can be swapped from a single place. Today TuneCamp runs on better-sqlite3
 * (synchronous API). This indirection is the groundwork for evaluating
 * tursodatabase/turso (the Rust SQLite rewrite) — see docs/TURSO.md.
 *
 * IMPORTANT: the data layer (repositories/services) is fully synchronous.
 * The currently published Turso JS driver (@tursodatabase/database) exposes
 * an async-only API, so a real swap is gated on either an upstream sync
 * binding or an async refactor of the repository layer. Until then this
 * factory only ever returns a better-sqlite3 handle; the env flag exists so
 * the experiment can be wired without touching call sites.
 */
export type RawDatabase = DatabaseType;

export type DbDriver = "better-sqlite3" | "turso";

export function getConfiguredDriver(): DbDriver {
    const raw = (process.env.TUNECAMP_DB_DRIVER || "better-sqlite3").toLowerCase();
    if (raw === "turso") return "turso";
    return "better-sqlite3";
}

export function openRawDatabase(dbPath: string): RawDatabase {
    const driver = getConfiguredDriver();

    if (driver === "turso") {
        // The shipping @tursodatabase/database API is async-only and therefore
        // not yet a drop-in for our synchronous data layer. Fail loud rather
        // than silently degrade, so anyone flipping the flag understands the
        // current blocker. See docs/TURSO.md for the migration plan.
        throw new Error(
            "TUNECAMP_DB_DRIVER=turso is not supported yet: the published Turso JS " +
            "driver is async-only while TuneCamp's data layer is synchronous. " +
            "See docs/TURSO.md for the evaluation and what would unblock it."
        );
    }

    return new Database(dbPath);
}
