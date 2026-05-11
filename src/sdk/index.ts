export * from './interfaces.js';

/**
 * Helper to define a TuneCamp plugin with type checking.
 */
export function definePlugin<T>(plugin: T): T {
    return plugin;
}
