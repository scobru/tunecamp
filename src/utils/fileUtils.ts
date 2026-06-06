import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { glob } from 'glob';
import { getStandardCoverFilename } from './audioUtils.js';

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
 * Returns basic file stats (size, mtime) for fast comparison
 */
export async function getFileStats(filePath: string) {
  const stats = await fs.stat(filePath);
  return {
    size: stats.size,
    mtime: stats.mtimeMs
  };
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

export async function findImageFiles(directory: string, name?: string): Promise<string[]> {
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
  const pattern = name
    ? `**/${name}.{${imageExtensions.join(',')}}`
    : `**/*.{${imageExtensions.join(',')}}`;

  const files = await glob(pattern, {
    cwd: directory,
    absolute: false,
    nodir: true,
  });

  return files;
}

export async function findCover(directory: string): Promise<string | undefined> {
  const coverNames = [
    getStandardCoverFilename('jpg').replace('.jpg', ''),
    getStandardCoverFilename('png').replace('.png', ''),
    'cover',
    'artwork',
    'folder',
    'album'
  ];

  // Optimization: Scan directory once for all images instead of multiple globs
  const images = await findImageFiles(directory);

  if (images.length === 0) {
    return undefined;
  }

  for (const name of coverNames) {
    const match = images.find(img => {
      const parsed = path.parse(img);
      return parsed.name.toLowerCase() === name.toLowerCase();
    });

    if (match) {
      return match;
    }
  }

  // Fallback to any image in the directory
  return images[0];
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.ensureDir(dir);
}

export async function copyFile(src: string, dest: string): Promise<void> {
  await fs.ensureDir(path.dirname(dest));
  await fs.copy(src, dest);
}

export async function readFile(filePath: string): Promise<string> {
  return await fs.readFile(filePath, 'utf-8');
}

export async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf-8');
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

/**
 * Executes an array of tasks in parallel with a concurrency limit
 */
export async function parallel<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<any>
): Promise<void> {
  const promises: Promise<any>[] = [];
  const executing = new Set<Promise<any>>();

  for (const item of items) {
    const p = Promise.resolve().then(() => fn(item));
    promises.push(p);
    executing.add(p);

    const clean = () => executing.delete(p);
    p.then(clean).catch(clean);

    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }

  await Promise.all(promises);
}
