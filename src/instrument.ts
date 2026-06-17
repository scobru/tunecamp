/**
 * Sentry crash reporting — opt-in via SENTRY_DSN.
 *
 * Must be the first import of the entry point so Sentry is initialized
 * before any other module runs. When SENTRY_DSN is unset (the default),
 * this is a no-op and the SDK never sends anything.
 */
import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
    Sentry.init({
        dsn,
        environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
        release: process.env.TUNECAMP_GIT_SHA || undefined,
        // Crash reporting only — tracing stays off unless explicitly enabled.
        tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
        integrations: [
            // The server registers its own uncaughtException handlers
            // (index.ts decides fatal vs non-fatal); Sentry must only
            // capture, never exit the process on its own.
            Sentry.onUncaughtExceptionIntegration({ exitEvenIfOtherHandlersAreRegistered: false }),
        ],
    });
    console.log("📟 Sentry crash reporting enabled");
}

const sentryEnabled = Boolean(dsn);
