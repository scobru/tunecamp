import { CatalogConfig } from '../types/index.js';

/**
 * Configuration file utilities
 */

export function validateCatalogConfig(config: CatalogConfig): void {
  if (!config.title) {
    throw new Error('Catalog config must have a title');
  }
}

