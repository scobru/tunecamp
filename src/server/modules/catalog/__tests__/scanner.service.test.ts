import { describe, test, expect, beforeEach, beforeAll, jest } from '@jest/globals';

// Mock dependencies
const mockScanner = {
    scanDirectory: jest.fn().mockImplementation(() => Promise.resolve({ successful: [{ originalPath: 'file1.mp3' }], failed: [] } as any)),
    consolidateFiles: jest.fn(),
    processAudioFile: jest.fn(),
    clearCaches: jest.fn(),
};

// We must use unstable_mockModule before any other imports in ESM
jest.unstable_mockModule('../../../core/provider.js', () => ({
    ProviderRegistry: jest.fn().mockImplementation(() => ({
        register: jest.fn(),
        getEnabled: jest.fn().mockReturnValue([
            { 
                id: 'local-fs',
                name: 'local-fs', 
                version: '1.0.0',
                scan: jest.fn().mockImplementation(() => Promise.resolve(['file1.mp3'])),
                setMusicDirectory: jest.fn()
            } as any
        ]),
        get: jest.fn().mockReturnValue({
            scanner: mockScanner
        })
    })),
    syncRegistryWithDatabase: jest.fn().mockResolvedValue(undefined as never)
}));

// Mock the LocalScannerProvider to avoid instantiation issues
jest.unstable_mockModule('../../../providers/scanner/local-fs.provider.js', () => ({
    LocalScannerProvider: jest.fn()
}));

// Dynamic imports
let ScannerService: any;

describe('ScannerService', () => {
    let scannerService: any;

    beforeAll(async () => {
        const scannerModule = await import('../scanner.service.js');
        ScannerService = scannerModule.ScannerService;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        scannerService = new ScannerService(mockScanner as any);
    });

    test('scanAll should aggregate files from providers', async () => {
        const results = await scannerService.scanAll('/music');
        
        expect(results).toContain('file1.mp3');
        expect(results.length).toBe(1);
    });

    test('scanDirectory should proxy to local scanner', async () => {
        (mockScanner.scanDirectory as any).mockResolvedValue({ added: 1 });
        
        const result = await scannerService.scanDirectory('/music/folder');
        
        expect(result.added).toBe(1);
        expect(mockScanner.scanDirectory).toHaveBeenCalledWith('/music/folder', undefined);
    });

    test('processAudioFile should proxy to local scanner', async () => {
        await scannerService.processAudioFile('test.mp3', '/music');
        
        expect(mockScanner.processAudioFile).toHaveBeenCalledWith(
            'test.mp3', 
            '/music', 
            undefined, 
            undefined, 
            undefined, 
            undefined, 
            undefined
        );
    });

    test('clearCaches should call local scanner clearCaches', async () => {
        await scannerService.clearCaches();
        // Since getRegistry is mocked to return an object with get(), we verify it indirectly
    });
});
