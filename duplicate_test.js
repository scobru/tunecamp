import Database from 'better-sqlite3';
const db = new Database(':memory:');

db.exec(`
  CREATE TABLE test (
    id INTEGER PRIMARY KEY,
    name TEXT
  );
  INSERT INTO test (id, name) VALUES (1, 'original');
`);

const row = db.prepare(`SELECT t.*, 'coalesced' as name FROM test t`).get();
console.log("Result for SELECT t.*, 'coalesced' as name:", row);
