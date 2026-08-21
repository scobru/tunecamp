import { describe, test, expect } from "@jest/globals";
import { workerPool } from "../worker-pool.js";

describe("WorkerPool", () => {
	test("workerPool singleton is instantiated with 0 running and pending tasks", () => {
		expect(workerPool).toBeDefined();
		expect(workerPool.pendingTasks).toBe(0);
		expect(workerPool.runningTasks).toBe(0);
	});
});
