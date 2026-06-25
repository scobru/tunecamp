import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { glob } from 'glob';

/**
 * File utility functions
 */

export async function getFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    stream.on('error', err => reject(err));
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * Generates a "fast" hash based on file size and first/last 1MB of content.
 * Much faster than hashing entire large files for most deduplication needs.
 */
export async function getFastFileHash(filePath: string): Promise<string> {
  const stats = await fs.stat(filePath);
  if (stats.size < 2 * 1024 * 1024) {
    return getFileHash(filePath);
  }

  const fd = await fs.open(filePath, 'r');
  try {
    const head = Buffer.alloc(1024 * 1024);
    const tail = Buffer.alloc(1024 * 1024);

    await fs.read(fd, head, 0, head.length, 0);
    await fs.read(fd, tail, 0, tail.length, stats.size - tail.length);

    const hash = crypto.createHash('md5');
    hash.update(head);
    hash.update(tail);
    hash.update(stats.size.toString());

    return hash.digest('hex');
  } finally {
    await fs.close(fd);
  }
}

export async function findAudioFiles(directory: string): Promise<string[]> {
  const audioExtensions = ['mp3', 'flac', 'ogg', 'wav', 'm4a', 'aac', 'opus'];
  const pattern = `**/*.{${audioExtensions.join(',')}}`;

  const files = await glob(pattern, {
    cwd: directory,
    absolute: false,
    nodir: true,
  });

  return files.sort();
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function createSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function getRelativePath(from: string, to: string): string {
  return path.relative(from, to).replace(/\\/g, '/');
}

/**
 * Robustly resolves a relative path against a root directory, ensuring no traversal.
 * Returns null if the path is invalid, tries to traverse out of root, or contains null bytes.
 */
export function resolveSafePath(rootDir: string, userPath: string): string | null {
  if (userPath.includes('\0')) return null;

  const resolvedRoot = path.resolve(rootDir);
  const relativePath = userPath.replace(/^[/\\]+/, '');
  const absPath = path.resolve(resolvedRoot, relativePath);

  return isSafePath(resolvedRoot, absPath) ? absPath : null;
}

/**
 * Validates whether an absolute path is safely contained within a root directory.
 */
function isSafePath(resolvedRoot: string, absPath: string): boolean {
  const relative = path.relative(resolvedRoot, absPath);

  // Check if it escapes the directory
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return false;
  }

  // Double check the absolute path to be absolutely sure
  if (!absPath.startsWith(resolvedRoot + path.sep) && absPath !== resolvedRoot) {
    return false;
  }
  return true;
}
