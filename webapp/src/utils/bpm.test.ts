import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectBpmFromUrl } from './bpm';

describe('detectBpmFromUrl', () => {
    let mockFetch: ReturnType<typeof vi.fn>;
    let mockDecodeAudioData: ReturnType<typeof vi.fn>;
    let mockClose: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        mockFetch = vi.fn();
        vi.stubGlobal('fetch', mockFetch as any);

        mockDecodeAudioData = vi.fn().mockImplementation(async () => {
            return {
                sampleRate: 44100,
                length: 44100 * 10,
                getChannelData: () => new Float32Array(44100 * 10)
            };
        });

        mockClose = vi.fn().mockResolvedValue(undefined);

        class MockAudioContext {
            decodeAudioData = mockDecodeAudioData;
            close = mockClose;
        }

        vi.stubGlobal('AudioContext', MockAudioContext);

        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('returns null if AudioContext is not supported', async () => {
        // Only remove the AudioContext stub, keep fetch stubbed just in case
        vi.stubGlobal('AudioContext', undefined);
        vi.stubGlobal('webkitAudioContext', undefined);
        const result = await detectBpmFromUrl('http://example.com/audio.mp3');
        expect(result).toBeNull();
    });

    it('returns null if fetch fails (res.ok is false)', async () => {
        mockFetch.mockResolvedValueOnce({ ok: false });
        const result = await detectBpmFromUrl('http://example.com/audio.mp3');
        expect(result).toBeNull();
    });

    it('returns null if fetch throws an error', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Network error'));
        const result = await detectBpmFromUrl('http://example.com/audio.mp3');
        expect(result).toBeNull();
    });

    it('returns null if decodeAudioData throws an error', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8))
        });
        mockDecodeAudioData.mockRejectedValueOnce(new Error('Decode error'));

        const result = await detectBpmFromUrl('http://example.com/audio.mp3');
        expect(result).toBeNull();
    });

    it('returns a calculated BPM when audio data is successfully processed', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8))
        });

        mockDecodeAudioData.mockImplementation(async () => {
            const sampleRate = 44100;
            const length = sampleRate * 10;
            const data = new Float32Array(length);
            const interval = sampleRate * 0.5;

            for (let i = 0; i < length; i += interval) {
                for(let j=0; j<10; j++) {
                    if (i+j < length) data[i+j] = 1.0;
                }
            }

            return {
                sampleRate,
                length,
                getChannelData: () => data
            };
        });

        const result = await detectBpmFromUrl('http://example.com/audio.mp3');
        expect(result).toBeTypeOf('number');
    });

    it('returns null if onset envelope is too short for estimation', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8))
        });

        mockDecodeAudioData.mockImplementation(async () => {
            const sampleRate = 44100;
            const length = sampleRate * 0.1;
            const data = new Float32Array(length);
            return {
                sampleRate,
                length,
                getChannelData: () => data
            };
        });

        const result = await detectBpmFromUrl('http://example.com/audio.mp3');
        expect(result).toBeNull();
    });
});
