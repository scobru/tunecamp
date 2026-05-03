import type { Request, Response, NextFunction } from "express";
import { AppError } from "../common/errors.js";

/**
 * Global error handling middleware.
 * Formats errors consistently for the API.
 */
export const errorHandler = (
    err: any,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    // If headers already sent, delegate to default express error handler
    if (res.headersSent) {
        return next(err);
    }

    const isProduction = process.env.NODE_ENV === "production";

    // Handle AppError (Known domain errors)
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            error: err.message,
            code: err.code,
            statusCode: err.statusCode,
            details: err.details,
            stack: isProduction ? undefined : err.stack
        });
    }

    // Handle JSON parsing errors
    if (err instanceof SyntaxError && 'status' in err && (err as any).status === 400 && 'body' in err) {
        return res.status(400).json({
            error: "Invalid JSON body",
            code: "INVALID_JSON",
            statusCode: 400
        });
    }

    // Default to 500 Internal Server Error
    console.error(`🔥 [Unhandled Error] ${req.method} ${req.url}:`, err);

    res.status(500).json({
        error: isProduction ? "Internal Server Error" : err.message || "Internal Server Error",
        code: "INTERNAL_SERVER_ERROR",
        statusCode: 500,
        stack: isProduction ? undefined : err.stack
    });
};

/**
 * Helper to wrap async route handlers and catch errors.
 */
export const wrapAsync = (fn: Function) => {
    return (req: Request, res: Response, next: NextFunction) => {
        fn(req, res, next).catch(next);
    };
};
