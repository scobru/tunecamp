/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest/presets/default-esm', // or other ESM presets
  testEnvironment: 'node',
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/webapp/',
    '<rootDir>/website/',
    '<rootDir>/.claude/'
  ],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^music-metadata$': '<rootDir>/__mocks__/music-metadata.ts',
    '^chokidar$': '<rootDir>/__mocks__/chokidar.ts'
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
    }],
  },
  extensionsToTreatAsEsm: ['.ts'],
};

