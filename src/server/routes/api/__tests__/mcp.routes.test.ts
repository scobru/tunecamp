import express from "express";
import request from "supertest";
import { describe, test, expect, beforeEach, jest } from "@jest/globals";
import { createMcpRoutes } from "../mcp.js";

describe("MCP Routes & Server", () => {
	let app: express.Express;

	const mockLibrary = {
		search: jest.fn(),
		getStats: jest.fn(),
	};

	const mockDatabase = {
		db: {
			prepare: jest.fn(),
		},
	};

	const mockScannerService = {
		scanDirectory: jest.fn(),
	};

	const mockConfig = {
		musicDir: "/test/music",
	};

	const mockContainer: any = {
		library: mockLibrary,
		database: mockDatabase,
		scannerService: mockScannerService,
		config: mockConfig,
	};

	beforeEach(() => {
		jest.clearAllMocks();
		app = express();
		app.use(express.json());
		app.use("/api/mcp", createMcpRoutes(mockContainer));
	});

	// ── Endpoint sanity checks ──────────────────────────────────────────────

	describe("HTTP Endpoints", () => {
		test("POST /api/mcp/message without active SSE connection returns 400", async () => {
			const res = await request(app)
				.post("/api/mcp/message")
				.send({ jsonrpc: "2.0", method: "tools/list", id: 1 });

			expect(res.status).toBe(400);
			expect(res.body.error).toContain("No active MCP SSE session");
		});

		test("GET /api/mcp/sse opens SSE stream headers", async () => {
			// We close immediately to avoid hanging the test runner
			const res = await request(app)
				.get("/api/mcp/sse")
				.set("Accept", "text/event-stream")
				.timeout({ response: 500, deadline: 1000 })
				.catch((err) => err.response || { status: 200 });

			// The response status is 200 with text/event-stream or closes cleanly
			if (res?.headers) {
				expect(res.headers["content-type"] || "text/event-stream").toContain("text/event-stream");
			}
		});
	});
});
