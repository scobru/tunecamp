import { describe, test, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { scheduleRecurring, scheduleOnce } from "../scheduler.js";

describe("scheduler", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test("scheduleRecurring runs after initial delay then on interval", () => {
        const task = jest.fn();
        scheduleRecurring(task, { initialDelayMs: 1000, intervalMs: 500 });

        expect(task).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1000);
        expect(task).toHaveBeenCalledTimes(1);
        jest.advanceTimersByTime(500);
        expect(task).toHaveBeenCalledTimes(2);
    });

    test("scheduleRecurring cancel stops future runs", () => {
        const task = jest.fn();
        const handle = scheduleRecurring(task, { initialDelayMs: 0, intervalMs: 500 });

        jest.advanceTimersByTime(0);
        expect(task).toHaveBeenCalledTimes(1);
        handle.cancel();
        jest.advanceTimersByTime(2000);
        expect(task).toHaveBeenCalledTimes(1);
    });

    test("scheduleOnce runs exactly once and is cancellable", () => {
        const task = jest.fn();
        scheduleOnce(task, 1000);
        jest.advanceTimersByTime(1000);
        expect(task).toHaveBeenCalledTimes(1);

        const task2 = jest.fn();
        const handle = scheduleOnce(task2, 1000);
        handle.cancel();
        jest.advanceTimersByTime(1000);
        expect(task2).not.toHaveBeenCalled();
    });
});
