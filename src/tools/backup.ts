#!/usr/bin/env node

/**
 * Tunecamp Database Backup Utility
 * Usage: node dist/tools/backup.js [target-dir]
 */

import fs from 'fs-extra';
import path from 'path';
import { loadConfig } from '../server/core/config.js';

async function main() {
  const args = process.argv.slice(2);
  const targetDir = args[0] ? path.resolve(args[0]) : path.resolve('./backups');
  
  try {
    const config = await loadConfig();
    const dbPath = path.resolve(config.dbPath);

    if (!await fs.pathExists(dbPath)) {
      console.error(`Error: Database file not found at ${dbPath}`);
      process.exit(1);
    }

    await fs.ensureDir(targetDir);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `tunecamp-${timestamp}.db`;
    const backupPath = path.join(targetDir, backupName);

    await fs.copy(dbPath, backupPath);

    console.log(`✅ Database backed up successfully to:`);
    console.log(backupPath);
  } catch (error) {
    console.error('Error creating backup:', error);
    process.exit(1);
  }
}

main();
