// @ts-ignore
import { hwid } from "zen/lib/discover.js";

export const kprs = new Set<string>(); // Keep for backward-compatibility
export let registry: any = null;
export let adoptPeer: any = null;

export async function discoverNetworkIdentity(configuredPort: number) {
  return { domain: null, ip: "127.0.0.1", port: configuredPort, source: "none" };
}

export function getHardwarePeerId() {
  try {
    return hwid();
  } catch {
    return null;
  }
}

export function setupPeerExchange(zenInstance: any, serverUrl: string | null) {
  // No-op in pure client-only mode
}

export function latchDomain(req: any, zenInstance: any) {
  return null; // No-op in pure client-only mode
}
