/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest/presets/default-esm', // or other ESM presets
  testEnvironment: 'node',
  // Only search src/ — webapp tests are vitest, and slash-based ignore
  // patterns don't match Windows backslash paths.
  roots: ['<rootDir>/src'],
  // Allow Jest to transform ESM-only packages from node_modules (e.g. node-fetch v3+,
  // and @fedify/fedify's transitive ESM-only deps like structured-field-values,
  // url-template, etc. — its .cjs bundle plain-`require()`s them instead of bundling).
  transformIgnorePatterns: [
    '/node_modules/(?!(node-fetch|webtorrent|@fedify|structured-field-values|url-template|uri-template-router|urlpattern-polyfill|es-toolkit|byte-encodings|multicodec|@multiformats|json-canon|p-limit|yocto-queue)/)'
  ],
  // Resolve `./foo.js` -> `./foo.ts` at the resolver level (see jest.resolver.cjs)
  // so jest.unstable_mockModule and real imports agree on the same absolute path.
  resolver: '<rootDir>/jest.resolver.cjs',
  moduleNameMapper: {
    '^music-metadata$': '<rootDir>/__mocks__/music-metadata.ts',
    '^chokidar$': '<rootDir>/__mocks__/chokidar.ts',
    '^node-fetch$': '<rootDir>/__mocks__/node-fetch.ts',
    '^disconnect$': '<rootDir>/__mocks__/disconnect.ts',
    '^fluent-ffmpeg$': '<rootDir>/__mocks__/fluent-ffmpeg.ts',
    '^stripe$': '<rootDir>/__mocks__/stripe.ts',
    '^ethers$': '<rootDir>/__mocks__/ethers.ts',
    '^(.*[/\\\\]workers[/\\\\]worker-pool)\\.js$': '<rootDir>/__mocks__/worker-pool.ts',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      // Skip TS type-checking in tests (import.meta, top-level await, etc. are valid at runtime)
      diagnostics: false,
    }],
    // @fedify/fedify's .cjs bundle requires structured-field-values, which ships
    // as ESM-only .js with no CJS build — let ts-jest transpile it too.
    '^.+\\.jsx?$': ['ts-jest', {
      useESM: true,
      isolatedModules: true,
      diagnostics: false,
    }],
  },
  extensionsToTreatAsEsm: ['.ts'],
};
