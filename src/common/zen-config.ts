/**
 * Shared ZEN configuration for Tunecamp
 * Used by server, webapp, and CLI tools
 */

export const DEFAULT_ZEN_PEERS = [
    "wss://delay.scobrudot.dev/zen",
];

export const ZEN_CONFIG_DEFAULTS = {
    localStorage: false,
    radisk: false,
    axe: false,
    file: false as any
};

