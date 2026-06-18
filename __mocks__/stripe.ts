import { jest } from '@jest/globals';

export const mockStripeInstance = {
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
    },
    accounts: {
        create: jest.fn(),
        retrieve: jest.fn()
    }
};

const MockStripe = jest.fn().mockImplementation(() => mockStripeInstance);
export default MockStripe;
