import { describe, test, expect } from '@jest/globals';
import { mergeUniqueById } from './radio.service.js';

describe('mergeUniqueById', () => {
    test('concatenates groups preserving first-seen order', () => {
        const out = mergeUniqueById([
            [{ id: 1 }, { id: 2 }],
            [{ id: 3 }],
        ]);
        expect(out.map(r => r.id)).toEqual([1, 2, 3]);
    });

    test('drops duplicate ids across groups, keeping the first occurrence', () => {
        const out = mergeUniqueById([
            [{ id: 1, src: 'playlist' }, { id: 2, src: 'playlist' }],
            [{ id: 2, src: 'genre' }, { id: 4, src: 'genre' }], // id 2 already seen
        ]);
        expect(out.map(r => r.id)).toEqual([1, 2, 4]);
        // The duplicate is dropped, not merged: the first (playlist) row wins.
        expect((out[1] as any).src).toBe('playlist');
    });

    test('handles empty groups and an empty input', () => {
        expect(mergeUniqueById([])).toEqual([]);
        expect(mergeUniqueById([[], []])).toEqual([]);
    });
});
