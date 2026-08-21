import express from "express";
import request from "supertest";
import { describe, test, expect, beforeEach, jest } from "@jest/globals";
import { createTaskRoutes } from "../tasks.js";
import { taskManager } from "../../../modules/workers/task-manager.js";

describe("Admin Tasks Routes", () => {
	let app: express.Express;

	beforeEach(() => {
		app = express();
		app.use("/api/admin/tasks", createTaskRoutes({} as any));
	});

	test("GET /api/admin/tasks returns array of statuses", async () => {
		const res = await request(app).get("/api/admin/tasks");
		expect(res.status).toBe(200);
		expect(Array.isArray(res.body)).toBe(true);
	});

	test("GET /api/admin/tasks/running returns array of running tasks", async () => {
		const res = await request(app).get("/api/admin/tasks/running");
		expect(res.status).toBe(200);
		expect(Array.isArray(res.body)).toBe(true);
	});

	test("GET /api/admin/tasks/:taskId returns 404 for unknown task", async () => {
		const res = await request(app).get("/api/admin/tasks/nonexistent-task-123");
		expect(res.status).toBe(404);
		expect(res.body.error).toBe("Task not found");
	});

	test("GET /api/admin/tasks/:taskId returns task info for existing task", async () => {
		// Run a mock task
		taskManager.run("test-task-1", async () => "result");

		const res = await request(app).get("/api/admin/tasks/test-task-1");
		expect(res.status).toBe(200);
		expect(res.body.taskId).toBe("test-task-1");
		expect(res.body.status).toBeDefined();
	});
});
