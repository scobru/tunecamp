import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../common/errors.js';
import { errorHandler, wrapAsync } from '../error-handling.js';

class ConcreteAppError extends AppError {}

describe('Error Handling Middleware', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;
    let consoleErrorSpy: any;
    let originalNodeEnv: string | undefined;

    beforeEach(() => {
        originalNodeEnv = process.env.NODE_ENV;
        mockReq = {
            method: 'GET',
            url: '/test-route'
        };
        mockRes = {
            headersSent: false,
            status: jest.fn().mockReturnThis() as any,
            json: jest.fn().mockReturnThis() as any
        };
        mockNext = jest.fn();
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        process.env.NODE_ENV = originalNodeEnv;
        consoleErrorSpy.mockRestore();
    });

    describe('wrapAsync', () => {
        test('calls the wrapped function and resolves successfully', async () => {
            const mockHandler = jest.fn() as any;
            mockHandler.mockResolvedValue('success');
            const wrapped = wrapAsync(mockHandler);

            wrapped(mockReq as Request, mockRes as Response, mockNext);

            expect(mockHandler).toHaveBeenCalledWith(mockReq, mockRes, mockNext);
            // Give async cycle a tick
            await new Promise(process.nextTick);
            expect(mockNext).not.toHaveBeenCalled();
        });

        test('catches error from the wrapped function and passes it to next', async () => {
            const error = new Error('Async error');
            const mockHandler = jest.fn() as any;
            mockHandler.mockRejectedValue(error);
            const wrapped = wrapAsync(mockHandler);

            wrapped(mockReq as Request, mockRes as Response, mockNext);

            await new Promise(process.nextTick);
            expect(mockNext).toHaveBeenCalledWith(error);
        });
    });

    describe('errorHandler', () => {
        test('delegates to next if headers are already sent', () => {
            mockRes.headersSent = true;
            const error = new Error('Headers already sent error');

            errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith(error);
            expect(mockRes.status).not.toHaveBeenCalled();
        });

        describe('AppError handling', () => {
            test('formats AppError correctly in development mode', () => {
                process.env.NODE_ENV = 'development';
                const appError = new ConcreteAppError('Resource not found', 404, 'NOT_FOUND', { id: 123 });

                errorHandler(appError, mockReq as Request, mockRes as Response, mockNext);

                expect(mockRes.status).toHaveBeenCalledWith(404);
                expect(mockRes.json).toHaveBeenCalledWith({
                    error: 'Resource not found',
                    code: 'NOT_FOUND',
                    statusCode: 404,
                    details: { id: 123 },
                    stack: expect.any(String)
                });
            });

            test('excludes stack trace in production mode', () => {
                process.env.NODE_ENV = 'production';
                const appError = new ConcreteAppError('Resource not found', 404, 'NOT_FOUND', { id: 123 });

                errorHandler(appError, mockReq as Request, mockRes as Response, mockNext);

                expect(mockRes.status).toHaveBeenCalledWith(404);
                expect(mockRes.json).toHaveBeenCalledWith({
                    error: 'Resource not found',
                    code: 'NOT_FOUND',
                    statusCode: 404,
                    details: { id: 123 },
                    stack: undefined
                });
            });
        });

        describe('SyntaxError/JSON parsing handling', () => {
            test('returns 400 for JSON parsing syntax error', () => {
                const syntaxError = new SyntaxError('Unexpected token } in JSON at position 12');
                (syntaxError as any).status = 400;
                (syntaxError as any).body = '{';

                errorHandler(syntaxError, mockReq as Request, mockRes as Response, mockNext);

                expect(mockRes.status).toHaveBeenCalledWith(400);
                expect(mockRes.json).toHaveBeenCalledWith({
                    error: 'Invalid JSON body',
                    code: 'INVALID_JSON',
                    statusCode: 400
                });
            });
        });

        describe('Unhandled errors', () => {
            test('logs to console.error and returns 500 in development mode', () => {
                process.env.NODE_ENV = 'development';
                const unknownError = new Error('Database crash');

                errorHandler(unknownError, mockReq as Request, mockRes as Response, mockNext);

                expect(consoleErrorSpy).toHaveBeenCalled();
                expect(mockRes.status).toHaveBeenCalledWith(500);
                expect(mockRes.json).toHaveBeenCalledWith({
                    error: 'Database crash',
                    code: 'INTERNAL_SERVER_ERROR',
                    statusCode: 500,
                    stack: expect.any(String)
                });
            });

            test('returns general Internal Server Error message and no stack in production mode', () => {
                process.env.NODE_ENV = 'production';
                const unknownError = new Error('Database crash');

                errorHandler(unknownError, mockReq as Request, mockRes as Response, mockNext);

                expect(consoleErrorSpy).toHaveBeenCalled();
                expect(mockRes.status).toHaveBeenCalledWith(500);
                expect(mockRes.json).toHaveBeenCalledWith({
                    error: 'Internal Server Error',
                    code: 'INTERNAL_SERVER_ERROR',
                    statusCode: 500,
                    stack: undefined
                });
            });
        });
    });
});
