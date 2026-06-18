import { jest } from '@jest/globals';

export const workerPool = {
    runTask: jest.fn().mockResolvedValue(null),
    shutdown: jest.fn()
};
