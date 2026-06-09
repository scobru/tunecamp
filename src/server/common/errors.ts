export abstract class AppError extends Error {
    constructor(
        public message: string,
        public statusCode: number = 500,
        public code?: string,
        public details?: any
    ) {
        super(message);
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}

export class BadRequestError extends AppError {
    constructor(message: string = "Bad Request", code: string = "BAD_REQUEST") {
        super(message, 400, code);
    }
}

export class ForbiddenError extends AppError {
    constructor(message: string = "Forbidden", code: string = "FORBIDDEN") {
        super(message, 403, code);
    }
}

export class NotFoundError extends AppError {
    constructor(message: string = "Resource Not Found", code: string = "NOT_FOUND") {
        super(message, 404, code);
    }
}

export class ServiceUnavailableError extends AppError {
    constructor(message: string = "Service Unavailable", code: string = "SERVICE_UNAVAILABLE") {
        super(message, 503, code);
    }
}

/**
 * Checks if an uncaught exception/error is non-fatal and should not cause the server to crash.
 * This includes network timeouts, temporary SQLite lock/busy errors, and known P2P/GunDB issues.
 */
export function isNonFatalError(err: any): boolean {
    if (!err || !err.message) return false;
    const msg = err.message;
    return (
        msg.includes('GunDB') ||
        msg.includes('Zen') ||
        msg.includes('ECONNREFUSED') ||
        msg.includes('ETIMEDOUT') ||
        msg.includes('socket hang up') ||
        msg.includes('non-101 status code') ||
        msg.includes('network error') ||
        msg.includes('fetch failed') ||
        msg.includes('Unexpected non-whitespace character after JSON') ||
        msg.includes('Unexpected token') ||
        msg.includes('database is busy') ||
        msg.includes('ECONNRESET') ||
        msg.includes('EPIPE') ||
        msg.includes('ENOTFOUND')
    );
}

