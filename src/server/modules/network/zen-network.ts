// Peer list shared with routes for backward-compatibility.
// NOTE: this module must stay free of `zen` imports — ZEN runs exclusively
// inside the worker thread (zen.worker.ts); the main thread never loads it.
export const kprs = new Set<string>();
