/**
 * Admin Task Status Routes
 * 
 * Exposes background task status to the admin dashboard.
 */
import { Router } from "express";
import { taskManager } from "../../modules/workers/task-manager.js";

import type { ServiceContainer } from "../../core/container.js";

export function createTaskRoutes(container: ServiceContainer): Router {
    const router = Router();

    /**
     * GET /api/admin/tasks
     * Returns all background task statuses (running, completed, failed).
     */
    router.get("/", (_req, res) => {
        res.json(taskManager.getAllStatuses());
    });

    /**
     * GET /api/admin/tasks/running
     * Returns only currently running tasks.
     */
    router.get("/running", (_req, res) => {
        res.json(taskManager.getRunningTasks());
    });

    /**
     * GET /api/admin/tasks/:taskId
     * Returns the status of a specific task.
     */
    router.get("/:taskId", (req, res) => {
        const status = taskManager.getStatus(req.params.taskId);
        if (!status) return res.status(404).json({ error: "Task not found" });
        res.json(status);
    });

    return router;
}
