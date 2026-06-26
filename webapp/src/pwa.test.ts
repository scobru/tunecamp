import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerPWA } from './pwa';

describe('registerPWA', () => {
    let originalNavigator: any;

    beforeEach(() => {
        // Save original navigator and clear mocks
        originalNavigator = global.navigator;
        vi.spyOn(window, 'addEventListener');
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        // Restore original navigator and mocks
        vi.restoreAllMocks();
        Object.defineProperty(global, 'navigator', {
            value: originalNavigator,
            writable: true,
            configurable: true,
        });
    });

    it('should not add load event listener if serviceWorker is not in navigator', () => {
        Object.defineProperty(global, 'navigator', {
            value: {},
            writable: true,
            configurable: true,
        });

        registerPWA();
        expect(window.addEventListener).not.toHaveBeenCalled();
    });

    it('should add load event listener if serviceWorker is in navigator', () => {
        Object.defineProperty(global, 'navigator', {
            value: {
                serviceWorker: {
                    register: vi.fn().mockResolvedValue({}),
                },
            },
            writable: true,
            configurable: true,
        });

        registerPWA();
        expect(window.addEventListener).toHaveBeenCalledWith('load', expect.any(Function));
    });

    it('should call navigator.serviceWorker.register on load event', async () => {
        const mockRegister = vi.fn().mockResolvedValue({});
        Object.defineProperty(global, 'navigator', {
            value: {
                serviceWorker: {
                    register: mockRegister,
                },
            },
            writable: true,
            configurable: true,
        });

        registerPWA();

        // Find the load event listener and call it
        const loadHandler = (window.addEventListener as any).mock.calls.find(
            (call: any[]) => call[0] === 'load'
        )[1];

        await loadHandler();

        expect(mockRegister).toHaveBeenCalledWith('/sw.js');
    });

    it('should log success message on successful registration', async () => {
        const mockRegistration = { scope: '/sw.js' };
        const mockRegister = vi.fn().mockResolvedValue(mockRegistration);

        Object.defineProperty(global, 'navigator', {
            value: {
                serviceWorker: {
                    register: mockRegister,
                },
            },
            writable: true,
            configurable: true,
        });

        registerPWA();

        const loadHandler = (window.addEventListener as any).mock.calls.find(
            (call: any[]) => call[0] === 'load'
        )[1];

        await loadHandler();

        // Wait for microtasks to complete to let the promise resolve
        await new Promise(process.nextTick);

        expect(console.log).toHaveBeenCalledWith('SW registered: ', mockRegistration);
    });

    it('should log error message on failed registration', async () => {
        const mockError = new Error('Registration failed');
        const mockRegister = vi.fn().mockRejectedValue(mockError);

        Object.defineProperty(global, 'navigator', {
            value: {
                serviceWorker: {
                    register: mockRegister,
                },
            },
            writable: true,
            configurable: true,
        });

        registerPWA();

        const loadHandler = (window.addEventListener as any).mock.calls.find(
            (call: any[]) => call[0] === 'load'
        )[1];

        await loadHandler();

        // Wait for microtasks to complete to let the promise catch block execute
        await new Promise(process.nextTick);

        expect(console.log).toHaveBeenCalledWith('SW registration failed: ', mockError);
    });
});
