import { describe, test, expect, jest, beforeEach } from "@jest/globals";
import {
	ProviderRegistry,
	syncRegistryWithDatabase,
	USER_AGENT,
	type TuneCampProvider,
} from "../provider.js";

describe("Provider Framework & Registry", () => {
	let registry: ProviderRegistry<TuneCampProvider>;

	interface TestProvider extends TuneCampProvider {
		customMethod?: () => string;
	}

	beforeEach(() => {
		registry = new ProviderRegistry<TestProvider>();
	});

	test("USER_AGENT constant is defined", () => {
		expect(USER_AGENT).toContain("TuneCamp");
	});

	test("register and get provider", () => {
		const provider: TestProvider = {
			id: "test-meta",
			name: "Test Metadata",
			version: "1.0.0",
			description: "A provider for testing",
		};

		registry.register(provider, true);

		expect(registry.get("test-meta")).toBe(provider);
		expect(registry.isEnabled("test-meta")).toBe(true);
		expect(registry.getAll()).toHaveLength(1);
		expect(registry.getEnabled()).toHaveLength(1);
	});

	test("register with defaultEnabled=false", () => {
		const provider: TestProvider = {
			id: "disabled-prov",
			name: "Disabled Provider",
			version: "1.0.0",
		};

		registry.register(provider, false);

		expect(registry.isEnabled("disabled-prov")).toBe(false);
		expect(registry.getAll()).toHaveLength(1);
		expect(registry.getEnabled()).toHaveLength(0);
	});

	test("unregister removes provider from registry", () => {
		const provider: TestProvider = {
			id: "temp-prov",
			name: "Temp Provider",
			version: "1.0.0",
		};

		registry.register(provider);
		expect(registry.get("temp-prov")).toBeDefined();

		registry.unregister("temp-prov");
		expect(registry.get("temp-prov")).toBeUndefined();
	});

	test("enable and disable trigger onEnable and onDisable lifecycle hooks", async () => {
		const onEnableSpy = jest.fn().mockImplementation(async () => {});
		const onDisableSpy = jest.fn().mockImplementation(async () => {});

		const provider: TestProvider = {
			id: "lifecycle-prov",
			name: "Lifecycle Provider",
			version: "1.0.0",
			onEnable: onEnableSpy,
			onDisable: onDisableSpy,
		};

		registry.register(provider, false);
		expect(registry.isEnabled("lifecycle-prov")).toBe(false);

		// Enable
		await registry.enable("lifecycle-prov");
		expect(registry.isEnabled("lifecycle-prov")).toBe(true);
		expect(onEnableSpy).toHaveBeenCalledTimes(1);

		// Disable
		await registry.disable("lifecycle-prov");
		expect(registry.isEnabled("lifecycle-prov")).toBe(false);
		expect(onDisableSpy).toHaveBeenCalledTimes(1);
	});

	test("getRegistryInfo returns metadata, configSchema and enable status", () => {
		const provider: TestProvider = {
			id: "info-prov",
			name: "Info Provider",
			version: "2.0.0",
			description: "Detailed description",
			configSchema: [
				{ key: "api_key", label: "API Key", type: "password" },
			],
		};

		registry.register(provider, true);

		const info = registry.getRegistryInfo();
		expect(info).toEqual([
			{
				id: "info-prov",
				name: "Info Provider",
				version: "2.0.0",
				enabled: true,
				description: "Detailed description",
				configSchema: [
					{ key: "api_key", label: "API Key", type: "password" },
				],
			},
		]);
	});

	test("syncRegistryWithDatabase applies persisted plugin states", async () => {
		const provA: TestProvider = { id: "prov-a", name: "A", version: "1.0" };
		const provB: TestProvider = { id: "prov-b", name: "B", version: "1.0" };

		registry.register(provA, true);
		registry.register(provB, true);

		const mockDb = {
			getAllPluginsState: () => [
				{ id: "prov-a", enabled: 0 },
				{ id: "prov-b", enabled: 1 },
			],
		};

		await syncRegistryWithDatabase(registry, mockDb);

		expect(registry.isEnabled("prov-a")).toBe(false);
		expect(registry.isEnabled("prov-b")).toBe(true);
	});
});
