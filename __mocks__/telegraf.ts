import { jest } from '@jest/globals';

export const mockBotInstance: any = {
    catch: jest.fn().mockReturnThis(),
    use: jest.fn().mockReturnThis(),
    on: jest.fn().mockReturnThis(),
    action: jest.fn().mockReturnThis(),
    launch: jest.fn().mockReturnValue(Promise.resolve()),
    stop: jest.fn(),
};

export class Telegraf {
    constructor() {
        return mockBotInstance;
    }
}

export default { Telegraf };
