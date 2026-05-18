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
