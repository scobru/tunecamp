import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "tunecamp.db");
console.log("Opening database:", dbPath);
const db = new Database(dbPath);

console.log("\n--- ARTISTS ---");
const artists = db.prepare("SELECT id, name, slug FROM artists").all();
console.log(artists);

console.log("\n--- RELEASES ---");
const releases = db.prepare("SELECT id, title, artist_id, slug, visibility FROM releases").all();
for (const r of releases) {
    const tracks = db.prepare("SELECT count(*) as count FROM tracks WHERE album_id = ?").get();
    console.log(`ID: ${r.id} | Title: "${r.title}" | Artist ID: ${r.artist_id} | Slug: ${r.slug} | Visibility: ${r.visibility} | Tracks count: ${tracks.count}`);
}

console.log("\n--- POSTS ---");
const posts = db.prepare("SELECT id, artist_id, visibility, slug FROM posts").all();
console.log(posts);

console.log("\n--- REMOTE ACTORS ---");
const actors = db.prepare("SELECT uri, username, type, name, is_followed FROM remote_actors").all();
console.log(actors);

console.log("\n--- REMOTE CONTENT ---");
const content = db.prepare("SELECT ap_id, actor_uri, type, title, url FROM remote_content").all();
console.log(`Total remote content: ${content.length}`);
for (const c of content) {
    console.log(`AP ID: ${c.ap_id} | Actor: ${c.actor_uri} | Type: ${c.type} | Title: "${c.title}"`);
}

db.close();
console.log("\nDone!");
