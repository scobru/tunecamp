#!/usr/bin/env node

/**
 * Tunecamp Unlock Codes Generator
 * CLI tool to generate and manage unlock codes for releases in SQLite
 * 
 * Usage:
 *   npx ts-node src/tools/generate-codes.ts <release-slug> [options]
 * 
 * Examples:
 *   npx ts-node src/tools/generate-codes.ts my-album --count 10
 *   npx ts-node src/tools/generate-codes.ts my-album --count 50
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { StringUtils } from '../utils/stringUtils.js';

function getDatabasePath(): string {
    if (process.env.TUNECAMP_DB_PATH) {
        return process.env.TUNECAMP_DB_PATH;
    }
    // Try to find tunecamp.db in process.cwd() or parent directories
    const pathsToTry = [
        path.join(process.cwd(), 'tunecamp.db'),
        path.join(process.cwd(), '..', 'tunecamp.db'),
        path.join(process.cwd(), 'dist', 'tunecamp.db')
    ];
    for (const p of pathsToTry) {
        if (fs.existsSync(p)) {
            return p;
        }
    }
    return pathsToTry[0];
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help')) {
        console.log(`
Tunecamp Unlock Codes Generator

Usage:
  npx ts-node src/tools/generate-codes.ts <release-slug> [options]

Options:
  --count <n>       Number of codes to generate (default: 10)
  --db <file>       Path to tunecamp.db (optional)
  --output <file>   Save codes to file (optional)
  --help            Show this help

Examples:
  npx ts-node src/tools/generate-codes.ts my-album --count 10
  npx ts-node src/tools/generate-codes.ts my-album --count 50 --output codes.txt
`);
        process.exit(0);
    }

    const releaseSlug = args[0];
    const count = parseInt(args[args.indexOf('--count') + 1] || '10', 10);
    
    const dbPath = args.includes('--db')
        ? args[args.indexOf('--db') + 1]
        : getDatabasePath();

    const outputFile = args.includes('--output')
        ? args[args.indexOf('--output') + 1]
        : null;

    console.log(`\n🔐 Tunecamp Unlock Codes Generator`);
    console.log(`================================`);
    console.log(`Release slug: ${releaseSlug}`);
    console.log(`Count: ${count}`);
    console.log(`Database path: ${dbPath}`);

    if (!fs.existsSync(dbPath)) {
        console.error(`❌ Database file not found at ${dbPath}. Please specify it with --db option.`);
        process.exit(1);
    }

    let db;
    try {
        db = new Database(dbPath);
    } catch (err: any) {
        console.error(`❌ Failed to connect to database: ${err.message}`);
        process.exit(1);
    }

    // Find the album ID based on the slug
    const album: any = db.prepare('SELECT id, title FROM albums WHERE slug = ?').get(releaseSlug);
    if (!album) {
        console.error(`❌ Release with slug "${releaseSlug}" not found in database.`);
        db.close();
        process.exit(1);
    }

    console.log(`Release found: ${album.title} (ID: ${album.id})`);

    const codes: string[] = [];
    
    // Start transaction
    const insertCode = db.prepare('INSERT INTO unlock_codes (code, release_id) VALUES (?, ?)');
    
    const insertMany = db.transaction((generatedCodes: string[], releaseId: number) => {
        for (const code of generatedCodes) {
            insertCode.run(code, releaseId);
        }
    });

    console.log(`\nGenerating and inserting ${count} codes...`);
    for (let i = 0; i < count; i++) {
        codes.push(StringUtils.generateUnlockCode());
    }

    try {
        insertMany(codes, album.id);
        console.log(`✅ Stored ${count} codes in the database successfully.`);
    } catch (err: any) {
        console.error(`❌ Failed to store codes in database: ${err.message}`);
        db.close();
        process.exit(1);
    }

    db.close();

    console.log(`\n✅ Generated codes:\n`);
    console.log(`${'─'.repeat(50)}`);
    codes.forEach((code, i) => {
        console.log(`  ${(i + 1).toString().padStart(3)}. ${code}`);
    });
    console.log(`${'─'.repeat(50)}`);

    // Save to file if requested
    if (outputFile) {
        const content = [
            `# Unlock Codes for: ${album.title} (${releaseSlug})`,
            `# Generated: ${new Date().toISOString()}`,
            '',
            ...codes,
        ].join('\n');

        fs.writeFileSync(outputFile, content);
        console.log(`\n📁 Codes saved to: ${outputFile}`);
    }

    process.exit(0);
}

main().catch(console.error);
