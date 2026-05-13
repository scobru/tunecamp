#!/usr/bin/env node

/**
 * Tunecamp Unlock Codes Generator
 * CLI tool to generate and manage unlock codes for releases
 * 
 * Usage:
 *   npx ts-node src/tools/generate-codes.ts <release-slug> [options]
 * 
 * Examples:
 *   npx ts-node src/tools/generate-codes.ts my-album --count 10
 *   npx ts-node src/tools/generate-codes.ts my-album --count 50 --downloads 3
 */

// @ts-ignore
import { getZen as Zen } from '../server/modules/network/zen.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { StringUtils } from '../utils/stringUtils.js';
import { DEFAULT_ZEN_PEERS } from '../common/zen-config.js';

interface ZENKeyPair {
    pub: string;
    priv: string;
    epub: string;
    epriv: string;
    curve?: string;
}

interface CodeOptions {
    releaseSlug: string;
    count: number;
    maxDownloads: number;
    expiresInDays?: number;
    namespace: string;
    peers: string[];
    keypair?: ZENKeyPair;
}

/**
 * Generate a random unlock code
 */
function generateCode(): string {
    return StringUtils.generateUnlockCode();
}

/**
 * Hash a code for storage
 */
function hashCode(code: string): string {
    return crypto
        .createHash('sha256')
        .update(code.toLowerCase().trim())
        .digest('hex');
}

/**
 * Load ZEN key pair from file
 */
function loadKeyPair(keypairPath: string): ZENKeyPair {
    try {
        const fileContent = fs.readFileSync(keypairPath, 'utf-8');
        const parsed = JSON.parse(fileContent);
        
        if (!parsed.pub || !parsed.priv || !parsed.epub || !parsed.epriv) {
            throw new Error('Invalid keypair file: missing required keys');
        }
        
        return {
            pub: parsed.pub,
            priv: parsed.priv,
            epub: parsed.epub,
            epriv: parsed.epriv,
        };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to load keypair from ${keypairPath}: ${errorMessage}`);
    }
}

/**
 * Authenticate with Zen using ZEN pair
 */
async function authenticateZen(zen: any, pair: ZENKeyPair): Promise<void> {
    return new Promise((resolve, reject) => {
        const user = zen.user();
        
        user.auth(pair, (ack: any) => {
            if (ack.err) {
                reject(new Error(`Failed to authenticate: ${ack.err}`));
            } else {
                resolve();
            }
        });
    });
}

/**
 * Generate codes and store in GunDB
 */
async function generateCodes(options: CodeOptions): Promise<string[]> {
    const { releaseSlug, count, maxDownloads, expiresInDays, namespace, peers, keypair } = options;

    console.log(`\n🔐 Tunecamp Unlock Codes Generator`);
    console.log(`================================`);
    console.log(`Release: ${releaseSlug}`);
    console.log(`Count: ${count}`);
    console.log(`Max downloads per code: ${maxDownloads}`);
    if (expiresInDays) console.log(`Expires in: ${expiresInDays} days`);
    if (keypair) {
        console.log(`🔒 Using authenticated private space`);
    } else {
        console.log(`⚠️  Using public space (consider using --keypair for private storage)`);
    }
    console.log(`\nConnecting to Zen peers...`);

    // Initialize Zen
    const zen = Zen({ peers: DEFAULT_ZEN_PEERS });

    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Authenticate if keypair is provided
    if (keypair) {
        console.log(`\nAuthenticating with ZEN pair...`);
        try {
            await authenticateZen(zen, keypair);
            console.log(`✅ Authenticated successfully`);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`❌ Authentication failed: ${errorMessage}`);
            throw error;
        }
    }

    const codes: string[] = [];
    const expiresAt = expiresInDays
        ? Date.now() + (expiresInDays * 24 * 60 * 60 * 1000)
        : null;

    console.log(`\nGenerating ${count} codes...`);

    // Use user().get() for private space, or get() for public space
    const dbRoot = keypair ? zen.user() : zen;

    for (let i = 0; i < count; i++) {
        const code = generateCode();
        const codeHash = hashCode(code);

        // Store in GunDB (private space if authenticated, public otherwise)
        dbRoot
            .get(namespace)
            .get('releases')
            .get(releaseSlug)
            .get('codes')
            .get(codeHash)
            .put({
                createdAt: Date.now(),
                used: false,
                downloads: 0,
                maxDownloads,
                expiresAt,
            });

        codes.push(code);
        process.stdout.write(`\r  Progress: ${i + 1}/${count}`);
    }

    // Wait for sync
    console.log(`\n\nSyncing to peers...`);
    await new Promise(resolve => setTimeout(resolve, 3000));

    return codes;
}

/**
 * Main CLI
 */
async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help')) {
        console.log(`
Tunecamp Unlock Codes Generator

Usage:
  npx ts-node src/tools/generate-codes.ts <release-slug> [options]

Options:
  --count <n>       Number of codes to generate (default: 10)
  --downloads <n>   Max downloads per code (default: 1)
  --expires <days>  Days until codes expire (optional)
  --namespace <ns>  Zen namespace (default: tunecamp)
  --keypair <file>  Path to ZEN keypair JSON file (for private storage)
  --output <file>   Save codes to file (optional)
  --help            Show this help

Examples:
  npx ts-node src/tools/generate-codes.ts my-album --count 10
  npx ts-node src/tools/generate-codes.ts my-album --count 50 --downloads 3 --output codes.txt
  npx ts-node src/tools/generate-codes.ts my-album --count 20 --keypair ./gundb-keypair.json
`);
        process.exit(0);
    }

    const releaseSlug = args[0];
    const count = parseInt(args[args.indexOf('--count') + 1] || '10');
    const maxDownloads = parseInt(args[args.indexOf('--downloads') + 1] || '1');
    const expiresInDays = args.includes('--expires')
        ? parseInt(args[args.indexOf('--expires') + 1])
        : undefined;
    const namespace = args[args.indexOf('--namespace') + 1] || 'tunecamp';
    const keypairPath = args.includes('--keypair')
        ? args[args.indexOf('--keypair') + 1]
        : null;
    const outputFile = args.includes('--output')
        ? args[args.indexOf('--output') + 1]
        : null;

    // Load keypair if provided
    let keypair: ZENKeyPair | undefined;
    if (keypairPath) {
        try {
            keypair = loadKeyPair(keypairPath);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`\n❌ Error loading keypair: ${errorMessage}`);
            console.error(`\n💡 Generate a new keypair with:`);
            console.error(`   npx ts-node src/tools/generate-zen-pair.ts`);
            process.exit(1);
        }
    }

    try {
        const codes = await generateCodes({
            releaseSlug,
            count,
            maxDownloads,
            expiresInDays,
            namespace,
            peers: DEFAULT_ZEN_PEERS,
            keypair,
        });

        console.log(`\n✅ Generated ${codes.length} codes:\n`);
        console.log(`${'─'.repeat(50)}`);
        codes.forEach((code, i) => {
            console.log(`  ${(i + 1).toString().padStart(3)}. ${code}`);
        });
        console.log(`${'─'.repeat(50)}`);

        // Save to file if requested
        if (outputFile) {
            const fs = await import('fs');
            const content = [
                `# Unlock Codes for: ${releaseSlug}`,
                `# Generated: ${new Date().toISOString()}`,
                `# Max downloads per code: ${maxDownloads}`,
                expiresInDays ? `# Expires in: ${expiresInDays} days` : '',
                '',
                ...codes,
            ].filter(Boolean).join('\n');

            fs.writeFileSync(outputFile, content);
            console.log(`\n📁 Codes saved to: ${outputFile}`);
        }

        console.log(`\n📋 Instructions for your release.yaml:`);
        console.log(`\n  download: codes`);
        console.log(`  unlockCodes:`);
        console.log(`    enabled: true`);
        console.log(`    namespace: ${namespace}`);
        if (keypair) {
            console.log(`    publicKey: "${keypair.pub}"  # <-- REQUIRED!`);
            console.log(`\n🔒 Codes stored in your private Zen space`);
            console.log(`   Only you can access and manage these codes`);
            console.log(`\n⚠️  IMPORTANT: You MUST add the publicKey to release.yaml!`);
            console.log(`   Without it, the frontend won't find your codes.`);
        } else {
            console.log(`\n⚠️  Codes stored in public space`);
            console.log(`   Consider using --keypair for private storage`);
        }

        process.exit(0);
    } catch (error) {
        console.error('\n❌ Error:', error);
        process.exit(1);
    }
}

main().catch(console.error);
