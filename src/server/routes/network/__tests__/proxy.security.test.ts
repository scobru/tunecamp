import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

// Mock isSafeUrl to avoid real DNS queries which hang the tests
jest.unstable_mockModule('../../../../utils/networkUtils.js', () => ({
    isSafeUrl: jest.fn<any>().mockImplementation(async (urlStr: string) => {
        const url = new URL(urlStr);
        if (['127.0.0.1', 'localhost', '10.0.0.5', '192.168.1.100', '[::1]'].includes(url.hostname)) return false;
        if (!['http:', 'https:'].includes(url.protocol)) return false;
        return true;
    })
}));

// Mock node-fetch so we don't actually hit the network
jest.unstable_mockModule('node-fetch', () => ({
    default: jest.fn<any>().mockResolvedValue({
        ok: true,
        headers: {
            get: jest.fn()
        },
        body: {
            pipe: jest.fn((res: any) => res.end()),
            on: jest.fn()
        }
    })
}));

const { createProxyRoutes } = await import('../proxy.js');

const app = express();
app.use('/api/proxy', createProxyRoutes({} as any));

describe('Proxy Security (SSRF Protection)', () => {
    it('should reject requests without a URL', async () => {
        const res = await request(app).get('/api/proxy/stream');
        expect(res.status).toBe(400);
        expect(res.text).toBe('URL is required');
    });

    it('should allow valid, external HTTP/HTTPS URLs', async () => {
        const res = await request(app).get('/api/proxy/stream?url=https://example.com/stream');
        expect(res.status).not.toBe(403);
    });

    it('should reject local IP addresses (IPv4)', async () => {
        const res = await request(app).get('/api/proxy/stream?url=http://127.0.0.1/admin');
        expect(res.status).toBe(403);
        expect(res.text).toContain('Forbidden');
    });

    it('should reject local IP addresses (IPv6)', async () => {
        const res = await request(app).get('/api/proxy/stream?url=http://[::1]/admin');
        expect(res.status).toBe(403);
        expect(res.text).toContain('Forbidden');
    });

    it('should reject localhost', async () => {
        const res = await request(app).get('/api/proxy/stream?url=http://localhost:8080/secret');
        expect(res.status).toBe(403);
        expect(res.text).toContain('Forbidden');
    });

    it('should reject private IP ranges (10.x.x.x)', async () => {
        const res = await request(app).get('/api/proxy/stream?url=http://10.0.0.5/internal');
        expect(res.status).toBe(403);
        expect(res.text).toContain('Forbidden');
    });

    it('should reject private IP ranges (192.168.x.x)', async () => {
        const res = await request(app).get('/api/proxy/stream?url=http://192.168.1.100/internal');
        expect(res.status).toBe(403);
        expect(res.text).toContain('Forbidden');
    });

    it('should reject non-HTTP protocols', async () => {
        const res = await request(app).get('/api/proxy/stream?url=file:///etc/passwd');
        expect(res.status).toBe(403);
        expect(res.text).toContain('Forbidden');
    });

    it('should reject gopher protocol', async () => {
        const res = await request(app).get('/api/proxy/stream?url=gopher://127.0.0.1:11211/1stats');
        expect(res.status).toBe(403);
        expect(res.text).toContain('Forbidden');
    });
});
