import { Router, json } from "express";
import type { ServiceContainer } from "../../core/container.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import type { AssistantCaller } from "../../modules/ai/assistant.service.js";
import { UserRole } from "../../common/visibility.js";

function toCaller(req: AuthenticatedRequest): AssistantCaller {
    return {
        userId: req.userId ?? 0,
        username: req.username,
        artistId: req.artistId,
        role: req.role,
        isAdmin: Boolean(
            req.isAdmin ||
            req.isRootAdmin ||
            req.isSuperUser ||
            req.role === UserRole.ROOT_ADMIN ||
            req.role === UserRole.ADMIN ||
            req.role === UserRole.SUPER_USER
        ),
        isRootAdmin: Boolean(req.isRootAdmin || req.role === UserRole.ROOT_ADMIN),
        isSuperUser: Boolean(req.isSuperUser || req.role === UserRole.SUPER_USER),
        context: req.context
    };
}

export function createAiRoutes(container: ServiceContainer): Router {
    const router = Router();
    router.use(json());

    router.get("/status", (req: AuthenticatedRequest, res) => {
        const assistant = container.assistantService;
        const openRouter = container.openRouterService;
        const caller = toCaller(req);
        if (!assistant || !caller.userId || !assistant.canUseAssistant(caller)) {
            return res.status(403).json({ error: "Access denied" });
        }
        return res.json({
            configured: Boolean(openRouter?.isEnabled()),
            model: openRouter?.getModel() || "openrouter/free"
        });
    });

    router.post("/chat", async (req: AuthenticatedRequest, res) => {
        const assistant = container.assistantService;
        if (!assistant) {
            return res.status(503).json({ error: "Assistant service unavailable" });
        }

        const caller = toCaller(req);
        if (!caller.userId || !assistant.canUseAssistant(caller)) {
            return res.status(403).json({ error: "Access denied: AI Assistant requires curator, publisher, or admin permissions" });
        }

        const { messages, context } = req.body ?? {};
        if (!Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ error: "messages array is required" });
        }

        try {
            const result = await assistant.chat(messages, caller, context);
            return res.json(result);
        } catch (err: any) {
            const status = typeof err?.status === "number" ? err.status : (err?.toolUseUnsupported ? 400 : 502);
            return res.status(status).json({
                error: err?.message || "AI assistant request failed",
                toolUseUnsupported: Boolean(err?.toolUseUnsupported)
            });
        }
    });

    router.post("/apply", async (req: AuthenticatedRequest, res) => {
        const assistant = container.assistantService;
        if (!assistant) {
            return res.status(503).json({ error: "Assistant service unavailable" });
        }

        const caller = toCaller(req);
        if (!caller.userId || !assistant.canUseAssistant(caller)) {
            return res.status(403).json({ error: "Access denied: AI Assistant requires curator, publisher, or admin permissions" });
        }

        const { proposalId, actionIds } = req.body ?? {};
        if (typeof proposalId !== "string" || !proposalId.trim()) {
            return res.status(400).json({ error: "proposalId string is required" });
        }
        if (actionIds !== undefined && !Array.isArray(actionIds)) {
            return res.status(400).json({ error: "actionIds must be an array of strings" });
        }

        try {
            const result = await assistant.applyProposal(
                proposalId.trim(),
                actionIds?.map(String),
                caller
            );
            return res.json(result);
        } catch (err: any) {
            const status = typeof err?.status === "number" ? err.status : 500;
            return res.status(status).json({ error: err?.message || "Failed to apply proposal" });
        }
    });

    return router;
}
