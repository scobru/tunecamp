import { describe, test, expect, afterAll } from '@jest/globals';
import archiver from 'archiver';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { zipHasSymlinks } from '../backup.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-zip-'));
afterAll(() => fs.remove(dir));

async function makeZip(name: string, withLink: boolean): Promise<string> {
    const file = path.join(dir, name);
    const out = fs.createWriteStream(file);
    const archive = archiver('zip');
    const done = new Promise<void>((resolve, reject) => { out.on('close', () => resolve()); archive.on('error', reject); });
    archive.pipe(out);
    archive.append('audio', { name: 'music/a.mp3' });
    if (withLink) archive.symlink('music/escape', '/etc');
    await archive.finalize();
    await done;
    return file;
}

describe('zipHasSymlinks (restore refuses archives that could write outside the extraction dir)', () => {
    test('detects a symbolic link entry', async () => {
        expect(await zipHasSymlinks(await makeZip('evil.zip', true))).toBe(true);
    });

    test('passes an archive of plain files', async () => {
        expect(await zipHasSymlinks(await makeZip('ok.zip', false))).toBe(false);
    });
});
