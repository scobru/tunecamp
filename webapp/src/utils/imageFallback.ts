import type { SyntheticEvent } from 'react';

export const handleImageFallback = (e: SyntheticEvent<HTMLImageElement, Event>) => {
    const target = e.target as HTMLImageElement;
    target.style.display = 'none';
    if (target.nextElementSibling) {
        (target.nextElementSibling as HTMLElement).style.display = 'flex';
    }
};
