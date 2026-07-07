import { BANDCAMP_IMAGE_BASE } from '../bandcamp';

describe('bandcamp constants', () => {
  describe('BANDCAMP_IMAGE_BASE', () => {
    it('should have the correct base URL', () => {
      expect(BANDCAMP_IMAGE_BASE).toBe('https://f4.bcbits.com/img');
    });
  });
});
