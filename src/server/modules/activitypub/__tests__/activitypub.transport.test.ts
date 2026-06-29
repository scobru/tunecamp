import { describe, expect, test, jest, beforeEach, beforeAll } from '@jest/globals';
import crypto from 'crypto';

// Setup Mocks
jest.unstable_mockModule('../../../common/network.js', () => ({
    drainResponse: jest.fn(),
    fetchSafe: jest.fn(),
}));

describe('ActivityPubTransport', () => {
    let ActivityPubTransport: any;
    let mockFederation: any;
    let mockGetSiteKeys: any;
    let mockGetSiteHandle: any;
    let transport: any;
    let networkMock: any;

    beforeEach(async () => {
        jest.clearAllMocks();

        networkMock = await import('../../../common/network.js');
        networkMock.fetchSafe.mockResolvedValue({
            ok: true,
            text: jest.fn().mockResolvedValue('OK')
        });

        const module = await import('../activitypub.transport.js');
        ActivityPubTransport = module.ActivityPubTransport;

        mockFederation = {
            createContext: jest.fn().mockReturnValue({
                sendActivity: jest.fn().mockResolvedValue(undefined)
            })
        };

        mockGetSiteKeys = jest.fn().mockReturnValue({ privateKey: 'test-private-key', publicKey: 'test-public-key' });
        mockGetSiteHandle = jest.fn().mockReturnValue('test-site');

        transport = new ActivityPubTransport(
            mockFederation,
            'https://base.example.com',
            mockGetSiteKeys,
            mockGetSiteHandle
        );

        // Disable console output for cleaner test runs
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    describe('send()', () => {
        test('should use Fedify if activity has toJsonLd method', async () => {
            const actor = { slug: 'test-actor' };
            const activity = { toJsonLd: jest.fn().mockResolvedValue({ type: 'Create' }), type: 'Create' };

            const result = await transport.send(actor, 'https://remote.test/inbox', activity);

            expect(result).toBe(true);
            expect(mockFederation.createContext).toHaveBeenCalled();
            const ctx = mockFederation.createContext.mock.results[0].value;
            expect(ctx.sendActivity).toHaveBeenCalledWith(
                { handle: 'test-actor' },
                { id: new URL('https://remote.test/inbox'), inboxId: new URL('https://remote.test/inbox') },
                activity
            );
        });

        test('should fallback to manualSend if Fedify sendActivity fails', async () => {
            const actor = { slug: 'test-actor' };
            const activity = { toJsonLd: jest.fn().mockResolvedValue({ type: 'Create' }), type: 'Create' };

            mockFederation.createContext.mockReturnValue({
                sendActivity: jest.fn().mockRejectedValue(new Error('Fedify failure'))
            });

            // Need to mock fetchWithSignature to succeed so manualSend returns true
            jest.spyOn(transport, 'fetchWithSignature').mockResolvedValue({ ok: true, text: jest.fn() } as any);

            const result = await transport.send(actor, 'https://remote.test/inbox', activity);

            expect(result).toBe(true);
            expect(transport.fetchWithSignature).toHaveBeenCalled();
        });

        test('should use manualSend directly if activity does not have toJsonLd (not a Fedify Activity)', async () => {
            const actor = { slug: 'test-actor' };
            const activity = { type: 'Note', content: 'hello' }; // Plain JSON-LD object

            jest.spyOn(transport, 'fetchWithSignature').mockResolvedValue({ ok: true, text: jest.fn() } as any);

            const result = await transport.send(actor, 'https://remote.test/inbox', activity);

            expect(result).toBe(true);
            expect(mockFederation.createContext).not.toHaveBeenCalled();
            expect(transport.fetchWithSignature).toHaveBeenCalled();
        });
    });

    describe('manualSend() - via fetchWithSignature', () => {
        test('should construct manual payload correctly, fetch and drain on success', async () => {
            const actor = { slug: 'test-actor' };
            const activity = { type: 'Note' };

            const fetchRes = { ok: true, text: jest.fn() };
            jest.spyOn(transport, 'fetchWithSignature').mockResolvedValue(fetchRes as any);

            const result = await transport.send(actor, 'https://remote.test/inbox', activity);

            expect(result).toBe(true);
            expect(transport.fetchWithSignature).toHaveBeenCalledWith(
                'https://remote.test/inbox',
                'post',
                expect.objectContaining({
                    '@context': 'https://www.w3.org/ns/activitystreams',
                    type: 'Note',
                    id: expect.stringContaining('https://base.example.com/activity/')
                }),
                actor
            );
            expect(networkMock.drainResponse).toHaveBeenCalledWith(fetchRes);
        });

        test('should return false if fetch fails', async () => {
            const actor = { slug: 'test-actor' };
            const activity = { type: 'Note' };

            const fetchRes = { ok: false, status: 500, text: jest.fn().mockResolvedValue('Internal Error') };
            jest.spyOn(transport, 'fetchWithSignature').mockResolvedValue(fetchRes as any);

            const result = await transport.send(actor, 'https://remote.test/inbox', activity);

            expect(result).toBe(false);
            expect(networkMock.drainResponse).not.toHaveBeenCalled();
        });

        test('should return false if fetch throws an exception', async () => {
            const actor = { slug: 'test-actor' };
            const activity = { type: 'Note' };

            jest.spyOn(transport, 'fetchWithSignature').mockRejectedValue(new Error('Network error'));

            const result = await transport.send(actor, 'https://remote.test/inbox', activity);

            expect(result).toBe(false);
        });
    });

    describe('fetchWithSignature()', () => {
        let keyPair: crypto.KeyPairSyncResult<string, string>;

        beforeAll(() => {
            keyPair = crypto.generateKeyPairSync('rsa', {
                modulusLength: 2048,
                publicKeyEncoding: { type: 'spki', format: 'pem' },
                privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
            });
        });

        test('should send signed POST request with digest', async () => {
            const actor = { slug: 'test-actor', private_key: keyPair.privateKey };
            const body = { type: 'Note' };

            await transport.fetchWithSignature('https://remote.test/inbox', 'post', body, actor);

            expect(networkMock.fetchSafe).toHaveBeenCalledWith(
                'https://remote.test/inbox',
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify(body),
                    headers: expect.objectContaining({
                        'Host': 'remote.test',
                        'Date': expect.any(String),
                        'Digest': expect.stringContaining('SHA-256='),
                        'Content-Type': 'application/activity+json',
                        'Signature': expect.stringContaining('signature="')
                    })
                })
            );

            const fetchArgs = networkMock.fetchSafe.mock.calls[0];
            const headers = fetchArgs[1].headers;
            expect(headers.Signature).toContain('keyId="https://base.example.com/users/test-actor#main-key"');
            expect(headers.Signature).toContain('algorithm="rsa-sha256"');
            expect(headers.Signature).toContain('headers="(request-target) host date digest"');
        });

        test('should gracefully handle missing private key or signing error', async () => {
            const actor = { slug: 'no-key-actor', private_key: 'invalid-key-data' };

            await transport.fetchWithSignature('https://remote.test/inbox', 'post', {}, actor);

            expect(networkMock.fetchSafe).toHaveBeenCalled();
            const fetchArgs = networkMock.fetchSafe.mock.calls[0];
            const headers = fetchArgs[1].headers;
            expect(headers.Signature).toBeUndefined();
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Could not sign request'), expect.anything());
        });

        test('should use site keys if actor is missing', async () => {
            mockGetSiteKeys.mockReturnValue({ privateKey: keyPair.privateKey, publicKey: keyPair.publicKey });

            await transport.fetchWithSignature('https://remote.test/inbox', 'get');

            expect(networkMock.fetchSafe).toHaveBeenCalled();
            const fetchArgs = networkMock.fetchSafe.mock.calls[0];
            const headers = fetchArgs[1].headers;
            expect(headers.Signature).toContain('keyId="https://base.example.com/users/test-site#main-key"');
        });

        test('should send signed GET request without digest', async () => {
            const actor = { slug: 'test-actor', private_key: keyPair.privateKey };

            await transport.fetchWithSignature('https://remote.test/user', 'get', null, actor);

            expect(networkMock.fetchSafe).toHaveBeenCalledWith(
                'https://remote.test/user',
                expect.objectContaining({
                    method: 'GET',
                    headers: expect.objectContaining({
                        'Host': 'remote.test',
                        'Date': expect.any(String),
                        'Accept': 'application/activity+json'
                    })
                })
            );

            const fetchArgs = networkMock.fetchSafe.mock.calls[0];
            const headers = fetchArgs[1].headers;
            expect(headers.Digest).toBeUndefined();
            expect(headers.Signature).toContain('headers="(request-target) host date"');
        });
    });
});
