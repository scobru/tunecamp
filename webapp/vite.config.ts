import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    nodePolyfills({
      include: ['buffer', 'crypto', 'fs', 'path', 'process', 'util', 'zlib', 'os', 'child_process', 'dgram', 'url', 'events', 'stream'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  resolve: {
    alias: {
      "zen": path.resolve(__dirname, "./src/zen.js"),
      "@": path.resolve(__dirname, "./src"),
      "node:fs/promises": path.resolve(__dirname, "./src/stubs/empty.js"),
      "node:url": "url",
      "node:events": "events",
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-utils': ['axios', 'buffer'],
          'vendor-web3': ['ethers'],
        }
      },
      external: [],
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:1970',
        changeOrigin: true,
      },
      '/music': {
        target: 'http://localhost:1970',
        changeOrigin: true,
      },
    }
  }
})

