import { Router, json, Request, Response } from 'express';
import type { ServiceContainer } from '../../core/container.js';
import type { AuthenticatedRequest } from '../../middleware/auth.js';
import { wrapAsync } from '../../middleware/error-handling.js';

export function createChatRoutes(container: ServiceContainer): Router {
    const chatService = container.chatService;
    const authMiddleware = container.authMiddleware;
    const router = Router();
    router.use(json());

    /**
     * GET /api/chat/history
     * Get the recent chat history
     */
    router.get('/history', wrapAsync(async (req: Request, res: Response) => {
        const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
        const history = chatService.getHistory(isNaN(limit) ? 100 : limit);
        res.json(history);
    }));

    /**
     * POST /api/chat/messages
     * Send a new chat message (requires authentication)
     */
    router.post('/messages', authMiddleware.requireUser, wrapAsync(async (req: AuthenticatedRequest, res: Response) => {
        const { message } = req.body;

        if (!message || typeof message !== 'string' || !message.trim()) {
            return res.status(400).json({ error: 'Message content is required' });
        }

        if (message.length > 500) {
            return res.status(400).json({ error: 'Message too long (max 500 characters)' });
        }

        const username = req.username || 'Listener';
        const role = req.role || 'user';

        const savedMessage = chatService.addMessage(
            username,
            role,
            message.trim(),
            'webapp'
        );

        if (!savedMessage) {
            return res.status(500).json({ error: 'Failed to send message' });
        }

        res.json(savedMessage);
    }));

    /**
     * DELETE /api/chat/messages/:id
     * Delete a chat message (requires authentication and either ownership or admin role)
     */
    router.delete('/messages/:id', authMiddleware.requireUser, wrapAsync(async (req: AuthenticatedRequest, res: Response) => {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
            return res.status(400).json({ error: 'Invalid message ID' });
        }

        const msg = chatService.getMessage(id);
        if (!msg) {
            return res.status(404).json({ error: 'Message not found' });
        }

        const isAdmin = req.role === 'admin' || req.role === 'root_admin' || req.role === 'super_user';
        const isOwner = req.username === msg.username;

        if (!isAdmin && !isOwner) {
            return res.status(403).json({ error: 'You are not authorized to delete this message' });
        }

        const success = chatService.deleteMessage(id);
        if (!success) {
            return res.status(500).json({ error: 'Failed to delete message' });
        }

        res.json({ success: true });
    }));

    /**
     * GET /api/chat/stream
     * Server-Sent Events stream for real-time chat messages
     */
    router.get('/stream', wrapAsync(async (req: Request, res: Response) => {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        });

        // Send a ping to keep-alive
        res.write('comment: connected\n\n');
        if (typeof (res as any).flush === 'function') {
            (res as any).flush();
        }

        const onMessage = (msg: any) => {
            res.write(`data: ${JSON.stringify(msg)}\n\n`);
            if (typeof (res as any).flush === 'function') {
                (res as any).flush();
            }
        };

        chatService.events.on('message', onMessage);

        req.on('close', () => {
            chatService.events.off('message', onMessage);
        });
    }));

    return router;
}
