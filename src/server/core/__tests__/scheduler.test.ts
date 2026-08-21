import { describe, test, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { scheduleOnce, scheduleRecurring } from "../scheduler.js";

describe("Scheduler", () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	// ── scheduleOnce ────────────────────────────────────────────────────────

	describe("scheduleOnce", () => {
		test("executes task after specified delay", () => {
			const task = jest.fn();
			scheduleOnce(task, 1000);

			expect(task).not.toHaveBeenCalled();

			jest.advanceTimersByTime(999);
			expect(task).not.toHaveBeenCalled();

			jest.advanceTimersByTime(1);
			expect(task).toHaveBeenCalledTimes(1);
		});

		test("cancel prevents execution if called before delay", () => {
			const task = jest.fn();
			const handle = scheduleOnce(task, 1000);

			jest.advanceTimersByTime(500);
			handle.cancel();

			jest.advanceTimersByTime(1000);
			expect(task).not.toHaveBeenCalled();
		});
	});

	// ── scheduleRecurring ───────────────────────────────────────────────────

	describe("scheduleRecurring", () => {
		test("executes recurring task on specified interval after initial delay", () => {
			const task = jest.fn();
			scheduleRecurring(task, { intervalMs: 2000, initialDelayMs: 500 });

			expect(task).not.toHaveBeenCalled();

			// Initial delay
			jest.advanceTimersByTime(500);
			expect(task).toHaveBeenCalledTimes(1);

			// First interval
			jest.advanceTimersByTime(2000);
			expect(task).toHaveBeenCalledTimes(2);

			// Second interval
			jest.advanceTimersByTime(2000);
			expect(task).toHaveBeenCalledTimes(3);
		});

		test("cancel stops recurring task", () => {
			const task = jest.fn();
			const handle = scheduleRecurring(task, { intervalMs: 1000, initialDelayMs: 0 });

			jest.advanceTimersByTime(0);
			expect(task).toHaveBeenCalledTimes(1);

			jest.advanceTimersByTime(1000);
			expect(task).toHaveBeenCalledTimes(2);

			handle.cancel();

			jest.advanceTimersByTime(5000);
			expect(task).toHaveBeenCalledTimes(2);
		});
	});
});
