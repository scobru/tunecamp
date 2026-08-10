import { describe, test, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createDatabase } from '../database.js';

/**
 * A legacy migration did `ALTER TABLE admin RENAME TO admin_old`, which makes
 * SQLite rewrite every referencing table's foreign key to point at the new
 * name. The rescue phase dropped the orphan but left those references behind,
 * so with foreign_keys ON a statement against such a table failed at *prepare*
 * time with `no such table: main.admin_old` — reported from the field as a
 * crash loop on peer_sessions, which a boot timer touches.
 */
describe('Database rescue: foreign keys left pointing at a dropped *_old table', () => {
    let logSpy: any;
    let warnSpy: any;
    const created: string[] = [];

    beforeAll(() => {
        logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterAll(() => {
        logSpy.mockRestore();
        warnSpy.mockRestore();
    });

    afterEach(() => {
        for (const file of created.splice(0)) {
            for (const suffix of ['', '-wal', '-shm']) {
                try {
                    fs.unlinkSync(`${file}${suffix}`);
                } catch {
                    /* not every journal file exists */
                }
            }
        }
    });

    /**
     * Builds a database in the exact state the field reported: a real schema,
     * then the legacy rename replayed against it and the orphan dropped.
     */
    function brokenDbPath(): string {
        const file = path.join(
            os.tmpdir(),
            `tunecamp-rescue-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
        );
        created.push(file);

        createDatabase(file).db.close();

        const raw = new Database(file);
        raw.pragma('foreign_keys = OFF');
        raw.exec('ALTER TABLE admin RENAME TO admin_old');
        // The new table the legacy migration created: the original schema
        // under the original name, so `admin(id)` is still a valid key target.
        const original = raw
            .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='admin_old'")
            .get() as { sql: string };
        raw.exec(original.sql.replace('"admin_old"', 'admin'));
        raw.exec('DROP TABLE admin_old');
        raw.close();

        return file;
    }

    function schemaOf(file: string, table: string): string {
        const raw = new Database(file, { readonly: true });
        const row = raw
            .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?")
            .get(table) as { sql: string };
        raw.close();
        return row.sql;
    }

    test('the broken state is reproduced, so the repair is not testing nothing', () => {
        const file = brokenDbPath();
        expect(schemaOf(file, 'peer_sessions')).toContain('admin_old');
    });

    test('re-opening repairs every reference to the dropped table', () => {
        const file = brokenDbPath();

        createDatabase(file).db.close();

        const sql = schemaOf(file, 'peer_sessions');
        expect(sql).not.toContain('admin_old');
        expect(sql).toContain('REFERENCES "admin"');
    });

    test('statements against the repaired table can be prepared and run', () => {
        const file = brokenDbPath();
        const database = createDatabase(file);

        // Preparing is the step that used to throw: SQLite resolves a foreign
        // key target when it compiles the statement, not when it runs it.
        expect(() =>
            database.db.prepare('DELETE FROM peer_sessions WHERE last_seen < ?').run(Date.now()),
        ).not.toThrow();

        database.db.close();
    });

    test('a database that was never broken is left alone', () => {
        const file = path.join(
            os.tmpdir(),
            `tunecamp-rescue-clean-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
        );
        created.push(file);

        createDatabase(file).db.close();
        const before = schemaOf(file, 'peer_sessions');

        createDatabase(file).db.close();

        expect(schemaOf(file, 'peer_sessions')).toBe(before);
    });
});
