import type { Database as DatabaseType } from "better-sqlite3";

export abstract class BaseRepository {
    constructor(protected db: DatabaseType) {}
}
