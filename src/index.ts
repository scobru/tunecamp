#!/usr/bin/env node

/**
 * Tunecamp Server Entry Point
 * Consistently loads configuration and starts the streaming server.
 */

import { loadConfig } from './server/core/config.js';
import { startServer } from './server/server.js';

process.on('uncaughtException', (err: any) => {
    if (err.message && (
        err.message.includes('GunDB') ||
        err.message.includes('ECONNREFUSED') ||
        err.message.includes('ETIMEDOUT') ||
        err.message.includes('socket hang up') ||
        err.message.includes('non-101 status code') ||
        err.message.includes('network error') ||
        err.message.includes('fetch failed')
    )) {
        console.warn('⚠️ Non-fatal exception caught, staying alive...');
        return;
    }

  console.error('\n🚨 FATAL UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n🚨 FATAL UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

async function main() {
  try {
    const config = loadConfig();
    
    console.log('🎶 Starting Tunecamp Server...');
    console.log(`📡 Port: ${config.port}`);
    console.log(`📂 Music Directory: ${config.musicDir}`);
    console.log(`🗄️  Database Path: ${config.dbPath}`);
    console.log('');

    await startServer(config);
  } catch (error) {
    console.error('❌ Error starting Tunecamp:', error);
    process.exit(1);
  }
}

main();
