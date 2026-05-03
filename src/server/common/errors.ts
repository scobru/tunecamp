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

export class UnauthorizedError extends AppError {
    constructor(message: string = "Unauthorized", code: string = "UNAUTHORIZED") {
        super(message, 401, code);
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

export class ConflictError extends AppError {
    constructor(message: string = "Conflict", code: string = "CONFLICT") {
        super(message, 409, code);
    }
}

export class InternalServerError extends AppError {
    constructor(message: string = "Internal Server Error", code: string = "INTERNAL_SERVER_ERROR") {
        super(message, 500, code);
    }
}
