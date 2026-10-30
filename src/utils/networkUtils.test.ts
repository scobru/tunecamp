import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import dns from 'dns';
import * as networkUtils from './networkUtils.js';

// Spy on dns.lookup so the real Node dns module is intercepted at the CJS layer.
// jest.unstable_mockModule doesn't intercept Node built-ins compiled via ts-jest.
const lookupSpy = jest.spyOn(dns, 'lookup') as jest.SpiedFunction<any>;

const setupLookup = () => {
    lookupSpy.mockImplementation((hostname: string, options: any, callback: any) => {
        const cb = typeof callback === 'function' ? callback : options;
        if (hostname === 'public.com') {
            cb(null, [{ address: '8.8.8.8', family: 4 }]);
        } else if (hostname === 'private.com') {
            cb(null, [{ address: '192.168.1.1', family: 4 }]);
        } else if (hostname === 'mixed.com') {
            cb(null, [{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }]);
        } else {
            cb(new Error('Not found'));
        }
    });
};

describe('isSafeUrl', () => {
    beforeEach(() => {
        setupLookup();
    });

    test('allows public domains', async () => {
        expect(await networkUtils.isSafeUrl('http://public.com')).toBe(true);
        expect(await networkUtils.isSafeUrl('https://public.com/foo')).toBe(true);
    });

    test('blocks private domains', async () => {
        expect(await networkUtils.isSafeUrl('http://private.com')).toBe(false);
    });

    test('blocks mixed public/private domains', async () => {
        expect(await networkUtils.isSafeUrl('http://mixed.com')).toBe(false);
    });

    test('blocks localhost', async () => {
        expect(await networkUtils.isSafeUrl('http://localhost')).toBe(false);
        expect(await networkUtils.isSafeUrl('http://localhost:3000')).toBe(false);
    });

    test('blocks private IPs directly', async () => {
        expect(await networkUtils.isSafeUrl('http://127.0.0.1')).toBe(false);
        expect(await networkUtils.isSafeUrl('http://10.0.0.1')).toBe(false);
        expect(await networkUtils.isSafeUrl('http://192.168.1.1')).toBe(false);
        expect(await networkUtils.isSafeUrl('http://172.16.0.1')).toBe(false);
        expect(await networkUtils.isSafeUrl('http://172.31.255.255')).toBe(false);
        expect(await networkUtils.isSafeUrl('http://169.254.1.1')).toBe(false);
        expect(await networkUtils.isSafeUrl('http://0.0.0.0')).toBe(false);
        expect(await networkUtils.isSafeUrl('http://[::1]')).toBe(false);
        expect(await networkUtils.isSafeUrl('http://[fe80::1]')).toBe(false);
        expect(await networkUtils.isSafeUrl('http://[fc00::1]')).toBe(false);
        expect(await networkUtils.isSafeUrl('http://[fd00::1]')).toBe(false);
        expect(await networkUtils.isSafeUrl('http://[::ffff:192.168.1.1]')).toBe(false);
        expect(await networkUtils.isSafeUrl('http://[::ffff:127.0.0.1]')).toBe(false);
    });

    test('allows public IPs directly', async () => {
        expect(await networkUtils.isSafeUrl('http://8.8.8.8')).toBe(true);
        expect(await networkUtils.isSafeUrl('http://1.1.1.1')).toBe(true);
        expect(await networkUtils.isSafeUrl('http://172.15.255.255')).toBe(true);
        expect(await networkUtils.isSafeUrl('http://172.32.0.0')).toBe(true);
    });

    test('blocks non-http schemes', async () => {
        expect(await networkUtils.isSafeUrl('file:///etc/passwd')).toBe(false);
        expect(await networkUtils.isSafeUrl('ftp://public.com')).toBe(false);
        expect(await networkUtils.isSafeUrl('javascript:alert(1)')).toBe(false);
    });

    test('handles invalid URLs', async () => {
        expect(await networkUtils.isSafeUrl('not-a-url')).toBe(false);
    });
});

describe('safeLookup (connect-time check against DNS rebinding)', () => {
    beforeEach(() => setupLookup());

    const lookup = (host: string, opts: any = {}) => new Promise<any>((resolve) =>
        networkUtils.safeLookup(host, opts, (err: any, address: any, family: any) => resolve({ err, address, family })));

    test('refuses a host that resolves to a private address at connect time', async () => {
        const { err } = await lookup('private.com');
        expect(err?.message).toContain('SSRF Blocked');
        expect((await lookup('mixed.com')).err).toBeTruthy();
    });

    test('passes a public address through in the shape the caller asked for', async () => {
        expect(await lookup('public.com')).toMatchObject({ err: null, address: '8.8.8.8', family: 4 });
        const all = await lookup('public.com', { all: true });
        expect(all.address).toEqual([{ address: '8.8.8.8', family: 4 }]);
    });
});

describe('private targets need an explicit opt-in', () => {
    test('an unset NODE_ENV no longer disables the check', async () => {
        const saved = process.env.NODE_ENV;
        delete process.env.NODE_ENV;
        try {
            expect(await networkUtils.isSafeUrl('http://127.0.0.1')).toBe(false);
        } finally {
            process.env.NODE_ENV = saved;
        }
    });
});
