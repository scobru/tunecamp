import { jest } from '@jest/globals';
jest.setTimeout(30000);

import { createDatabase } from '../../../core/database.js';
import { createAuthService } from '../../../modules/auth/auth.service.js';
import { createSubsonicRouter } from '../subsonic.js';
import { Readable } from 'stream';
import request from 'supertest';
import express from 'express';
import fs from 'fs';

// Subsonic used to read the whole private library for any account. A plain
// listener must now see what the web API shows them: released public albums only.
describe('Subsonic visibility', () => {
    const dbPath = './test-subsonic-visibility.db';
    let database: any;
    let auth: any;
    let app: any;
    let privateAlbum: number;
    let privateTrack: number;
    let publicTrack: number;
    const q = (u: string) => `u=${u}&p=password&v=1.16.1&c=test&f=json`;

    beforeAll(async () => {
        database = createDatabase(dbPath);
        auth = createAuthService(database.db, 'test-secret');
        await auth.init();
        const hash = await auth.hashPassword('password');
        const addUser = database.db.prepare("INSERT INTO admin (username, password_hash, role, is_active) VALUES (?, ?, ?, ?)");
        addUser.run('curator', hash, 'admin', 1);
        addUser.run('listener', hash, 'user', 1);
        addUser.run('scanner', hash, 'user', 1);

        const artist = database.library.createArtist('Vis Artist');
        privateAlbum = database.library.createAlbum({ title: 'Secret Draft', slug: 'secret-draft', artist_id: artist, visibility: 'private' } as any);
        const publicAlbum = database.library.createAlbum({ title: 'Out Now', slug: 'out-now', artist_id: artist, visibility: 'public', is_release: true } as any);
        database.db.prepare("UPDATE albums SET status = 'released' WHERE id = ?").run(publicAlbum);
        privateTrack = database.library.createTrack({ title: 'Hidden', album_id: privateAlbum, artist_id: artist, file_path: 'h.mp3' } as any);
        publicTrack = database.library.createTrack({ title: 'Shown', album_id: publicAlbum, artist_id: artist, file_path: 's.mp3' } as any);

        const mediaEngine = {
            getStream: async () => ({ stream: Readable.from([Buffer.from('audio')]), contentType: 'audio/mpeg', statusCode: 200 }),
        };
        app = express();
        app.use('/rest', createSubsonicRouter({ database, authService: auth, musicDir: '.', mediaEngine } as any));
    });

    afterAll(() => {
        database.db.close();
        for (const s of ['', '-shm', '-wal']) fs.rmSync(dbPath + s, { force: true });
    });

    const status = (res: any) => res.body['subsonic-response'].status;

    it('hides a private album and refuses to stream its tracks for a plain user', async () => {
        const album = await request(app).get(`/rest/getAlbum.view?${q('listener')}&id=al_${privateAlbum}`);
        expect(status(album)).toBe('failed');

        const stream = await request(app).get(`/rest/stream.view?${q('listener')}&id=tr_${privateTrack}`);
        expect(stream.headers['content-type']).not.toMatch(/audio/);

        const search = await request(app).get(`/rest/search3.view?${q('listener')}&query=Hidden`);
        expect(search.body['subsonic-response'].searchResult3.song ?? []).toHaveLength(0);
    });

    it('still streams public tracks to a plain user', async () => {
        const res = await request(app).get(`/rest/stream.view?${q('listener')}&id=tr_${publicTrack}`);
        expect(res.headers['content-type']).toMatch(/audio\/mpeg/);
    });

    it('lets an admin reach the private library', async () => {
        const album = await request(app).get(`/rest/getAlbum.view?${q('curator')}&id=al_${privateAlbum}`);
        expect(status(album)).toBe('ok');
        const stream = await request(app).get(`/rest/stream.view?${q('curator')}&id=tr_${privateTrack}`);
        expect(stream.headers['content-type']).toMatch(/audio\/mpeg/);
    });

    it('treats a deactivated account as a guest', async () => {
        database.db.prepare("UPDATE admin SET is_active = 0 WHERE username = 'curator'").run();
        const album = await request(app).get(`/rest/getAlbum.view?${q('curator')}&id=al_${privateAlbum}`);
        expect(status(album)).toBe('failed');
        database.db.prepare("UPDATE admin SET is_active = 1 WHERE username = 'curator'").run();
    });
    it('checks the account password once per few minutes, not on every call', async () => {
        const spy = jest.spyOn(auth, 'authenticateUser');
        await request(app).get(`/rest/getGenres.view?${q('scanner')}`);
        await request(app).get(`/rest/getGenres.view?${q('scanner')}`);
        expect(spy).toHaveBeenCalledTimes(1);

        const wrong = await request(app).get(`/rest/getGenres.view?u=scanner&p=nope&v=1.16.1&c=test&f=json`);
        expect(status(wrong)).toBe('failed');
        spy.mockRestore();
    });
    it('pages album lists in name order', async () => {
        database.library.createAlbum({ title: 'Zeta Draft', slug: 'zeta-draft', visibility: 'private' } as any);
        const page = await request(app).get(`/rest/getAlbumList2.view?${q('curator')}&type=alphabeticalByName&size=1&offset=1`);
        const albums = page.body['subsonic-response'].albumList2.album;
        expect(albums).toHaveLength(1);
        expect(albums[0].title).toBe('Zeta Draft');
    });
});
