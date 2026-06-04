import { describe, test, expect } from '@jest/globals';
import { taskManager } from '../task-manager.js';

// The taskManager is a shared singleton, so every test uses a unique task id
// to stay isolated from the others.
let counter = 0;
const uid = (label: string) => `test-${label}-${Date.now()}-${counter++}`;

function deferred<T = void>() {
    let resolve!: (v: T) => void;
    let reject!: (e: any) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

describe('TaskManager', () => {
    test('run() starts a task and reports it as running', () => {
        const id = uid('run');
        const d = deferred();
        const started = taskManager.run(id, () => d.promise);
        expect(started).toBe(true);
        expect(taskManager.isRunning(id)).toBe(true);
        expect(taskManager.getStatus(id)?.status).toBe('running');
        d.resolve();
    });

    test('rejects a duplicate run while the task is still running', () => {
        const id = uid('dup');
        const d = deferred();
        expect(taskManager.run(id, () => d.promise)).toBe(true);
        expect(taskManager.run(id, () => d.promise)).toBe(false);
        d.resolve();
    });

    test('marks a task completed and stores its result', async () => {
        const id = uid('done');
        const d = deferred<string>();
        taskManager.run(id, () => d.promise);
        d.resolve('payload');
        // allow the .then() handler to run
        await new Promise(r => setImmediate(r));
        const status = taskManager.getStatus(id);
        expect(status?.status).toBe('completed');
        expect(status?.result).toBe('payload');
        expect(status?.completedAt).toBeInstanceOf(Date);
        expect(taskManager.isRunning(id)).toBe(false);
    });

    test('marks a task failed and records the error message', async () => {
        const id = uid('fail');
        const d = deferred();
        taskManager.run(id, () => d.promise);
        d.reject(new Error('kaboom'));
        await new Promise(r => setImmediate(r));
        const status = taskManager.getStatus(id);
        expect(status?.status).toBe('failed');
        expect(status?.error).toBe('kaboom');
    });

    test('allows re-running a task once it has completed', async () => {
        const id = uid('rerun');
        const d1 = deferred();
        taskManager.run(id, () => d1.promise);
        d1.resolve();
        await new Promise(r => setImmediate(r));

        const d2 = deferred();
        expect(taskManager.run(id, () => d2.promise)).toBe(true);
        expect(taskManager.isRunning(id)).toBe(true);
        d2.resolve();
    });

    test('updateProgress records progress only for running tasks', () => {
        const id = uid('progress');
        const d = deferred();
        taskManager.run(id, () => d.promise);
        taskManager.updateProgress(id, 3, 10, 'working');
        expect(taskManager.getStatus(id)?.progress).toEqual({ current: 3, total: 10, message: 'working' });
        d.resolve();
    });

    test('getStatus returns null for an unknown task', () => {
        expect(taskManager.getStatus(uid('unknown'))).toBeNull();
    });

    test('getRunningTasks includes only running tasks', () => {
        const id = uid('running-filter');
        const d = deferred();
        taskManager.run(id, () => d.promise);
        const ids = taskManager.getRunningTasks().map(t => t.taskId);
        expect(ids).toContain(id);
        d.resolve();
    });

    test('getStatus never leaks the internal promise', () => {
        const id = uid('no-promise');
        const d = deferred();
        taskManager.run(id, () => d.promise);
        expect(taskManager.getStatus(id)).not.toHaveProperty('promise');
        d.resolve();
    });
});
