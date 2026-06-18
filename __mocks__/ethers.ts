import { jest } from '@jest/globals';

export const mockProviderInstance = {
    getTransaction: jest.fn(),
    getTransactionReceipt: jest.fn()
};

export const mockInterfaceInstance = {
    parseTransaction: jest.fn()
};

export const ethers = {
    JsonRpcProvider: jest.fn().mockImplementation(() => mockProviderInstance),
    Interface: jest.fn().mockImplementation(() => mockInterfaceInstance),
    formatEther: jest.fn().mockImplementation((val: any) => String(val)),
    formatUnits: jest.fn().mockImplementation((val: any) => String(val))
};
