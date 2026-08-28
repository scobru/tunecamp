import { jest, describe, test, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import fsExtra from 'fs-extra';
import Stripe, { mockStripeInstance } from 'stripe';
import { ethers, mockProviderInstance, mockInterfaceInstance } from 'ethers';

// Under ts-jest's ESM preset the live binding exported by price.js is read-only,
// so jest.spyOn on the namespace throws. Hold the mock reference directly so
// it survives jest.clearAllMocks() (which only clears calls/results, not the fn itself).
const getEthUsdRateSpy = jest.fn<() => Promise<number>>();
jest.unstable_mockModule('../../../modules/catalog/price.js', () => ({
    getEthUsdRate: getEthUsdRateSpy,
}));

const pathExistsSpy = jest.spyOn(fsExtra, 'pathExists' as any).mockResolvedValue(false as any);
const createReadStreamSpy = jest.spyOn(fsExtra, 'createReadStream' as any);

// Assigned in beforeAll once the mocked modules are dynamically imported.
let createPaymentsRoutes: typeof import('../payments.js')['createPaymentsRoutes'];

describe('Payments Routes', () => {
    let app: express.Express;
    let mockDatabase: any;
    let mockConfig: any;
    let mockStripe: any;
    let mockProvider: any;
    let mockInterface: any;
    let mockAuthService: any;
    let consoleErrorSpy: any;
    let consoleWarnSpy: any;

    beforeAll(async () => {
        ({ createPaymentsRoutes } = await import('../payments.js'));
    });

    beforeEach(() => {
        jest.clearAllMocks();

        // Re-apply default implementations after clearAllMocks
        pathExistsSpy.mockResolvedValue(false as any);
        (Stripe as any).mockImplementation(() => mockStripeInstance);

        mockDatabase = {
            getSetting: jest.fn(),
            getTrack: jest.fn(),
            getAlbum: jest.fn(),
            getAsset: jest.fn(),
            getTrackPriceFromRelease: jest.fn(),
            createUnlockCode: jest.fn(),
            validateUnlockCode: jest.fn(),
            getUnlockCodeByTxHash: jest.fn().mockReturnValue(null),
            updateSubscription: jest.fn(),
            getUserSubscription: jest.fn().mockReturnValue({ status: 'none', expiresAt: null })
        };

        mockConfig = {
            stripeSecretKey: 'sk_test_123',
            stripeWebhookSecret: 'whsec_123',
            stripeOnrampSecretKey: 'sk_onramp_123',
            publicUrl: 'https://site.com',
            port: 3000,
            jwtSecret: 'test-jwt-secret'
        };

        mockAuthService = {
            getTrackQuotaInfo: jest.fn(),
            addPurchasedTracks: jest.fn()
        };

        app = express();
        app.use('/api/payments', createPaymentsRoutes({
            database: mockDatabase,
            identity: mockDatabase,
            library: mockDatabase,
            integration: mockDatabase,
            musicDir: '/tmp/music',
            config: mockConfig,
            authService: mockAuthService
        } as any));

        mockStripe = mockStripeInstance;
        mockProvider = mockProviderInstance;
        mockInterface = mockInterfaceInstance;

        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleErrorSpy?.mockRestore();
        consoleWarnSpy?.mockRestore();
    });

    describe('POST /api/payments/stripe/webhook', () => {
        test('returns 501 if stripe is not configured', async () => {
            mockDatabase.getSetting.mockImplementation(() => null);
            const emptyConfig = { stripeSecretKey: '', stripeWebhookSecret: '' } as any;
            const guestApp = express();
            guestApp.use('/api/payments', createPaymentsRoutes({
                database: mockDatabase,
                identity: mockDatabase,
                library: mockDatabase,
                integration: mockDatabase,
                musicDir: '/tmp/music',
                config: emptyConfig
            } as any));

            const res = await request(guestApp)
                .post('/api/payments/stripe/webhook')
                .send({ id: 'evt_123' });

            expect(res.status).toBe(501);
            expect(res.body.error).toBe('Stripe not configured');
        });

        test('returns 400 if webhook signature verification fails', async () => {
            mockStripe.webhooks.constructEvent.mockImplementation(() => {
                throw new Error('Invalid signature');
            });

            const res = await request(app)
                .post('/api/payments/stripe/webhook')
                .set('stripe-signature', 'bad-sig')
                .send({ id: 'evt_123' });

            expect(res.status).toBe(400);
            expect(res.text).toContain('Webhook Error');
        });

        test('successfully processes checkout.session.completed for a track', async () => {
            const mockEvent = {
                type: 'checkout.session.completed',
                data: {
                    object: {
                        id: 'cs_test_456',
                        metadata: {
                            itemId: '5',
                            type: 'track',
                            albumId: '10'
                        }
                    }
                }
            };
            mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);

            const res = await request(app)
                .post('/api/payments/stripe/webhook')
                .set('stripe-signature', 'valid-sig')
                .send({ id: 'evt_123' });

            expect(res.status).toBe(200);
            expect(res.body.received).toBe(true);
            expect(mockDatabase.createUnlockCode).toHaveBeenCalledWith(
                expect.any(String),
                10,
                5,
                'stripe:cs_test_456',
                undefined,
                undefined
            );
        });
    });

    describe('GET /api/payments/onramp-config', () => {
        test('returns configured onramp providers', async () => {
            const res = await request(app).get('/api/payments/onramp-config');

            expect(res.status).toBe(200);
            expect(res.body.configured).toBe(false);
            expect(res.body.stripeCheckout).toBe(true);
        });
    });

    describe('POST /api/payments/stripe/create-session', () => {
        test('returns 400 if missing fields', async () => {
            const res = await request(app)
                .post('/api/payments/stripe/create-session')
                .send({ itemId: 1 });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('Missing required fields');
        });

        test('returns 404 if track is not found', async () => {
            mockDatabase.getTrack.mockReturnValue(null);

            const res = await request(app)
                .post('/api/payments/stripe/create-session')
                .send({ itemId: 99, type: 'track', successUrl: 'https://site.com/ok', cancelUrl: 'https://site.com/no' });

            expect(res.status).toBe(404);
            expect(res.body.error).toBe('Track 99 not found');
        });

        test('creates session successfully for track', async () => {
            mockDatabase.getTrack.mockReturnValue({
                id: 5,
                title: 'Track Five',
                price: 1.5,
                currency: 'USD'
            });
            mockStripe.checkout.sessions.create.mockResolvedValue({
                id: 'sess_123',
                url: 'https://checkout.stripe.com/sess_123'
            });

            const res = await request(app)
                .post('/api/payments/stripe/create-session')
                .send({ itemId: 5, type: 'track', successUrl: 'https://site.com/ok', cancelUrl: 'https://site.com/no' });

            expect(res.status).toBe(200);
            expect(res.body.id).toBe('sess_123');
            expect(res.body.url).toBe('https://checkout.stripe.com/sess_123');
            // No connected account → charge on the instance's own account (no Connect option)
            const [, opts] = mockStripe.checkout.sessions.create.mock.calls[0];
            expect(opts).toBeUndefined();
        });

        test('routes to artist connected account as a direct charge with the instance fee', async () => {
            mockDatabase.getTrack.mockReturnValue({ id: 5, title: 'Track Five', price: 10, currency: 'USD', artist_id: 7 });
            mockDatabase.getArtistSimple = jest.fn().mockReturnValue({ id: 7, name: 'Artist Seven', stripe_account_id: 'acct_artist7' });
            // 15% instance fee, same setting as on-chain
            mockDatabase.getSetting.mockImplementation((k: string) => (k === 'adminFeePercentage' ? '15' : null));
            mockStripe.accounts.retrieve.mockResolvedValue({ id: 'acct_artist7', country: 'US', charges_enabled: true });
            mockStripe.checkout.sessions.create.mockResolvedValue({ id: 'sess_dc', url: 'https://checkout.stripe.com/sess_dc' });

            const res = await request(app)
                .post('/api/payments/stripe/create-session')
                .send({ itemId: 5, type: 'track', successUrl: 'https://site.com/ok', cancelUrl: 'https://site.com/no' });

            expect(res.status).toBe(200);
            const [params, opts] = mockStripe.checkout.sessions.create.mock.calls[0];
            // Direct charge on the connected account
            expect(opts).toEqual({ stripeAccount: 'acct_artist7' });
            // $10 * 15% = $1.50 = 150 cents application fee
            expect(params.payment_intent_data.application_fee_amount).toBe(150);
        });

        test('skips the application fee for cross-border countries Stripe rejects (e.g. BR)', async () => {
            mockDatabase.getTrack.mockReturnValue({ id: 5, title: 'Track Five', price: 10, currency: 'USD', artist_id: 7 });
            mockDatabase.getArtistSimple = jest.fn().mockReturnValue({ id: 7, name: 'Artist Seven', stripe_account_id: 'acct_br' });
            mockDatabase.getSetting.mockImplementation((k: string) => (k === 'adminFeePercentage' ? '15' : null));
            mockStripe.accounts.retrieve.mockResolvedValue({ id: 'acct_br', country: 'BR', charges_enabled: true });
            mockStripe.checkout.sessions.create.mockResolvedValue({ id: 'sess_br', url: 'https://checkout.stripe.com/sess_br' });

            const res = await request(app)
                .post('/api/payments/stripe/create-session')
                .send({ itemId: 5, type: 'track', successUrl: 'https://site.com/ok', cancelUrl: 'https://site.com/no' });

            expect(res.status).toBe(200);
            const [params, opts] = mockStripe.checkout.sessions.create.mock.calls[0];
            // Still a direct charge, but no application fee (would be rejected cross-border)
            expect(opts).toEqual({ stripeAccount: 'acct_br' });
            expect(params.payment_intent_data).toBeUndefined();
        });

        test('routes an artist-published asset to their connected account', async () => {
            mockDatabase.getAsset.mockReturnValue({ id: 9, title: 'Sticker Pack', price_usdc: 10, currency: 'USD', artist_id: 7 });
            mockDatabase.getArtistSimple = jest.fn().mockReturnValue({ id: 7, name: 'Artist Seven', stripe_account_id: 'acct_artist7' });
            mockDatabase.getSetting.mockImplementation((k: string) => (k === 'adminFeePercentage' ? '15' : null));
            mockStripe.accounts.retrieve.mockResolvedValue({ id: 'acct_artist7', country: 'US', charges_enabled: true });
            mockStripe.checkout.sessions.create.mockResolvedValue({ id: 'sess_asset', url: 'https://checkout.stripe.com/sess_asset' });

            const res = await request(app)
                .post('/api/payments/stripe/create-session')
                .send({ itemId: 9, type: 'asset', successUrl: 'https://site.com/ok', cancelUrl: 'https://site.com/no' });

            expect(res.status).toBe(200);
            const [params, opts] = mockStripe.checkout.sessions.create.mock.calls[0];
            expect(opts).toEqual({ stripeAccount: 'acct_artist7' });
            expect(params.payment_intent_data.application_fee_amount).toBe(150);
        });

        test('keeps an admin-published asset (no artist_id) on the instance account', async () => {
            mockDatabase.getAsset.mockReturnValue({ id: 10, title: 'Label Poster', price_usdc: 10, currency: 'USD', artist_id: null });
            mockStripe.checkout.sessions.create.mockResolvedValue({ id: 'sess_admin_asset', url: 'https://checkout.stripe.com/sess_admin_asset' });

            const res = await request(app)
                .post('/api/payments/stripe/create-session')
                .send({ itemId: 10, type: 'asset', successUrl: 'https://site.com/ok', cancelUrl: 'https://site.com/no' });

            expect(res.status).toBe(200);
            const [, opts] = mockStripe.checkout.sessions.create.mock.calls[0];
            expect(opts).toBeUndefined();
        });
    });

    describe('POST /api/payments/verify', () => {
        test('returns 400 if txHash or trackId is missing', async () => {
            const res = await request(app)
                .post('/api/payments/verify')
                .send({ txHash: '0x123' });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Missing required fields');
        });

        test('detects and rejects replay attacks', async () => {
            mockDatabase.getUnlockCodeByTxHash.mockReturnValue({ code: 'USED' });

            const res = await request(app)
                .post('/api/payments/verify')
                .send({ txHash: '0x123', trackId: '5' });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('already been used');
        });

        test('returns 404 if tx not found on chain', async () => {
            mockProvider.getTransaction.mockResolvedValue(null);
            mockProvider.getTransactionReceipt.mockResolvedValue(null);

            const res = await request(app)
                .post('/api/payments/verify')
                .send({ txHash: '0x123', trackId: '5' });

            expect(res.status).toBe(404);
            expect(res.body.error).toBe('Transaction not found on chain');
        });

        test('verifies direct ETH payment successfully', async () => {
            mockProvider.getTransaction.mockResolvedValue({
                to: '0xArtistWallet',
                from: '0xBuyer',
                value: 1.0
            });
            mockProvider.getTransactionReceipt.mockResolvedValue({
                status: 1
            });
            mockDatabase.getTrack.mockReturnValue({
                id: 5,
                walletAddress: '0xArtistWallet',
                price: 1.0,
                currency: 'ETH'
            });
            (ethers.verifyMessage as jest.Mock).mockReturnValue('0xBuyer');

            const res = await request(app)
                .post('/api/payments/verify')
                .send({ txHash: '0x123', trackId: '5', signature: 'sig' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.method).toBe('DirectETH');
            expect(mockDatabase.createUnlockCode).toHaveBeenCalled();
        });

        test('enforces per-release price override over the track-level price', async () => {
            mockProvider.getTransaction.mockResolvedValue({
                to: '0xArtistWallet',
                from: '0xBuyer',
                value: 1.0 // pays the (lower) track-level price
            });
            mockProvider.getTransactionReceipt.mockResolvedValue({ status: 1 });
            mockDatabase.getTrack.mockReturnValue({
                id: 5,
                album_id: 7,
                walletAddress: '0xArtistWallet',
                price: 1.0,
                currency: 'ETH'
            });
            mockDatabase.getTrackPriceFromRelease.mockReturnValue({
                price: 2.0, price_usdc: 0, currency: 'ETH', title: 'T'
            });
            (ethers.verifyMessage as jest.Mock).mockReturnValue('0xBuyer');

            const res = await request(app)
                .post('/api/payments/verify')
                .send({ txHash: '0x123', trackId: '5', signature: 'sig' });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/Underpayment/);
            expect(mockDatabase.createUnlockCode).not.toHaveBeenCalled();
        });

        test('rejects split payments whose label fee amount is too low', async () => {
            mockDatabase.getSetting.mockImplementation((key: string) => {
                if (key === 'adminFeePercentage') return '15';
                if (key === 'adminTreasuryAddress') return '0xTreasury';
                return null;
            });
            mockProvider.getTransaction.mockImplementation((hash: string) => {
                if (hash === '0xfee') return Promise.resolve({ to: '0xTreasury', value: 0.0001, data: '0x' });
                return Promise.resolve({ to: '0xArtistWallet', from: '0xBuyer', value: 0.85, data: '0x' });
            });
            mockProvider.getTransactionReceipt.mockResolvedValue({ status: 1 });
            mockDatabase.getTrack.mockReturnValue({
                id: 5,
                walletAddress: '0xArtistWallet',
                price: 1.0,
                currency: 'ETH'
            });
            (ethers.verifyMessage as jest.Mock).mockReturnValue('0xBuyer');

            const res = await request(app)
                .post('/api/payments/verify')
                .send({ txHash: '0x123', feeTxHash: '0xfee', trackId: '5', signature: 'sig' });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/Label fee underpayment/);
            expect(mockDatabase.createUnlockCode).not.toHaveBeenCalled();
        });

        test('accepts split payments with a correct label fee and burns the fee tx', async () => {
            mockDatabase.getSetting.mockImplementation((key: string) => {
                if (key === 'adminFeePercentage') return '15';
                if (key === 'adminTreasuryAddress') return '0xTreasury';
                return null;
            });
            mockProvider.getTransaction.mockImplementation((hash: string) => {
                if (hash === '0xfee') return Promise.resolve({ to: '0xTreasury', value: 0.15, data: '0x' });
                return Promise.resolve({ to: '0xArtistWallet', from: '0xBuyer', value: 0.85, data: '0x' });
            });
            mockProvider.getTransactionReceipt.mockResolvedValue({ status: 1 });
            mockDatabase.getTrack.mockReturnValue({
                id: 5,
                walletAddress: '0xArtistWallet',
                price: 1.0,
                currency: 'ETH'
            });
            (ethers.verifyMessage as jest.Mock).mockReturnValue('0xBuyer');

            const res = await request(app)
                .post('/api/payments/verify')
                .send({ txHash: '0x123', feeTxHash: '0xfee', trackId: '5', signature: 'sig' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            // Purchase tx and fee tx are both recorded against replay
            const recordedHashes = mockDatabase.createUnlockCode.mock.calls.map((c: any[]) => c[3]);
            expect(recordedHashes).toContain('0x123');
            expect(recordedHashes).toContain('0xfee');
        });

        test('session tokens are no longer accepted via query string on downloads', async () => {
            const jwt = (await import('jsonwebtoken')).default;
            const sessionToken = jwt.sign({ userId: 42 }, 'test-jwt-secret');
            mockDatabase.getUserSubscription.mockReturnValue({ status: 'active', expiresAt: null });
            mockDatabase.getTrack.mockReturnValue({ id: 5, file_path: 'a.mp3' });

            const res = await request(app)
                .get(`/api/payments/download/5?token=${sessionToken}`);

            // Without ?code and with the query session token ignored → 400
            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/Unlock code required/);
        });

        test('mints a download token and accepts it via dt query param', async () => {
            const jwt = (await import('jsonwebtoken')).default;
            const sessionToken = jwt.sign({ userId: 42 }, 'test-jwt-secret');
            mockDatabase.getUserSubscription.mockReturnValue({ status: 'active', expiresAt: null });
            mockDatabase.getTrack.mockReturnValue({ id: 5, file_path: 'a.mp3' });
            pathExistsSpy.mockResolvedValue(true as any);
            createReadStreamSpy.mockReturnValue({ pipe: (res: any) => res.end('data') } as any);

            const mint = await request(app)
                .post('/api/payments/download-token')
                .set('Authorization', `Bearer ${sessionToken}`);
            expect(mint.status).toBe(200);
            expect(mint.body.token).toBeTruthy();

            const dl = await request(app)
                .get(`/api/payments/download/5?dt=${mint.body.token}`);
            expect(dl.status).toBe(200);

            // A download token must not work as a session token
            const reuse = await request(app)
                .post('/api/payments/download-token')
                .set('Authorization', `Bearer ${mint.body.token}`);
            expect(reuse.status).toBe(401);
        });

        test('rejects external Stripe return URLs', async () => {
            const res = await request(app)
                .post('/api/payments/stripe/create-session')
                .send({ itemId: 5, type: 'track', successUrl: 'https://evil.com/ok', cancelUrl: 'https://site.com/no' });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/must point to this instance/);
        });
    });

    describe('GET /api/payments/rate/:currency', () => {
        test('returns rate on success', async () => {
            getEthUsdRateSpy.mockResolvedValue(3000 as any);
            // Fallback: mock fetch in case the ESM module binding bypasses the spy
            const origFetch = global.fetch;
            (global as any).fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ ethereum: { usd: 3000 } })
            });

            const res = await request(app).get('/api/payments/rate/usd');

            (global as any).fetch = origFetch;
            expect(res.status).toBe(200);
            expect(res.body.rate).toBe(3000);
        });

        test('returns 400 for unsupported currency', async () => {
            const res = await request(app).get('/api/payments/rate/eur');
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Unsupported currency');
        });
    });

    describe('GET /api/payments/download/:trackId', () => {
        test('returns 403 on invalid unlock code', async () => {
            mockDatabase.validateUnlockCode.mockReturnValue({ valid: false });

            const res = await request(app)
                .get('/api/payments/download/5')
                .query({ code: 'BADCODE' });

            expect(res.status).toBe(403);
            expect(res.body.error).toBe('Invalid or expired unlock code');
        });

        test('pipes track read stream on valid code', async () => {
            mockDatabase.validateUnlockCode.mockReturnValue({
                valid: true,
                trackId: 5
            });
            mockDatabase.getTrack.mockReturnValue({
                id: 5,
                file_path: 'artist/album/song.mp3'
            });
            pathExistsSpy.mockResolvedValue(true as any);
            const mockStream = {
                pipe: jest.fn().mockImplementation((res: any) => {
                    res.write(Buffer.from('streaming-data'));
                    res.end();
                })
            };
            createReadStreamSpy.mockReturnValue(mockStream as any);

            const res = await request(app)
                .get('/api/payments/download/5')
                .query({ code: 'GOODCODE' });

            expect(res.status).toBe(200);
            expect(res.body.toString()).toBe('streaming-data');
            expect(fsExtra.createReadStream).toHaveBeenCalledWith(expect.stringContaining('song.mp3'));
        });
    });

    describe('Subscription Payments and Downloads', () => {
        let jwtToken: string;

        beforeEach(async () => {
            const jwtLib = (await import('jsonwebtoken')) as any;
            jwtToken = jwtLib.default.sign({ userId: 42 }, 'test-jwt-secret');
        });

        test('POST /api/payments/stripe/create-subscription-session returns 401 if unauthenticated', async () => {
            const res = await request(app)
                .post('/api/payments/stripe/create-subscription-session')
                .send({ successUrl: 'https://site.com/ok', cancelUrl: 'https://site.com/no' });

            expect(res.status).toBe(401);
        });

        test('POST /api/payments/stripe/create-subscription-session creates Stripe session successfully', async () => {
            mockStripe.checkout.sessions.create.mockResolvedValue({
                id: 'sub_sess_123',
                url: 'https://checkout.stripe.com/sub_sess_123'
            });

            const res = await request(app)
                .post('/api/payments/stripe/create-subscription-session')
                .set('Authorization', `Bearer ${jwtToken}`)
                .send({ successUrl: 'https://site.com/ok', cancelUrl: 'https://site.com/no', email: 'fan@test.com' });

            expect(res.status).toBe(200);
            expect(res.body.id).toBe('sub_sess_123');
            expect(res.body.url).toBe('https://checkout.stripe.com/sub_sess_123');
        });

        test('Stripe Webhook processes checkout.session.completed for a subscription', async () => {
            const mockEvent = {
                type: 'checkout.session.completed',
                data: {
                    object: {
                        metadata: {
                            type: 'subscription',
                            userId: '42'
                        }
                    }
                }
            };
            mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);

            const res = await request(app)
                .post('/api/payments/stripe/webhook')
                .set('stripe-signature', 'valid-sig')
                .send({ id: 'evt_sub_123' });

            expect(res.status).toBe(200);
            expect(res.body.received).toBe(true);
            expect(mockDatabase.updateSubscription).toHaveBeenCalledWith(
                42,
                'active',
                expect.any(String)
            );
        });

        test('POST /api/payments/subscription/verify returns 401 if unauthenticated', async () => {
            const res = await request(app)
                .post('/api/payments/subscription/verify')
                .send({ txHash: '0xHash' });

            expect(res.status).toBe(401);
        });

        test('POST /api/payments/subscription/verify rejects replay attempts', async () => {
            mockDatabase.getUnlockCodeByTxHash.mockReturnValue({ code: 'SUB-ALREADY-USED' });

            const res = await request(app)
                .post('/api/payments/subscription/verify')
                .set('Authorization', `Bearer ${jwtToken}`)
                .send({ txHash: '0xReplay' });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('already been used');
        });

        test('GET /api/payments/download/:trackId allows direct download for active subscribers', async () => {
            mockDatabase.getUserSubscription.mockReturnValue({
                status: 'active',
                expiresAt: new Date(Date.now() + 1000 * 3600).toISOString() // Future expiration
            });
            mockDatabase.getTrack.mockReturnValue({
                id: 5,
                file_path: 'artist/album/song.mp3'
            });
            pathExistsSpy.mockResolvedValue(true as any);
            const mockStream = {
                pipe: jest.fn().mockImplementation((res: any) => {
                    res.write(Buffer.from('subscriber-data'));
                    res.end();
                })
            };
            createReadStreamSpy.mockReturnValue(mockStream as any);

            const res = await request(app)
                .get('/api/payments/download/5')
                .set('Authorization', `Bearer ${jwtToken}`);

            expect(res.status).toBe(200);
            expect(res.body.toString()).toBe('subscriber-data');
            expect(fsExtra.createReadStream).toHaveBeenCalledWith(expect.stringContaining('song.mp3'));
        });
    });

    describe('Track-cap topup', () => {
        let jwtToken: string;

        beforeEach(async () => {
            const jwtLib = (await import('jsonwebtoken')) as any;
            jwtToken = jwtLib.default.sign({ userId: 42 }, 'test-jwt-secret');
        });

        describe('Stripe Webhook processes checkout.session.completed for a trackcap_topup', () => {
            test('grants the purchased tracks via authService.addPurchasedTracks', async () => {
                const mockEvent = {
                    type: 'checkout.session.completed',
                    data: {
                        object: {
                            id: 'cs_trackcap_1',
                            metadata: {
                                type: 'trackcap_topup',
                                userId: '42',
                                tracksGranted: '10',
                                effectiveQuotaAtPurchase: '5'
                            }
                        }
                    }
                };
                mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);

                const res = await request(app)
                    .post('/api/payments/stripe/webhook')
                    .set('stripe-signature', 'valid-sig')
                    .send({ id: 'evt_trackcap_1' });

                expect(res.status).toBe(200);
                expect(res.body.received).toBe(true);
                expect(mockAuthService.addPurchasedTracks).toHaveBeenCalledWith(42, 10, 5);
                expect(mockDatabase.createUnlockCode).toHaveBeenCalledWith(
                    expect.any(String), undefined, undefined, 'stripe:cs_trackcap_1'
                );
            });

            test('is idempotent for a duplicate webhook delivery', async () => {
                mockDatabase.getUnlockCodeByTxHash.mockReturnValue({ code: 'ALREADY-GRANTED' });
                const mockEvent = {
                    type: 'checkout.session.completed',
                    data: {
                        object: {
                            id: 'cs_trackcap_dupe',
                            metadata: {
                                type: 'trackcap_topup',
                                userId: '42',
                                tracksGranted: '10',
                                effectiveQuotaAtPurchase: '5'
                            }
                        }
                    }
                };
                mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);

                const res = await request(app)
                    .post('/api/payments/stripe/webhook')
                    .set('stripe-signature', 'valid-sig')
                    .send({ id: 'evt_trackcap_dupe' });

                expect(res.status).toBe(200);
                expect(mockAuthService.addPurchasedTracks).not.toHaveBeenCalled();
            });
        });

        describe('POST /api/payments/stripe/create-trackcap-session', () => {
            test('returns 401 if unauthenticated', async () => {
                const res = await request(app)
                    .post('/api/payments/stripe/create-trackcap-session')
                    .send({ successUrl: 'https://site.com/ok', cancelUrl: 'https://site.com/no' });

                expect(res.status).toBe(401);
            });

            test('rejects external return URLs', async () => {
                const res = await request(app)
                    .post('/api/payments/stripe/create-trackcap-session')
                    .set('Authorization', `Bearer ${jwtToken}`)
                    .send({ successUrl: 'https://evil.com/ok', cancelUrl: 'https://site.com/no' });

                expect(res.status).toBe(400);
                expect(res.body.error).toMatch(/must point to this instance/);
            });

            test('returns 501 if Stripe is not configured', async () => {
                mockDatabase.getSetting.mockImplementation(() => null);
                const guestConfig = { ...mockConfig, stripeSecretKey: '' };
                const guestApp = express();
                guestApp.use('/api/payments', createPaymentsRoutes({
                    database: mockDatabase,
                    identity: mockDatabase,
                    library: mockDatabase,
                    integration: mockDatabase,
                    musicDir: '/tmp/music',
                    config: guestConfig,
                    authService: mockAuthService
                } as any));

                const res = await request(guestApp)
                    .post('/api/payments/stripe/create-trackcap-session')
                    .set('Authorization', `Bearer ${jwtToken}`)
                    .send({ successUrl: 'https://site.com/ok', cancelUrl: 'https://site.com/no' });

                expect(res.status).toBe(501);
            });

            test('creates a session using the global listenerTrackCap when the user has no per-user override', async () => {
                mockAuthService.getTrackQuotaInfo.mockReturnValue({ track_quota: null, track_quota_floor: 0 });
                mockDatabase.getSetting.mockImplementation((k: string) => {
                    if (k === 'listenerTrackCap') return '20';
                    if (k === 'trackcapTopupPriceUsd') return '4.99';
                    if (k === 'trackcapTopupTracksGranted') return '10';
                    return null;
                });
                mockStripe.checkout.sessions.create.mockResolvedValue({
                    id: 'sess_trackcap',
                    url: 'https://checkout.stripe.com/sess_trackcap'
                });

                const res = await request(app)
                    .post('/api/payments/stripe/create-trackcap-session')
                    .set('Authorization', `Bearer ${jwtToken}`)
                    .send({ successUrl: 'https://site.com/ok', cancelUrl: 'https://site.com/no' });

                expect(res.status).toBe(200);
                expect(res.body.id).toBe('sess_trackcap');
                const [params] = mockStripe.checkout.sessions.create.mock.calls[0];
                expect(params.line_items[0].price_data.unit_amount).toBe(499);
                expect(params.metadata).toEqual({
                    type: 'trackcap_topup',
                    userId: '42',
                    tracksGranted: '10',
                    effectiveQuotaAtPurchase: '20'
                });
            });

            test('creates a session using the per-user track quota override when present', async () => {
                mockAuthService.getTrackQuotaInfo.mockReturnValue({ track_quota: 35, track_quota_floor: 25 });
                mockDatabase.getSetting.mockImplementation((k: string) => {
                    if (k === 'trackcapTopupPriceUsd') return '4.99';
                    if (k === 'trackcapTopupTracksGranted') return '10';
                    return null;
                });
                mockStripe.checkout.sessions.create.mockResolvedValue({
                    id: 'sess_trackcap2',
                    url: 'https://checkout.stripe.com/sess_trackcap2'
                });

                const res = await request(app)
                    .post('/api/payments/stripe/create-trackcap-session')
                    .set('Authorization', `Bearer ${jwtToken}`)
                    .send({ successUrl: 'https://site.com/ok', cancelUrl: 'https://site.com/no' });

                expect(res.status).toBe(200);
                const [params] = mockStripe.checkout.sessions.create.mock.calls[0];
                expect(params.metadata.effectiveQuotaAtPurchase).toBe('35');
            });
        });
    });
});
