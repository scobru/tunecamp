import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync('src/server/repositories/maintenance.repository.ts', 'utf-8');

const search = 'SELECT id, name FROM artists WHERE name IN (${placeholders}) COLLATE NOCASE';
const replace = 'SELECT id, name FROM artists WHERE name COLLATE NOCASE IN (${placeholders})';

content = content.replace(search, replace);
writeFileSync('src/server/repositories/maintenance.repository.ts', content);
