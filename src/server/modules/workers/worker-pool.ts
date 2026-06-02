/**
 * WorkerPool — Manages a pool of worker threads for CPU-intensive operations.
 * 
 * Instead of spawning a new worker for every single file (expensive),
 * this pool reuses a fixed number of workers and queues tasks.
 */
import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve the compiled worker path (dist output)
const WORKER_PATH = path.join(__dirname, 'heavy-task.worker.js');

interface QueuedTask {
    workerData: any;
    resolve: (value: any) => void;
    reject: (err: any) => void;
}

class WorkerPool {
    private queue: QueuedTask[] = [];
    private activeWorkers = 0;
    private readonly maxWorkers: number;

    constructor(maxWorkers = 4) {
        this.maxWorkers = maxWorkers;
    }

    /**
     * Run a task in a worker thread. Returns a promise that resolves with the worker result.
     */
    runTask<T = any>(type: string, filePath: string): Promise<T> {
        return new Promise((resolve, reject) => {
            this.queue.push({
                workerData: { type, filePath },
                resolve,
                reject
            });
            this.processQueue();
        });
    }

    private processQueue(): void {
        while (this.activeWorkers < this.maxWorkers && this.queue.length > 0) {
            const task = this.queue.shift()!;
            this.activeWorkers++;

            const worker = new Worker(WORKER_PATH, {
                workerData: task.workerData
            });

            let completed = false;
            const timeout = setTimeout(() => {
                worker.terminate();
                cleanup();
                task.reject(new Error(`Worker timed out after 30s for: ${task.workerData.filePath}`));
            }, 30000);

            const cleanup = () => {
                if (completed) return;
                completed = true;
                clearTimeout(timeout);
                this.activeWorkers--;
                this.processQueue();
            };

            worker.on('message', (msg) => {
                cleanup();
                if (msg.success) {
                    task.resolve(msg.data ?? msg);
                } else {
                    task.reject(new Error(msg.error || 'Worker task failed'));
                }
            });

            worker.on('error', (err) => {
                cleanup();
                task.reject(err);
            });

            worker.on('exit', (code) => {
                if (!completed) {
                    cleanup();
                    if (code !== 0) {
                        task.reject(new Error(`Worker exited with code ${code}`));
                    } else {
                        task.resolve(null);
                    }
                }
            });
        }
    }

    get pendingTasks(): number {
        return this.queue.length;
    }

    get runningTasks(): number {
        return this.activeWorkers;
    }
}

/** Singleton pool shared across the server */
export const workerPool = new WorkerPool(4);
