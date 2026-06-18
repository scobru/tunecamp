import { jest } from '@jest/globals';

export const mockDbClient = {
    search: jest.fn(),
    getRelease: jest.fn(),
};

const disconnectMock = {
    Client: class {
        constructor(_userAgent: string, _opts?: any) {}
        database() { return mockDbClient; }
    }
};

export default disconnectMock;
