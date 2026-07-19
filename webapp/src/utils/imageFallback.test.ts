import { describe, it, expect } from 'vitest';
import { handleImageFallback } from './imageFallback';
import type { SyntheticEvent } from 'react';

describe('handleImageFallback', () => {
    it('should set target display to none', () => {
        const target = document.createElement('img');
        const event = {
            target
        } as unknown as SyntheticEvent<HTMLImageElement, Event>;

        handleImageFallback(event);
        expect(target.style.display).toBe('none');
    });

    it('should set nextElementSibling display to flex if it exists', () => {
        const target = document.createElement('img');
        const nextElement = document.createElement('div');

        // We mock nextElementSibling since we are not putting it in the DOM
        Object.defineProperty(target, 'nextElementSibling', {
            get: () => nextElement
        });

        const event = {
            target
        } as unknown as SyntheticEvent<HTMLImageElement, Event>;

        handleImageFallback(event);
        expect(target.style.display).toBe('none');
        expect(nextElement.style.display).toBe('flex');
    });
});

describe('handleImageFallback - edge case', () => {
    it('should only hide the target image if there is no next sibling', () => {
        const target = {
            style: { display: 'block' },
            nextElementSibling: null
        } as unknown as HTMLImageElement;

        const event = {
            target
        } as unknown as SyntheticEvent<HTMLImageElement, Event>;

        handleImageFallback(event);

        expect(target.style.display).toBe('none');
    });
});
