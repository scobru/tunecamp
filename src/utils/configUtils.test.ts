import { describe, expect, test } from '@jest/globals';
import { validateCatalogConfig } from './configUtils.js';
import { CatalogConfig } from '../types/index.js';

describe('validateCatalogConfig', () => {
  test('should not throw for a valid catalog config', () => {
    const validConfig: CatalogConfig = {
      title: 'My Catalog'
    };
    expect(() => validateCatalogConfig(validConfig)).not.toThrow();
  });

  test('should throw if catalog config is missing a title', () => {
    const invalidConfig = {} as CatalogConfig;
    expect(() => validateCatalogConfig(invalidConfig)).toThrow('Catalog config must have a title');
  });
});
