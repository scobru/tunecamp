import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import cors from 'cors';
// We just replicate the logic to test it easily.
const strictCors = cors({ origin: false, credentials: true });
const publicCors = cors({ origin: '*', credentials: false });

const publicFederationCors = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    const reqMethod = req.headers['access-control-request-method'];
    const isMutationPreflight = req.method === 'OPTIONS' && reqMethod &&
        typeof reqMethod === 'string' && !['GET', 'HEAD', 'OPTIONS'].includes(reqMethod.toUpperCase());

    const hasCredentials = !!req.headers.cookie || !!req.headers.authorization;
    const isCredentialsPreflight = req.method === 'OPTIONS' &&
        typeof req.headers['access-control-request-headers'] === 'string' &&
        req.headers['access-control-request-headers'].split(',').map(h => h.trim().toLowerCase()).includes('authorization');

    if (isMutation || isMutationPreflight || hasCredentials || isCredentialsPreflight) {
        strictCors(req, res, next);
    } else {
        publicCors(req, res, (err?: any) => {
            if (err) return next(err);
            res.locals.skipStrictCors = true;
            next();
        });
    }
};

describe('CORS Security', () => {
    let app: express.Express;
    beforeEach(() => {
        app = express();
        app.use('/api/community', publicFederationCors);
        app.get('/api/community/data', (req, res) => res.json({ ok: true }));
        app.post('/api/community/mutate', (req, res) => res.json({ ok: true }));
    });

    test('GET on public endpoint returns wildcard origin', async () => {
        const res = await request(app).get('/api/community/data').set('Origin', 'http://evil.com');
        expect(res.headers['access-control-allow-origin']).toBe('*');
        // Check that credentials are NOT allowed for wildcard
        expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    });

    test('POST on public endpoint falls back to strict CORS', async () => {
        const res = await request(app).post('/api/community/mutate').set('Origin', 'http://evil.com');
        // Assuming strictCors has origin: false, it shouldn't allow evil.com
        expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    test('GET on public endpoint with Authorization header falls back to strict CORS', async () => {
        const res = await request(app).get('/api/community/data')
            .set('Origin', 'http://evil.com')
            .set('Authorization', 'Bearer token');
        expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    test('OPTIONS on public endpoint requesting Authorization header falls back to strict CORS', async () => {
        const res = await request(app).options('/api/community/data')
            .set('Origin', 'http://evil.com')
            .set('Access-Control-Request-Method', 'GET')
            .set('Access-Control-Request-Headers', 'x-custom, authorization');
        expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
});
