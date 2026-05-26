/**
 * TaskManager — Centralized background task management for TuneCamp.
 * 
 * Prevents duplicate execution of heavy background tasks (scan, audit, tag-sync, etc.),
 * tracks their status, and exposes a simple API for the frontend to monitor progress.
 * 
 * Zero external dependencies — pure Node.js.
 */

export type TaskStatus = 'running' | 'completed' | 'failed';

export interface TaskEntry {
    taskId: string;
    status: TaskStatus;
    startedAt: Date;
    completedAt: Date | null;
    error: string | null;
    result: any;
}

export class TaskManager {
    private tasks = new Map<string, TaskEntry & { promise: Promise<any> }>();

    /** Max completed/failed tasks to keep in history */
    private readonly MAX_HISTORY = 50;

    /**
     * Run a named task. Returns false if the task is already running.
     * The function `fn` runs in the background; the caller gets an immediate answer.
     */
    run(taskId: string, fn: () => Promise<any>): boolean {
        const existing = this.tasks.get(taskId);
        if (existing?.status === 'running') {
            return false; // Already running, reject duplicate
        }

        const entry: TaskEntry & { promise: Promise<any> } = {
            taskId,
            status: 'running',
            startedAt: new Date(),
            completedAt: null,
            error: null,
            result: null,
            promise: Promise.resolve(), // placeholder, replaced below
        };

        entry.promise = fn()
            .then((result) => {
                entry.status = 'completed';
                entry.completedAt = new Date();
                entry.result = result ?? null;
                console.log(`✅ [TaskManager] Task "${taskId}" completed in ${this.elapsed(entry)}s`);
            })
            .catch((err) => {
                entry.status = 'failed';
                entry.completedAt = new Date();
                entry.error = err?.message || String(err);
                console.error(`❌ [TaskManager] Task "${taskId}" failed after ${this.elapsed(entry)}s:`, entry.error);
            });

        this.tasks.set(taskId, entry);
        this.pruneHistory();
        console.log(`🚀 [TaskManager] Task "${taskId}" started`);
        return true;
    }

    /**
     * Check if a specific task is currently running.
     */
    isRunning(taskId: string): boolean {
        return this.tasks.get(taskId)?.status === 'running';
    }

    /**
     * Get the status of a specific task, or null if unknown.
     */
    getStatus(taskId: string): TaskEntry | null {
        const entry = this.tasks.get(taskId);
        if (!entry) return null;
        const { promise, ...rest } = entry;
        return rest;
    }

    /**
     * Get all task statuses (for the admin dashboard).
     */
    getAllStatuses(): TaskEntry[] {
        return Array.from(this.tasks.values()).map(({ promise, ...rest }) => rest);
    }

    /**
     * Get only currently running tasks.
     */
    getRunningTasks(): TaskEntry[] {
        return this.getAllStatuses().filter(t => t.status === 'running');
    }

    private elapsed(entry: TaskEntry): string {
        const end = entry.completedAt || new Date();
        return ((end.getTime() - entry.startedAt.getTime()) / 1000).toFixed(1);
    }

    private pruneHistory(): void {
        const entries = Array.from(this.tasks.entries());
        const completed = entries.filter(([, e]) => e.status !== 'running');
        if (completed.length > this.MAX_HISTORY) {
            // Remove oldest completed/failed tasks
            completed
                .sort((a, b) => a[1].startedAt.getTime() - b[1].startedAt.getTime())
                .slice(0, completed.length - this.MAX_HISTORY)
                .forEach(([key]) => this.tasks.delete(key));
        }
    }
}

/** Singleton instance shared across the server */
export const taskManager = new TaskManager();
