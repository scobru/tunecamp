import { jest, describe, test, expect, beforeEach } from "@jest/globals";
import express from "express";
import request from "supertest";
import { createAiRoutes } from "../ai.js";
import { UserRole } from "../../../common/visibility.js";

describe("AI Assistant Routes", () => {
	let app: express.Express;
	let mockAssistant: any;
	let mockOpenRouter: any;
	let currentUser: any;

	beforeEach(() => {
		jest.clearAllMocks();
		currentUser = {
			userId: 1,
			username: "admin",
			role: UserRole.ROOT_ADMIN,
			isAdmin: true,
			isRootAdmin: true,
			context: { userId: 1, role: UserRole.ROOT_ADMIN, isActive: true }
		};

		mockAssistant = {
			canUseAssistant: jest.fn((caller: any) => caller.isAdmin || caller.context?.isActive),
			chat: jest.fn<any>().mockResolvedValue({ reply: "Done", toolTrace: [] }),
			applyProposal: jest.fn<any>().mockResolvedValue({ applied: 1, failed: 0, errors: [], results: [] })
		};

		mockOpenRouter = {
			isEnabled: jest.fn().mockReturnValue(true),
			getModel: jest.fn().mockReturnValue("google/gemini-2.5-flash")
		};

		app = express();
		app.use((req: any, _res, next) => {
			Object.assign(req, currentUser);
			next();
		});
		app.use("/api/ai", createAiRoutes({
			assistantService: mockAssistant,
			openRouterService: mockOpenRouter
		} as any));
	});

	test("GET /api/ai/status returns configured status and model", async () => {
		const res = await request(app).get("/api/ai/status");
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ configured: true, model: "google/gemini-2.5-flash" });
	});

	test("POST /api/ai/chat denies unauthorized callers", async () => {
		currentUser = {
			userId: 99,
			role: UserRole.GUEST,
			isAdmin: false,
			context: { userId: 99, role: UserRole.GUEST, isActive: false }
		};

		const res = await request(app).post("/api/ai/chat").send({
			messages: [{ role: "user", content: "Hello" }]
		});
		expect(res.status).toBe(403);
	});

	test("POST /api/ai/chat validates messages array", async () => {
		const res = await request(app).post("/api/ai/chat").send({ messages: [] });
		expect(res.status).toBe(400);
	});

	test("POST /api/ai/chat returns assistant response", async () => {
		const res = await request(app).post("/api/ai/chat").send({
			messages: [{ role: "user", content: "Check album" }],
			context: { albumId: 5 }
		});
		expect(res.status).toBe(200);
		expect(res.body.reply).toBe("Done");
		expect(mockAssistant.chat).toHaveBeenCalledWith(
			[{ role: "user", content: "Check album" }],
			expect.objectContaining({ userId: 1, isAdmin: true }),
			{ albumId: 5 }
		);
	});

	test("POST /api/ai/chat exposes toolUseUnsupported flag on 400", async () => {
		const err: any = new Error("Model does not support tool calling");
		err.toolUseUnsupported = true;
		mockAssistant.chat.mockRejectedValueOnce(err);

		const res = await request(app).post("/api/ai/chat").send({
			messages: [{ role: "user", content: "Check album" }]
		});
		expect(res.status).toBe(400);
		expect(res.body.toolUseUnsupported).toBe(true);
	});

	test("POST /api/ai/apply validates proposalId and delegates", async () => {
		const bad = await request(app).post("/api/ai/apply").send({});
		expect(bad.status).toBe(400);

		const ok = await request(app).post("/api/ai/apply").send({
			proposalId: "prop-1",
			actionIds: ["act-1"]
		});
		expect(ok.status).toBe(200);
		expect(ok.body.applied).toBe(1);
		expect(mockAssistant.applyProposal).toHaveBeenCalledWith(
			"prop-1",
			["act-1"],
			expect.objectContaining({ userId: 1 })
		);
	});
});
