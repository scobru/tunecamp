import express from 'express';
import request from 'supertest';
import { errorHandler } from './middleware/error-handling.js';
import { jest } from '@jest/globals';

// Mock other dependencies of server.ts if necessary,
// but since we only import globalErrorHandler, and it doesn't depend on other things, we might be fine.
// However, `server.ts` imports a lot of things at the top level.
// We need to be careful about side effects of importing `server.ts`.
// Ideally we would move `globalErrorHandler` to a separate file `middleware/error.ts`,
// but for now I will try to import it.
// If it fails due to top-level code execution in server.ts (e.g. fileURLToPath), I'll handle it.

describe('Global Error Handler', () => {
    let app: express.Express;
    const originalEnv = process.env.NODE_ENV;

    beforeEach(() => {
        // Reset NODE_ENV for each test
        process.env.NODE_ENV = originalEnv;

        app = express();

        // Simulate a route that throws a sensitive error
        app.get('/error', (req, res, next) => {
            const error = new Error("Database connection failed: user=postgres password=secret host=10.0.0.1");
            next(error);
        });

        // Use the actual handler
        app.use(errorHandler);
    });

    afterAll(() => {
        process.env.NODE_ENV = originalEnv;
    });

    test('should NOT leak sensitive error details in production', async () => {
        process.env.NODE_ENV = 'production';
        const response = await request(app).get('/error');

        expect(response.status).toBe(500);
        expect(response.body.error).toBe("Internal Server Error");
    });

    test('should show error details in development', async () => {
        process.env.NODE_ENV = 'development';
        const response = await request(app).get('/error');

        expect(response.status).toBe(500);
        expect(response.body.error).toContain("password=secret");
    });
});
