import { describe, test, expect } from "@jest/globals";
import { resolveService, type ServiceContainer } from "../container.js";

describe("ServiceContainer", () => {
	test("resolveService returns explicitly provided service from container", () => {
		const mockAuthService: any = { login: () => {} };
		const container: any = {
			authService: mockAuthService,
			database: {},
		};

		const resolved = resolveService(container, "authService");
		expect(resolved).toBe(mockAuthService);
	});

	test("resolveService falls back to database service property if absent on top-level", () => {
		const mockIdentity: any = { getUser: () => {} };
		const container: any = {
			database: {
				identity: mockIdentity,
			},
		};

		const resolved = resolveService(container, "identity");
		expect(resolved).toBe(mockIdentity);
	});

	test("resolveService returns undefined for optional services if not present", () => {
		const container: any = {
			database: { someOtherProp: true },
		};

		expect(resolveService(container, "ytdlpService" as any)).toBeUndefined();
		expect(resolveService(container, "torrentService" as any)).toBeUndefined();
		expect(resolveService(container, "gdriveService" as any)).toBeUndefined();
	});

	test("resolveService falls back to container.database if service is not found", () => {
		const mockDb: any = { query: () => {} };
		const container: any = {
			database: mockDb,
		};

		const resolved = resolveService(container, "scanner" as any);
		expect(resolved).toBe(mockDb);
	});
});
