import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Fixes an O(n²) main-thread spin in the vendored slsk-client: every incoming
// distributed search request was deduped via indexOf() on a global array that
// grows forever. Under real Soulseek distributed-search traffic (~tens of
// requests/sec once the client joins the distribution tree) the event loop
// saturates after ~15 minutes, /health stops responding and Swarm kills the
// container (exit 137 "unhealthy"). We replace the array with an
// insertion-ordered Set capped at MAX_SEEN entries (dedup only needs to catch
// near-in-time duplicates arriving via sibling distribution branches).
const targetFile = path.resolve(
    __dirname,
    '../node_modules/andrade-soulseek-downloader/dist/slsk-client/peer/distributed-peer.js'
);

const MAX_SEEN = 5000;

const replacements = [
    {
        from: 'stack_1.default.peerSearchRequests = [];',
        to: 'stack_1.default.peerSearchRequests = new Set();'
    },
    {
        from: 'if (stack_1.default.peerSearchRequests.indexOf(searchKey) === -1) {',
        to: 'if (!stack_1.default.peerSearchRequests.has(searchKey)) {'
    },
    {
        from: 'stack_1.default.peerSearchRequests.push(searchKey);',
        to: `stack_1.default.peerSearchRequests.add(searchKey);
                        if (stack_1.default.peerSearchRequests.size > ${MAX_SEEN}) {
                            stack_1.default.peerSearchRequests.delete(stack_1.default.peerSearchRequests.keys().next().value);
                        }`
    }
];

try {
    if (!fs.existsSync(targetFile)) {
        console.warn('⚠️ [patch-slsk] distributed-peer.js not found, skipping patch.');
        process.exit(0);
    }

    let content = fs.readFileSync(targetFile, 'utf8');

    if (content.includes('peerSearchRequests = new Set()')) {
        console.log('✅ [patch-slsk] distributed-peer.js already patched.');
        process.exit(0);
    }

    const missing = replacements.filter(r => !content.includes(r.from));
    if (missing.length > 0) {
        console.warn('⚠️ [patch-slsk] Expected code not found (library updated?). File left untouched:');
        missing.forEach(r => console.warn(`   missing: ${r.from}`));
        process.exit(0);
    }

    for (const r of replacements) {
        content = content.replace(r.from, r.to);
    }

    fs.writeFileSync(targetFile, content, 'utf8');
    console.log(`✅ [patch-slsk] Patched distributed-peer.js: bounded search dedup Set (max ${MAX_SEEN} keys).`);
} catch (err) {
    console.warn('⚠️ [patch-slsk] Patch failed (non-fatal):', err.message);
}
