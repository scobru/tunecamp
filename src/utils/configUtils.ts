import { CatalogConfig, ReleaseConfig } from '../types/index.js';

/**
 * Configuration file utilities
 */

export function validateCatalogConfig(config: CatalogConfig): void {
  if (!config.title) {
    throw new Error('Catalog config must have a title');
  }
}

export function validateReleaseConfig(config: ReleaseConfig): void {
  if (!config.title) {
    throw new Error('Release config must have a title');
  }
  
  if (!config.date) {
    throw new Error('Release config must have a date');
  }
  
  if (config.download === 'paycurtain' && !config.price) {
    throw new Error('Release with paycurtain download mode must have a price');
  }
}

