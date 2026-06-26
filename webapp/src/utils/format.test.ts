import { describe, it, expect } from 'vitest';
import { formatDuration } from './format';

describe('formatDuration', () => {
    // Happy paths
    it('formats durations under a minute correctly', () => {
        expect(formatDuration(45)).toBe('00:45');
        expect(formatDuration(5)).toBe('00:05');
        expect(formatDuration(0)).toBe('00:00');
    });

    it('formats durations over a minute correctly', () => {
        expect(formatDuration(65)).toBe('01:05');
        expect(formatDuration(3599)).toBe('59:59');
        expect(formatDuration(60)).toBe('01:00');
    });

    it('formats durations over an hour correctly', () => {
        expect(formatDuration(3600)).toBe('1:00:00');
        expect(formatDuration(3665)).toBe('1:01:05');
        expect(formatDuration(7325)).toBe('2:02:05');
        expect(formatDuration(36000)).toBe('10:00:00');
    });

    // Edge cases and error conditions
    it('returns "00:00" for null input', () => {
        expect(formatDuration(null)).toBe('00:00');
    });

    it('returns "00:00" for undefined input', () => {
        expect(formatDuration(undefined)).toBe('00:00');
    });

    it('returns "00:00" for NaN input', () => {
        expect(formatDuration(NaN)).toBe('00:00');
    });

    it('returns "00:00" for negative inputs', () => {
        expect(formatDuration(-10)).toBe('00:00');
        expect(formatDuration(-3600)).toBe('00:00');
    });
});
