const fs = require('fs');
const { execSync } = require('child_process');

// Compile it first
execSync('npx tsc', {stdio: 'inherit'});

const dbPath = 'test_dummy.db';
const musicDir = 'dummy_music';

// Clean
fs.rmSync(dbPath, { force: true });
fs.rmSync(musicDir, { recursive: true, force: true });

// Set up
execSync(`sqlite3 ${dbPath} "CREATE TABLE tracks (id INTEGER PRIMARY KEY, title TEXT, file_path TEXT, lossless_path TEXT);"`);

fs.mkdirSync(`${musicDir}/tracks`, { recursive: true });

// Create files and db entries
console.log('Creating dummy files and db entries...');
for (let i = 1; i <= 2000; i++) {
  fs.writeFileSync(`${musicDir}/tracks/track_${i}.mp3`, '');
  execSync(`sqlite3 ${dbPath} "INSERT INTO tracks (title, file_path, lossless_path) VALUES ('Track ${i}', 'tracks/track_${i}.mp3', NULL);"`);
}
for (let i = 2001; i <= 4000; i++) {
  execSync(`sqlite3 ${dbPath} "INSERT INTO tracks (title, file_path, lossless_path) VALUES ('Missing Track ${i}', 'tracks/track_${i}.mp3', NULL);"`);
}

console.log('Running benchmark...');
const start = Date.now();
try {
  execSync(`node dist/tools/fix-paths.js --db ${dbPath}`, { env: { ...process.env, NODE_ENV: 'development', TUNECAMP_MUSIC_DIR: musicDir } });
} catch (e) {
  console.log(e.stdout.toString());
  console.error(e.stderr.toString());
}
const end = Date.now();
console.log(`Execution time: ${end - start} ms`);

// Clean
fs.rmSync(dbPath, { force: true });
fs.rmSync(musicDir, { recursive: true, force: true });
