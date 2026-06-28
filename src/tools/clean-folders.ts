#!/usr/bin/env node

/**
 * Tunecamp Folder Cleanup Utility
 * Scans the music directory recursively and purges empty, dead, or invalid folders.
 * Safe to execute: only deletes empty folders or folders matching target names (null, undefined, gdrive:) if empty.
 */

import fs from 'fs-extra';
import path from 'path';
import { loadConfig } from '../server/core/config.js';

// Files that can be ignored when checking if a directory is "empty"
const IGNORED_FILES = new Set(['.ds_store', 'thumbs.db', '.gitkeep', '.jwt-secret']);

async function getDirectoryTree(dirPath: string): Promise<string[]> {
  const subdirs: string[] = [];
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const fullPath = path.join(dirPath, entry.name);
      subdirs.push(fullPath);
      const nested = await getDirectoryTree(fullPath);
      subdirs.push(...nested);
    }
  }

  return subdirs;
}

async function isDirEmptyOrDead(dirPath: string): Promise<boolean> {
  if (!await fs.pathExists(dirPath)) return true;
  
  const entries = await fs.readdir(dirPath);
  // Filter out ignored files
  const validEntries = entries.filter(e => !IGNORED_FILES.has(e.toLowerCase()));
  
  return validEntries.length === 0;
}

async function cleanFolders() {
  try {
    const config = loadConfig();
    const musicDir = path.resolve(config.musicDir);

    if (!await fs.pathExists(musicDir)) {
      console.error(`❌ Error: Music directory does not exist at: ${musicDir}`);
      process.exit(1);
    }

    console.log(`📁 Target music directory: ${musicDir}`);

    // Get all subdirectories
    const allDirs = await getDirectoryTree(musicDir);
    
    // Sort directories by depth (deepest first) so that nested empty directories are cleaned up bottom-up
    const sortedDirs = allDirs.sort((a, b) => b.split(path.sep).length - a.split(path.sep).length);

    let emptyRemoved = 0;
    let nullRemoved = 0;
    let gdriveRemoved = 0;

    for (const dir of sortedDirs) {
      const basename = path.basename(dir);
      const lowerBasename = basename.toLowerCase();
      
      const isDeadName = 
        lowerBasename === 'null' || 
        lowerBasename === 'undefined' || 
        basename.includes(':') || 
        basename.includes('gdrive');

      const isEmpty = await isDirEmptyOrDead(dir);

      if (isEmpty) {
        console.log(`🗑️ Removing empty folder: ${path.relative(musicDir, dir)}`);
        await fs.remove(dir);
        emptyRemoved++;
        if (isDeadName) {
          if (lowerBasename === 'null' || lowerBasename === 'undefined') nullRemoved++;
          else gdriveRemoved++;
        }
      } else if (isDeadName) {
        // If it's a dead name but has files, let's check what's inside
        const files = await fs.readdir(dir);
        const validFiles = files.filter(e => !IGNORED_FILES.has(e.toLowerCase()));
        
        console.warn(`⚠️ Warning: Folder "${path.relative(musicDir, dir)}" contains dead name pattern but is NOT empty. Files inside:`, validFiles);
      }
    }

    console.log(`\n✨ [Cleanup] Summary of accomplishments:`);
    console.log(`   - Total empty folders deleted: ${emptyRemoved}`);
    if (nullRemoved > 0) {
      console.log(`   - "null" or "undefined" folders resolved: ${nullRemoved}`);
    }
    if (gdriveRemoved > 0) {
      console.log(`   - Invalid "gdrive" folders resolved: ${gdriveRemoved}`);
    }
    console.log(`✅ Cleanup operation completed successfully.`);

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  }
}

cleanFolders();
