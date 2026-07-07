import { jest } from '@jest/globals';
import type { OpenRouterService } from '../openrouter.service.js';

describe('initAIService', () => {
    let mockOpenRouterService: OpenRouterService;

    beforeEach(() => {
        mockOpenRouterService = {} as unknown as OpenRouterService;
    });

    it('should register OpenRouterAIProvider and return the singleton service', async () => {
        let aiModule: any;
        await jest.isolateModulesAsync(async () => {
            aiModule = await import('../ai.service.js');
        });

        const { initAIService, aiService } = aiModule;

        const result = initAIService(mockOpenRouterService);

        expect(result).toBe(aiService);
        const registry = result.getRegistry();
        const providers = registry.getAll();

        expect(providers.length).toBe(1);
        expect(providers[0].id).toBe('openrouter');
        expect(registry.isEnabled('openrouter')).toBe(true);
    });

    it('should register and sync with database if provided', async () => {
        let aiModule: any;
        await jest.isolateModulesAsync(async () => {
            aiModule = await import('../ai.service.js');
        });

        const { initAIService, aiService } = aiModule;

        const mockDb = {
            getAllPluginsState: jest.fn().mockReturnValue([
                { id: 'openrouter', enabled: 0 }
            ])
        };

        const result = initAIService(mockOpenRouterService, mockDb);

        // Let the unawaited promise complete
        await new Promise(resolve => setImmediate(resolve));

        expect(mockDb.getAllPluginsState).toHaveBeenCalled();
        const registry = result.getRegistry();
        expect(registry.isEnabled('openrouter')).toBe(false);
    });

    it('should log an error if db sync fails', async () => {
        let aiModule: any;
        await jest.isolateModulesAsync(async () => {
            aiModule = await import('../ai.service.js');
        });

        const { initAIService } = aiModule;

        const mockDb = {
            getAllPluginsState: jest.fn().mockImplementation(() => {
                throw new Error('Database connection failed');
            })
        };

        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        initAIService(mockOpenRouterService, mockDb);

        await new Promise(resolve => setImmediate(resolve));

        expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to sync AI registry:', expect.any(Error));
        expect(consoleErrorSpy.mock.calls[0][1].message).toBe('Database connection failed');

        consoleErrorSpy.mockRestore();
    });
});
