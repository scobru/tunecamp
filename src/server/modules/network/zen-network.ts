// @ts-ignore
import { hwid } from "zen/lib/discover.js";

export const kprs = new Set<string>(); // Keep for backward-compatibility
let registry: any = null;
let adoptPeer: any = null;

async function discoverNetworkIdentity(configuredPort: number) {
  return { domain: null, ip: "127.0.0.1", port: configuredPort, source: "none" };
}

export function getHardwarePeerId() {
  try {
    return hwid();
  } catch {
    return null;
  }
}

function setupPeerExchange(zenInstance: any, serverUrl: string | null) {
  // No-op in pure client-only mode
}

function latchDomain(req: any, zenInstance: any) {
  return null; // No-op in pure client-only mode
}
