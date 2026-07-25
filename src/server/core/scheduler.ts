export interface JobHandle {
    cancel: () => void;
}

/** Runs `task` once after `initialDelayMs`, then every `intervalMs`. */
export function scheduleRecurring(task: () => void, opts: { intervalMs: number; initialDelayMs?: number }): JobHandle {
    let interval: NodeJS.Timeout | undefined;
    const timeout = setTimeout(() => {
        task();
        interval = setInterval(task, opts.intervalMs);
    }, opts.initialDelayMs ?? 0);
    return {
        cancel: () => {
            clearTimeout(timeout);
            if (interval) clearInterval(interval);
        },
    };
}

/** Runs `task` once after `delayMs`. */
export function scheduleOnce(task: () => void, delayMs: number): JobHandle {
    const timeout = setTimeout(task, delayMs);
    return { cancel: () => clearTimeout(timeout) };
}
