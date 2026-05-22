const loggers = {
  server: {
    info: (...args: any[]) => console.log('📡 [ZEN]', ...args),
    debug: (...args: any[]) => console.log('🔍 [ZEN]', ...args),
    warn: (...args: any[]) => console.warn('⚠️ [ZEN]', ...args),
    error: (...args: any[]) => console.error('🚨 [ZEN]', ...args)
  }
};

// @ts-ignore
import { disc, hwid } from "zen/lib/discover.js";
// @ts-ignore
import { setupRelayPex } from "zen/lib/pex.js";
// @ts-ignore
import { PeerRegistry } from "zen/lib/peer-registry.js";
// @ts-ignore
import * as xdg from "zen/lib/xdg.js";
import path from "path";

export const kprs = new Set<string>(); // Keep for backward-compatibility
export let registry: any = null;
export let adoptPeer: any = null;

let activeDomain: string | null = null;
let activePort: number = 8420;

export async function discoverNetworkIdentity(configuredPort: number) {
  // disc() returns { domain, ip, port, source }
  const network = await disc({ port: configuredPort, noSave: true });
  activeDomain = network.domain || network.ip;
  activePort = network.port;
  return network;
}

export function getHardwarePeerId() {
  return hwid();
}

export function setupPeerExchange(zenInstance: any, serverUrl: string | null) {
  if (serverUrl) {
    kprs.add(serverUrl);
  }

  const root = zenInstance._graph._;
  const initPeers = (root.opt && root.opt.peers) || [];

  // 1. Initialize PeerRegistry persisting to data directory
  const PEERS_PATH = path.join(xdg.data(), "peers.json");
  loggers.server.info(`📂 PeerRegistry persisting to: ${PEERS_PATH}`);
  registry = new PeerRegistry().bindSave(PEERS_PATH);

  // 2. Protect boot and initial peers
  if (serverUrl) {
    registry.protect(serverUrl);
  }
  if (Array.isArray(initPeers) && initPeers.length > 0) {
    registry.protect(initPeers);
  }

  // 3. Wire up PEX using setupRelayPex
  const pexResult = setupRelayPex(zenInstance, {
    domain: activeDomain,
    port: activePort,
    registry,
    pexMax: 50,
    onAdopt: (url: string) => {
      // Keep kprs dynamic for backward-compatibility
      kprs.add(PeerRegistry.alt(url));
    }
  });

  adoptPeer = pexResult.adopt;

  // 4. Load persisted peers
  setImmediate(() => {
    try {
      const count = registry.load(adoptPeer);
      loggers.server.info(`🤝 Loaded ${count} persisted peers`);

      // Populate kprs with loaded peers for full compatibility
      registry.bootEntries().forEach((e: any) => kprs.add(PeerRegistry.alt(e.url)));
      registry.confirmedNonBoot().forEach((e: any) => kprs.add(PeerRegistry.alt(e.url)));
    } catch (err: any) {
      loggers.server.error(`🚨 Error loading persisted peers: ${err.message}`);
    }
  });
}

export function latchDomain(req: any, zenInstance: any) {
  if (activeDomain) return activeDomain;
  const host = (req.headers.host || "").split(":")[0];
  if (host && host !== "localhost" && !/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    activeDomain = host;
    loggers.server.info(`🌐 Domain latched from request: ${activeDomain}`);
    if (registry && activeDomain) {
      const scheme = "wss";
      const origin = `${scheme}://${activeDomain}:1970/zen`;
      registry.setSelf(origin);
    }
  }
  return activeDomain;
}
