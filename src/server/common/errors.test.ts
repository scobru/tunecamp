import {
    AppError,
    BadRequestError,
    ForbiddenError,
    NotFoundError,
    ServiceUnavailableError,
    isNonFatalError,
} from './errors';

describe('Error Classes', () => {
    describe('BadRequestError', () => {
        it('should initialize with default values', () => {
            const error = new BadRequestError();
            expect(error).toBeInstanceOf(AppError);
            expect(error.message).toBe('Bad Request');
            expect(error.statusCode).toBe(400);
            expect(error.code).toBe('BAD_REQUEST');
            expect(error.name).toBe('BadRequestError');
        });

        it('should initialize with custom values', () => {
            const error = new BadRequestError('Custom message', 'CUSTOM_CODE');
            expect(error.message).toBe('Custom message');
            expect(error.statusCode).toBe(400);
            expect(error.code).toBe('CUSTOM_CODE');
        });
    });

    describe('ForbiddenError', () => {
        it('should initialize with default values', () => {
            const error = new ForbiddenError();
            expect(error).toBeInstanceOf(AppError);
            expect(error.message).toBe('Forbidden');
            expect(error.statusCode).toBe(403);
            expect(error.code).toBe('FORBIDDEN');
            expect(error.name).toBe('ForbiddenError');
        });

        it('should initialize with custom values', () => {
            const error = new ForbiddenError('Custom message', 'CUSTOM_CODE');
            expect(error.message).toBe('Custom message');
            expect(error.statusCode).toBe(403);
            expect(error.code).toBe('CUSTOM_CODE');
        });
    });

    describe('NotFoundError', () => {
        it('should initialize with default values', () => {
            const error = new NotFoundError();
            expect(error).toBeInstanceOf(AppError);
            expect(error.message).toBe('Resource Not Found');
            expect(error.statusCode).toBe(404);
            expect(error.code).toBe('NOT_FOUND');
            expect(error.name).toBe('NotFoundError');
        });

        it('should initialize with custom values', () => {
            const error = new NotFoundError('Custom message', 'CUSTOM_CODE');
            expect(error.message).toBe('Custom message');
            expect(error.statusCode).toBe(404);
            expect(error.code).toBe('CUSTOM_CODE');
        });
    });

    describe('ServiceUnavailableError', () => {
        it('should initialize with default values', () => {
            const error = new ServiceUnavailableError();
            expect(error).toBeInstanceOf(AppError);
            expect(error.message).toBe('Service Unavailable');
            expect(error.statusCode).toBe(503);
            expect(error.code).toBe('SERVICE_UNAVAILABLE');
            expect(error.name).toBe('ServiceUnavailableError');
        });

        it('should initialize with custom values', () => {
            const error = new ServiceUnavailableError('Custom message', 'CUSTOM_CODE');
            expect(error.message).toBe('Custom message');
            expect(error.statusCode).toBe(503);
            expect(error.code).toBe('CUSTOM_CODE');
        });
    });
});

describe('isNonFatalError', () => {
    it('should return true for known non-fatal error strings', () => {
        const nonFatalMessages = [
            'connect ECONNREFUSED 127.0.0.1:80',
            'ETIMEDOUT during fetch',
            'socket hang up while reading',
            'received non-101 status code',
            'network error when fetching',
            'fetch failed due to network',
            'Unexpected non-whitespace character after JSON',
            'Unexpected token in JSON',
            'SQLITE_BUSY: database is busy',
            'read ECONNRESET',
            'write EPIPE',
            'getaddrinfo ENOTFOUND api.example.com',
            'ffmpeg exited with code 1',
            'Conversion failed for file',
            'Output stream closed unexpectedly',
        ];

        for (const msg of nonFatalMessages) {
            expect(isNonFatalError({ message: msg })).toBe(true);
            expect(isNonFatalError(new Error(msg))).toBe(true);
        }
    });

    it('should return false for missing or invalid inputs', () => {
        expect(isNonFatalError(null)).toBe(false);
        expect(isNonFatalError(undefined)).toBe(false);
        expect(isNonFatalError({})).toBe(false);
        expect(isNonFatalError({ code: 'ENOENT' })).toBe(false);
        // @ts-ignore
        expect(isNonFatalError(123)).toBe(false);
        // @ts-ignore
        expect(isNonFatalError('string error')).toBe(false);
    });

    it('should return false for unrecognized error messages', () => {
        const fatalMessages = [
            'TypeError: Cannot read property of undefined',
            'SyntaxError: Invalid syntax',
            'ReferenceError: x is not defined',
            'Unknown error occurred',
            'Disk full',
            'Memory out of bounds',
        ];

        for (const msg of fatalMessages) {
            expect(isNonFatalError({ message: msg })).toBe(false);
            expect(isNonFatalError(new Error(msg))).toBe(false);
        }
    });
});
