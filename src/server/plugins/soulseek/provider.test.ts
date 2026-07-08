import { jest } from '@jest/globals';
import { SoulseekDownloadProvider } from './provider.js';

describe('SoulseekDownloadProvider lifecycle hooks', () => {
    let service: any;

    beforeEach(() => {
        service = {
            connect: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
            disconnect: jest.fn(),
            checkStatus: jest.fn(),
            search: jest.fn(),
            download: jest.fn()
        };
    });

    it('onEnable connects using the injected credentials', async () => {
        const fakeCreds = { username: 'test-user', password: 'test-placeholder' };
        const provider = new SoulseekDownloadProvider(service, () => fakeCreds);
        await provider.onEnable();
        expect(service.connect).toHaveBeenCalledWith(fakeCreds.username, fakeCreds.password);
    });

    it('onEnable without a credentials getter falls back to env-based connect', async () => {
        const provider = new SoulseekDownloadProvider(service);
        await provider.onEnable();
        expect(service.connect).toHaveBeenCalledWith(undefined, undefined);
    });

    it('onEnable does not reject when the connection fails', async () => {
        service.connect.mockRejectedValue(new Error('network down'));
        const provider = new SoulseekDownloadProvider(service, () => ({}));
        await expect(provider.onEnable()).resolves.toBeUndefined();
    });

    it('onDisable disconnects from the network', async () => {
        const provider = new SoulseekDownloadProvider(service);
        await provider.onDisable();
        expect(service.disconnect).toHaveBeenCalled();
    });
});
