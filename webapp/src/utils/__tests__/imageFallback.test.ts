import { describe, it, expect } from 'vitest';
import { handleImageFallback } from '../imageFallback';
import type { SyntheticEvent } from 'react';

describe('handleImageFallback', () => {
    it('should hide the target image and show the next sibling if it exists', () => {
        const nextSibling = {
            style: { display: 'none' }
        } as HTMLElement;

        const target = {
            style: { display: 'block' },
            nextElementSibling: nextSibling
        } as unknown as HTMLImageElement;

        const event = {
            target
        } as unknown as SyntheticEvent<HTMLImageElement, Event>;

        handleImageFallback(event);

        expect(target.style.display).toBe('none');
        expect(nextSibling.style.display).toBe('flex');
    });

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
