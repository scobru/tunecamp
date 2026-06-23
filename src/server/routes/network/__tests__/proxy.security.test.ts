import express from 'express';
import request from 'supertest';
import { describe, it, expect, jest } from '@jest/globals';
import { createProxyRoutes } from '../proxy.js';

// Stub global fetch so the "allowed URL" case never makes a real network call;
// the SSRF guard runs before fetch, so blocked cases never reach this anyway.
(globalThis as any).fetch = jest.fn(async () => ({
    ok: false, status: 502, statusText: 'Bad Gateway', headers: new Map()
}));

// These tests exercise the real isSafeUrl SSRF guard. We use IP *literals* so the
// check is fully deterministic and never performs a DNS lookup: a public IP is
// always allowed, while private/loopback IPs and non-HTTP protocols are blocked.
const app = express();
app.use('/api/proxy', createProxyRoutes({} as any));

describe('Proxy Security (SSRF Protection)', () => {
    it('should reject requests without a URL', async () => {
        const res = await request(app).get('/api/proxy/stream');
        expect(res.status).toBe(400);
        expect(res.text).toBe('URL is required');
    });

    it('should allow valid, external HTTP/HTTPS URLs', async () => {
        // 93.184.216.34 is a public IP literal (example.com) — passes the SSRF guard
        // without a DNS lookup. The downstream fetch is not mocked, so any status
        // other than 403 confirms the request was allowed through the guard.
        const res = await request(app).get('/api/proxy/stream?url=https://93.184.216.34/stream');
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
