/**
 * Shared ZEN configuration for Tunecamp
 * Used by server, webapp, and CLI tools
 */

export const DEFAULT_ZEN_PEERS = [
    "wss://shogun-relay.scobrudot.dev/zen",
];

export const ZEN_CONFIG_DEFAULTS = {
    localStorage: false,
    radisk: true,
    axe: false,
    file: "./radata"
};
