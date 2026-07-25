import http from "http";
import { isNonFatalError } from "./common/errors.js";
import type { ServerConfig } from "./core/config.js";
import { createApp, setupStaticAndFallbackRoutes } from "./app.js";
import { bootstrapServices } from "./services.js";
import { registerRoutes } from "./routes.js";
import { scheduleOnce } from "./core/scheduler.js";

// Global crash protection for async modules
process.on('uncaughtException', (err: any) => {
    console.error('🌊 SEVERE: Uncaught Exception:', err);
    if (isNonFatalError(err)) {
        console.warn('⚠️ Non-fatal exception caught, staying alive...');
        return;
    }

    console.warn('⚠️ Attempting to continue despite uncaught exception...');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🌊 SEVERE: Unhandled Rejection at:', promise, 'reason:', reason);
});

export async function startServer(config: ServerConfig): Promise<void> {
    const { app } = createApp(config);
    const server = http.createServer(app);

    // Bootstrap database, services, and containers
    const {
        container,
        database,
        federation,
        publishingService,
        peerService,
        telegramBotService,
        radioService,
        pluginCleanups,
        jobHandles,
        gdriveService
    } = await bootstrapServices(config);

    // Register API & Subsonic & Fedify routes
    registerRoutes(app, server, container, federation, !!gdriveService);

    // Static assets, OpenGraph meta injection, SPA fallback & Error handlers
    setupStaticAndFallbackRoutes(app, config, database);

    server.listen(config.port, async () => {
        console.log(`🎶 TuneCamp Server running at http://localhost:${config.port}`);
        server.keepAliveTimeout = 300000;
        server.headersTimeout = 301000;

        // Async Background integrations start after the HTTP server is bound!
        telegramBotService.start().catch((err: any) => console.error("Telegram Bot failed to start:", err));
        radioService.resumeIfActive().catch((err: any) => console.error("Radio resume failed:", err));

        const dbPublicUrl = database.getSetting("publicUrl");
        const publicUrl = (dbPublicUrl || config.publicUrl || "").trim().replace(/\/$/, "");

        if (publicUrl) {
            // Auto-follow discovered community instances over ActivityPub. Runs
            // after the first federated crawl (~45s) so the directory is populated.
            jobHandles.push(scheduleOnce(async () => { await publishingService.syncCommunityFollows().catch(() => {}); }, 90000));
        }
    });

    const gracefulShutdown = async (signal: string) => {
        console.log(`\n🛑 [${signal}] Graceful shutdown initiated...`);
        const timeout = setTimeout(() => {
            console.error('⏰ Shutdown timed out after 15s, forcing exit.');
            process.exit(1);
        }, 15000);

        try {
            // 1. Stop accepting new connections
            await new Promise<void>((resolve) => server.close(() => resolve()));
            console.log('  ✓ HTTP server closed');
        } catch (e) { console.warn('  ⚠ HTTP server close error:', e); }

        try { telegramBotService.stop(); console.log('  ✓ Telegram bot stopped'); }
        catch (e) { console.warn('  ⚠ Telegram stop error:', e); }

        try { pluginCleanups.forEach(c => c()); console.log('  ✓ Plugins disconnected'); }
        catch (e) { console.warn('  ⚠ Plugin disconnect error:', e); }

        try { peerService.stopHeartbeat(); console.log('  ✓ PeerService heartbeat stopped'); }
        catch (e) { console.warn('  ⚠ PeerService stop error:', e); }

        try { jobHandles.forEach(h => h.cancel()); console.log('  ✓ Scheduled jobs stopped'); }
        catch (e) { console.warn('  ⚠ Job cleanup error:', e); }

        try { database.db.close(); console.log('  ✓ Database closed'); }
        catch (e) { console.warn('  ⚠ Database close error:', e); }

        clearTimeout(timeout);
        console.log('👋 Shutdown complete.');
        process.exit(0);
    };

    process.on("SIGINT", () => gracefulShutdown('SIGINT'));
    process.on("SIGTERM", () => gracefulShutdown('SIGTERM'));
}

export async function stopServer(): Promise<void> {
    // Graceful shutdown is handled by SIGINT/SIGTERM handlers inside startServer.
    // This export remains for API compatibility.
}
