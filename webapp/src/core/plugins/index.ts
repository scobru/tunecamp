import './registry'; // Initialize registry

// Glob-import every plugin folder under src/plugins so white-label builds can
// drop a provider (youtube/telegram/...) by deleting its directory —
// no edit needed here. Missing folders are simply absent from the glob.
import.meta.glob('../../plugins/*/index.{ts,tsx}', { eager: true });

export { pluginRegistry } from './registry';
