#!/usr/bin/env node

/**
 * Tunecamp Database Restore Utility
 * Usage: node dist/tools/restore.js <backup-file> [--force]
 */

import fs from 'fs-extra';
import path from 'path';
import { loadConfig } from '../server/core/config.js';

async function main() {
  const args = process.argv.slice(2);
  const isForce = args.includes('--force') || args.includes('-f');
  const backupFile = args.find(a => !a.startsWith('-'));
  
  if (!backupFile) {
    console.error('Usage: node dist/tools/restore.js <backup-file> [--force]');
    process.exit(1);
  }

  try {
    const config = loadConfig();
    const sourcePath = path.resolve(backupFile);
    const dbPath = path.resolve(config.dbPath);

    if (!await fs.pathExists(sourcePath)) {
      console.error(`Error: Backup file not found at ${sourcePath}`);
      process.exit(1);
    }

    if (await fs.pathExists(dbPath) && !isForce) {
      console.warn(`Warning: Database already exists at ${dbPath}`);
      console.warn(`Use --force or -f to overwrite.`);
      process.exit(1);
    }

    if (await fs.pathExists(dbPath)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const safetyPath = `${dbPath}.pre-restore-${timestamp}.bak`;
      await fs.copy(dbPath, safetyPath);
      console.log(`Created safety backup at ${safetyPath}`);
    }

    await fs.copy(sourcePath, dbPath);
    console.log(`✅ Database restored successfully to:`);
    console.log(dbPath);

  } catch (error) {
    console.error('Error restoring backup:', error);
    process.exit(1);
  }
}

main();
