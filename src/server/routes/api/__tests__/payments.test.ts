import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// Mock packages
jest.unstable_mockModule('stripe', () => {
    const mockStripeInstance = {
        webhooks: {
            constructEvent: jest.fn()
        },
        crypto: {
            onrampSessions: {
                create: jest.fn()
            }
        },
        checkout: {
            sessions: {
                create: jest.fn()
            }
        }
    };
    return {
        default: jest.fn().mockImplementation(() => mockStripeInstance)
    };
});

jest.unstable_mockModule('ethers', () => {
    const mockProviderInstance = {
        getTransaction: jest.fn(),
        getTransactionReceipt: jest.fn()
    };
    const mockInterfaceInstance = {
        parseTransaction: jest.fn()
    };
    return {
        ethers: {
            JsonRpcProvider: jest.fn().mockImplementation(() => mockProviderInstance),
            Interface: jest.fn().mockImplementation(() => mockInterfaceInstance),
            formatEther: jest.fn().mockImplementation((val: any) => String(val)),
            formatUnits: jest.fn().mockImplementation((val: any) => String(val))
        }
    };
});

jest.unstable_mockModule('fs-extra', () => ({
    default: {
        pathExists: jest.fn(),
        createReadStream: jest.fn()
    }
}));

jest.unstable_mockModule('../../../modules/catalog/price.js', () => ({
    getEthUsdRate: jest.fn()
}));

const { default: Stripe } = await import('stripe');
const { ethers } = await import('ethers');
const { default: fs } = await import('fs-extra');
const { getEthUsdRate } = await import('../../../modules/catalog/price.js');
const { createPaymentsRoutes } = await import('../payments.js');

describe('Payments Routes', () => {
    let app: express.Express;
    let mockDatabase: any;
    let mockConfig: any;
    let mockStripe: any;
    let mockProvider: any;
    let mockInterface: any;
    let consoleErrorSpy: any;
    let consoleWarnSpy: any;

    beforeEach(() => {
        jest.clearAllMocks();

        mockDatabase = {
            getSetting: jest.fn(),
            getTrack: jest.fn(),
            getAlbum: jest.fn(),
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

        app = express();
        // The stripe raw parser is handled by payments routes itself before router.use(json())
        app.use('/api/payments', createPaymentsRoutes(mockDatabase, '/tmp/music', mockConfig));

        // Get instances from mocks
        mockStripe = new (Stripe as any)();
        const providerInst = new (ethers.JsonRpcProvider as any)();
        mockProvider = providerInst;
        const interfaceInst = new (ethers.Interface as any)();
        mockInterface = interfaceInst;

        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
        consoleWarnSpy.mockRestore();
    });

    describe('POST /api/payments/stripe/webhook', () => {
        test('returns 501 if stripe is not configured', async () => {
            mockDatabase.getSetting.mockImplementation(() => null);
            const emptyConfig = { stripeSecretKey: '', stripeWebhookSecret: '' } as any;
            const guestApp = express();
            guestApp.use('/api/payments', createPaymentsRoutes(mockDatabase, '/tmp/music', emptyConfig));

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
                5
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
                .send({ itemId: 99, type: 'track', successUrl: 'http://ok', cancelUrl: 'http://no' });

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
                .send({ itemId: 5, type: 'track', successUrl: 'http://ok', cancelUrl: 'http://no' });

            expect(res.status).toBe(200);
            expect(res.body.id).toBe('sess_123');
            expect(res.body.url).toBe('https://checkout.stripe.com/sess_123');
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

            const res = await request(app)
                .post('/api/payments/verify')
                .send({ txHash: '0x123', trackId: '5' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.method).toBe('DirectETH');
            expect(mockDatabase.createUnlockCode).toHaveBeenCalled();
        });
    });

    describe('GET /api/payments/rate/:currency', () => {
        test('returns rate on success', async () => {
            (getEthUsdRate as any).mockResolvedValue(3000);

            const res = await request(app).get('/api/payments/rate/usd');

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
            (fs.pathExists as any).mockResolvedValue(true);
            const mockStream = {
                pipe: jest.fn().mockImplementation((res: any) => {
                    res.write(Buffer.from('streaming-data'));
                    res.end();
                })
            };
            (fs.createReadStream as any).mockReturnValue(mockStream);

            const res = await request(app)
                .get('/api/payments/download/5')
                .query({ code: 'GOODCODE' });

            expect(res.status).toBe(200);
            expect(res.body.toString()).toBe('streaming-data');
            expect(fs.createReadStream).toHaveBeenCalledWith(expect.stringContaining('song.mp3'));
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
                .send({ successUrl: 'http://ok', cancelUrl: 'http://no' });

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
                .send({ successUrl: 'http://ok', cancelUrl: 'http://no', email: 'fan@test.com' });

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
            (fs.pathExists as any).mockResolvedValue(true);
            const mockStream = {
                pipe: jest.fn().mockImplementation((res: any) => {
                    res.write(Buffer.from('subscriber-data'));
                    res.end();
                })
            };
            (fs.createReadStream as any).mockReturnValue(mockStream);

            const res = await request(app)
                .get('/api/payments/download/5')
                .set('Authorization', `Bearer ${jwtToken}`);

            expect(res.status).toBe(200);
            expect(res.body.toString()).toBe('subscriber-data');
            expect(fs.createReadStream).toHaveBeenCalledWith(expect.stringContaining('song.mp3'));
        });
    });
});
