/**
 * Custom Jest resolver for the ts-jest ESM setup.
 *
 * TS source uses `import './foo.js'` (NodeNext style) but the file on disk is
 * `./foo.ts`. Historically we mapped this with moduleNameMapper
 * (`^(\\.{1,2}/.*)\\.js$` -> `$1`), but moduleNameMapper rewrites import paths
 * WITHOUT also rewriting the specifier passed to `jest.unstable_mockModule`,
 * so a mocked relative module resolved to a different absolute path than the
 * real import and the mock silently never applied.
 *
 * Resolving `.js` -> `.ts` here, at the resolver level, applies uniformly to
 * both real imports and unstable_mockModule specifiers, so ESM module mocks
 * line up on the same absolute path.
 */
module.exports = (request, options) => {
  const { defaultResolver } = options;

  // Handle file:// URLs produced by pathToFileURL() in plugin-loader.ts.
  // ts-jest compiles dynamic import(url) → require(url) in CJS mode and
  // Jest's resolver can't parse file:// URL strings.  fileURLToPath converts
  // them to OS-native absolute paths (handles Windows drive letters correctly).
  if (request.startsWith('file://')) {
    const { fileURLToPath } = require('url');
    try {
      const absPath = fileURLToPath(request);
      return defaultResolver(absPath, options);
    } catch {
      // fall through
    }
  }

  if (/^\.{1,2}\//.test(request) && request.endsWith('.js')) {
    const tsRequest = request.slice(0, -3) + '.ts';
    try {
      return defaultResolver(tsRequest, options);
    } catch {
      // fall through to default (the .js really exists, e.g. a built asset)
    }
  }
  return defaultResolver(request, options);
};
