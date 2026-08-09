import Database from "better-sqlite3";

const dbPath = "./tunecamp.db";
const db = new Database(dbPath);

const name = "Iris";
const description = "Air-Gapped Optical File Transfer via Fountain Codes & WASM. Pass data securely through light.";
const src = "https://tunecamp-iris.vercel.app";
const category = "other";
const author = "TuneCamp Labs";
const source_url = "https://github.com/scobru/tunecamp-iris";
const permissions = JSON.stringify(["camera"]);
const sandbox = JSON.stringify(["allow-scripts", "allow-same-origin", "allow-forms", "allow-modals"]);
const allow = JSON.stringify(["camera *"]);

const info = db.prepare(`
    INSERT INTO lab_apps (name, description, src, category, author, source_url, permissions, sandbox, allow, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
`).run(name, description, src, category, author, source_url, permissions, sandbox, allow);

console.log("Successfully inserted TuneCamp Iris as Lab App. ID:", info.lastInsertRowid);
