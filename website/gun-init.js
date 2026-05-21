/**
 * Shared GunDB / ZEN initialization for Tunecamp Website
 */

// Default peers
const REGISTRY_PEERS = [
    "wss://sudorecords.scobrudot.dev/zen",
"wss://shogun-relay.scobrudot.dev/zen",
"wss://zen.akao.io:8420/zen",
"wss://zen0.akao.io:8420/zen",
"wss://zen1.akao.io:8420/zen"
];

// Add current origin as a peer if we are running on a Tunecamp instance
if (window.location.protocol.startsWith('http') && !window.location.hostname.includes('vercel.app')) {
    const localPeer = `${window.location.origin}/zen`.replace('http://', 'ws://').replace('https://', 'wss://');
    if (!REGISTRY_PEERS.includes(localPeer)) {
        REGISTRY_PEERS.push(localPeer);
    }
}

// Singleton instance
let gunInstance = null;

function getZen() {
    if (!gunInstance) {
        if (typeof Zen === 'undefined') {
            console.error("Zen library not loaded! Make sure zen.js is included before gun-init.js");
            return null;
        }

        console.log("📡 Initializing shared Zen instance...");
        gunInstance = new Zen({
            peers: REGISTRY_PEERS,
            localStorage: false
        });

        // Connection logging
        gunInstance.on('hi', (peer) => {
            console.log("✅ Zen connected to peer:", peer.url);
        });

        gunInstance.on('bye', (peer) => {
            console.warn("❌ Zen disconnected from peer:", peer.url);
        });
    }
    return gunInstance;
}

// Global export
window.getZen = getZen;
window.getGun = getZen; // fallback
