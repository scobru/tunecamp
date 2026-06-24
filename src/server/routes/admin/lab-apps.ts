import { Router, json } from "express";
import type { ServiceContainer } from "../../core/container.js";
import { createAuthMiddleware } from "../../middleware/auth.js";

function parseApp(row: any) {
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        src: row.src,
        category: row.category,
        author: row.author,
        sourceUrl: row.source_url,
        permissions: JSON.parse(row.permissions || '[]'),
        sandbox: JSON.parse(row.sandbox || '["allow-scripts"]'),
        allow: JSON.parse(row.allow || '[]'),
        enabled: row.enabled === 1,
        created_at: row.created_at,
    };
}

export function createLabAppsRoutes(container: ServiceContainer): Router {
    const router = Router();
    router.use(json());
    const db = container.database.db;
    const authMiddleware = createAuthMiddleware(container.authService);

    // GET /api/lab-apps — public: only enabled apps
    router.get("/", (_req, res) => {
        const apps = (db.prepare("SELECT * FROM lab_apps WHERE enabled = 1 ORDER BY id").all() as any[]);
        res.json(apps.map(parseApp));
    });

    // GET /api/admin/lab-apps — admin: all apps including disabled
    router.get("/all", authMiddleware.requireRootAdmin, (_req, res) => {
        const apps = (db.prepare("SELECT * FROM lab_apps ORDER BY id").all() as any[]);
        res.json(apps.map(parseApp));
    });

    // POST /api/admin/lab-apps — create
    router.post("/", authMiddleware.requireRootAdmin, (req, res) => {
        const { name, description, src, category, author, sourceUrl, permissions, sandbox, allow } = req.body;
        if (!name || !src) {
            return res.status(400).json({ error: "name and src are required" });
        }
        const result = db.prepare(
            `INSERT INTO lab_apps (name, description, src, category, author, source_url, permissions, sandbox, allow)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
            name,
            description || null,
            src,
            category || 'other',
            author || null,
            sourceUrl || null,
            JSON.stringify(permissions || []),
            JSON.stringify(sandbox || ['allow-scripts']),
            JSON.stringify(allow || [])
        );
        const app = db.prepare("SELECT * FROM lab_apps WHERE id = ?").get(result.lastInsertRowid);
        res.status(201).json(parseApp(app));
    });

    // PUT /api/admin/lab-apps/:id — update
    router.put("/:id", authMiddleware.requireRootAdmin, (req, res) => {
        const id = parseInt(req.params.id, 10);
        const { name, description, src, category, author, sourceUrl, permissions, sandbox, allow, enabled } = req.body;
        if (!name || !src) {
            return res.status(400).json({ error: "name and src are required" });
        }
        db.prepare(
            `UPDATE lab_apps
             SET name=?, description=?, src=?, category=?, author=?, source_url=?, permissions=?, sandbox=?, allow=?, enabled=?
             WHERE id=?`
        ).run(
            name,
            description || null,
            src,
            category || 'other',
            author || null,
            sourceUrl || null,
            JSON.stringify(permissions || []),
            JSON.stringify(sandbox || ['allow-scripts']),
            JSON.stringify(allow || []),
            enabled !== false ? 1 : 0,
            id
        );
        const app = db.prepare("SELECT * FROM lab_apps WHERE id = ?").get(id);
        if (!app) return res.status(404).json({ error: "Lab app not found" });
        res.json(parseApp(app));
    });

    // DELETE /api/admin/lab-apps/:id — delete
    router.delete("/:id", authMiddleware.requireRootAdmin, (req, res) => {
        const id = parseInt(req.params.id, 10);
        db.prepare("DELETE FROM lab_apps WHERE id = ?").run(id);
        res.json({ success: true });
    });

    return router;
}
