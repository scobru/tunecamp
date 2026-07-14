import { handleImageError } from './imageUtils';

describe('imageUtils', () => {
    describe('handleImageError', () => {
        it('should hide the target image and show the next element if it exists', () => {
            const target = document.createElement('img');
            const nextElement = document.createElement('div');
            nextElement.style.display = 'none';

            const parent = document.createElement('div');
            parent.appendChild(target);
            parent.appendChild(nextElement);

            const mockEvent = {
                target
            } as unknown as React.SyntheticEvent<HTMLImageElement, Event>;

            handleImageError(mockEvent);

            expect(target.style.display).toBe('none');
            expect(nextElement.style.display).toBe('flex');
        });

        it('should hide the target image and do nothing if next element does not exist', () => {
            const target = document.createElement('img');

            const parent = document.createElement('div');
            parent.appendChild(target);

            const mockEvent = {
                target
            } as unknown as React.SyntheticEvent<HTMLImageElement, Event>;

            handleImageError(mockEvent);

            expect(target.style.display).toBe('none');
        });
    });
});
