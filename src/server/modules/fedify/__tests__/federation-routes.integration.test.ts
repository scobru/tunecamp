import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { integrateFederation } from '@fedify/express';
import { createFedify } from '../fedify.js';
import { createDatabase } from '../../../core/database.js';
import { getSiteHandle } from '../../../core/site-actor.js';

// Regression guard for the route-deletion in this branch: ~380 lines of
// hand-rolled actor/inbox/outbox/followers handlers were removed from
// routes/network/activitypub.ts, leaving Fedify as the sole source. These tests
// boot the real Fedify federation over an in-memory DB and confirm the live
// endpoints are still served (and that the inbox still rejects unsigned POSTs).

const AP = 'application/activity+json';
const AP_HEADER = { Accept: AP };

let app: express.Express;
let db: any;
let handle: string;
let logSpy: any, warnSpy: any, errSpy: any;

beforeAll(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    db = createDatabase(':memory:');
    const config = { siteName: 'Test Instance', publicUrl: 'https://site.test' } as any;
    const federation = createFedify(db, config);

    handle = getSiteHandle(db);

    app = express();
    app.use(integrateFederation(federation, () => undefined));
});

afterAll(() => {
    if (db?.db) db.db.close();
    logSpy?.mockRestore();
    warnSpy?.mockRestore();
    errSpy?.mockRestore();
});

describe('Fedify-served federation endpoints (route-deletion regression)', () => {
    test('GET /users/:siteHandle serves the instance Actor as activity+json', async () => {
        const res = await request(app).get(`/users/${handle}`).set(AP_HEADER);

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/activity\+json|ld\+json/);
        expect(res.body.id).toBe(`https://site.test/users/${handle}`);
        expect(res.body.preferredUsername).toBe(handle);
        expect(res.body.inbox).toBe(`https://site.test/users/${handle}/inbox`);
        // site actor is a Service
        expect(JSON.stringify(res.body.type)).toContain('Service');
    });

    test('GET /users/:siteHandle/followers serves an OrderedCollection', async () => {
        const res = await request(app).get(`/users/${handle}/followers`).set(AP_HEADER);

        expect(res.status).toBe(200);
        expect(JSON.stringify(res.body.type)).toContain('OrderedCollection');
    });

    test('GET /users/:unknown returns 404', async () => {
        const res = await request(app).get('/users/definitely-not-an-actor').set(AP_HEADER);
        expect(res.status).toBe(404);
    });

    test('POST /inbox without a valid HTTP signature is rejected (not 2xx)', async () => {
        const res = await request(app)
            .post('/inbox')
            .set('Content-Type', AP)
            .send({
                '@context': 'https://www.w3.org/ns/activitystreams',
                type: 'Create',
                actor: 'https://m.test/users/bob',
                object: { type: 'Note', id: 'https://m.test/n/1', content: 'hi' },
            });

        // Unsigned activity must never be accepted; Fedify answers 401.
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.status).toBeLessThan(500);
    });
});
