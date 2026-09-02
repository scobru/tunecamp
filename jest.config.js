/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
	preset: "ts-jest/presets/default-esm", // or other ESM presets
	testEnvironment: "node",
	// Only search src/ — webapp tests are vitest, and slash-based ignore
	// patterns don't match Windows backslash paths.
	roots: ["<rootDir>/src"],
	// Allow Jest to transform ESM-only packages from node_modules (e.g. node-fetch v3+,
	// @fedify/fedify's transitive ESM-only deps, and d3-* packages which ship
	// "type": "module" with no CJS build).
	transformIgnorePatterns: [
		"/node_modules/(?!(fid|node-fetch|webtorrent|@fedify|structured-field-values|url-template|uri-template-router|urlpattern-polyfill|es-toolkit|byte-encodings|multicodec|@multiformats|json-canon|p-limit|yocto-queue|d3-array|d3-scale|d3-shape|d3-path|d3-color|d3-interpolate|d3-format|d3-time|d3-time-format|@akaoio)/)",
	],
	// Resolve `./foo.js` -> `./foo.ts` at the resolver level (see jest.resolver.cjs)
	// so jest.unstable_mockModule and real imports agree on the same absolute path.
	resolver: "<rootDir>/jest.resolver.cjs",
	moduleNameMapper: {
		"^music-metadata$": "<rootDir>/__mocks__/music-metadata.ts",
		"^chokidar$": "<rootDir>/__mocks__/chokidar.ts",
		"^node-fetch$": "<rootDir>/__mocks__/node-fetch.ts",
		"^disconnect$": "<rootDir>/__mocks__/disconnect.ts",
		"^fluent-ffmpeg$": "<rootDir>/__mocks__/fluent-ffmpeg.ts",
		"^stripe$": "<rootDir>/__mocks__/stripe.ts",
		"^ethers$": "<rootDir>/__mocks__/ethers.ts",
		"^fid$": "<rootDir>/__mocks__/fid.ts",
		"^telegraf$": "<rootDir>/__mocks__/telegraf.ts",
		"^(.*[/\\\\]workers[/\\\\]worker-pool)\\.js$":
			"<rootDir>/__mocks__/worker-pool.ts",
	},
	transform: {
		"^.+\\.tsx?$": [
			"ts-jest",
			{
				useESM: true,
				// Skip TS type-checking in tests (import.meta, top-level await, etc. are valid at runtime)
				diagnostics: false,
			},
		],
		// @fedify/fedify's .cjs bundle requires structured-field-values, which ships
		// as ESM-only .js with no CJS build — let ts-jest transpile it too.
		"^.+\\.jsx?$": [
			"ts-jest",
			{
				useESM: true,
				isolatedModules: true,
				diagnostics: false,
			},
		],
	},
	extensionsToTreatAsEsm: [".ts"],
};
