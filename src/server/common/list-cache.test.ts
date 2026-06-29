import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { EventEmitter } from 'events';
import { invalidateListCacheOnMutation, serveCachedList } from './list-cache.js';

describe('list-cache', () => {
    describe('invalidateListCacheOnMutation', () => {
        let req: any;
        let res: any;
        let next: any;

        beforeEach(() => {
            req = { method: 'POST' };
            res = new EventEmitter();
            res.statusCode = 200;
            next = jest.fn();
        });

        it('should call next immediately and not bind finish event for GET, HEAD, OPTIONS', () => {
            const methods = ['GET', 'HEAD', 'OPTIONS'];

            for (const method of methods) {
                req.method = method;
                const onSpy = jest.spyOn(res, 'on');

                invalidateListCacheOnMutation(req, res, next);

                expect(next).toHaveBeenCalledTimes(1);
                expect(onSpy).not.toHaveBeenCalled();

                next.mockClear();
                onSpy.mockRestore();
            }
        });

        it('should bind finish event and call next for mutating requests', () => {
            req.method = 'POST';
            const onSpy = jest.spyOn(res, 'on');

            invalidateListCacheOnMutation(req, res, next);

            expect(next).toHaveBeenCalledTimes(1);
            expect(onSpy).toHaveBeenCalledWith('finish', expect.any(Function));
        });

        it('should invalidate cache when mutating request finishes with success status', async () => {
            // First populate the cache
            let produceCalls = 0;
            const produce = async () => {
                produceCalls++;
                return { data: 'test' };
            };

            const mockCacheReq = { headers: {} } as any;
            const createMockCacheRes = () => {
                const cacheRes: any = new EventEmitter();
                cacheRes.setHeader = jest.fn();
                cacheRes.type = jest.fn().mockReturnThis();
                cacheRes.send = jest.fn();
                cacheRes.status = jest.fn().mockReturnThis();
                cacheRes.end = jest.fn();
                return cacheRes;
            };

            await serveCachedList(mockCacheReq, createMockCacheRes(), 'test-scope', produce);
            expect(produceCalls).toBe(1); // Cache miss

            await serveCachedList(mockCacheReq, createMockCacheRes(), 'test-scope', produce);
            expect(produceCalls).toBe(1); // Cache hit

            // Now invalidate
            invalidateListCacheOnMutation(req, res, next);
            res.statusCode = 200;
            res.emit('finish');

            // Verify cache is invalidated
            await serveCachedList(mockCacheReq, createMockCacheRes(), 'test-scope', produce);
            expect(produceCalls).toBe(2); // Cache miss again
        });

        it('should not invalidate cache when mutating request finishes with error status (>= 400)', async () => {
            // Populate cache
            let produceCalls = 0;
            const produce = async () => {
                produceCalls++;
                return { data: 'test' };
            };

            const mockCacheReq = { headers: {} } as any;
            const createMockCacheRes = () => {
                const cacheRes: any = new EventEmitter();
                cacheRes.setHeader = jest.fn();
                cacheRes.type = jest.fn().mockReturnThis();
                cacheRes.send = jest.fn();
                cacheRes.status = jest.fn().mockReturnThis();
                cacheRes.end = jest.fn();
                return cacheRes;
            };

            await serveCachedList(mockCacheReq, createMockCacheRes(), 'test-scope-error', produce);
            expect(produceCalls).toBe(1); // Cache miss

            // Simulate error response
            invalidateListCacheOnMutation(req, res, next);
            res.statusCode = 400; // Client error
            res.emit('finish');

            // Verify cache is still valid
            await serveCachedList(mockCacheReq, createMockCacheRes(), 'test-scope-error', produce);
            expect(produceCalls).toBe(1); // Cache hit

            // Try another error
            res.statusCode = 500; // Server error
            res.emit('finish');

            // Verify cache is still valid
            await serveCachedList(mockCacheReq, createMockCacheRes(), 'test-scope-error', produce);
            expect(produceCalls).toBe(1); // Cache hit
        });

        it('should not invalidate cache when mutating request finishes with informational status (< 200)', async () => {
            // Populate cache
            let produceCalls = 0;
            const produce = async () => {
                produceCalls++;
                return { data: 'test' };
            };

            const mockCacheReq = { headers: {} } as any;
            const createMockCacheRes = () => {
                const cacheRes: any = new EventEmitter();
                cacheRes.setHeader = jest.fn();
                cacheRes.type = jest.fn().mockReturnThis();
                cacheRes.send = jest.fn();
                cacheRes.status = jest.fn().mockReturnThis();
                cacheRes.end = jest.fn();
                return cacheRes;
            };

            await serveCachedList(mockCacheReq, createMockCacheRes(), 'test-scope-info', produce);
            expect(produceCalls).toBe(1); // Cache miss

            // Simulate info response
            invalidateListCacheOnMutation(req, res, next);
            res.statusCode = 101; // Switching protocols
            res.emit('finish');

            // Verify cache is still valid
            await serveCachedList(mockCacheReq, createMockCacheRes(), 'test-scope-info', produce);
            expect(produceCalls).toBe(1); // Cache hit
        });
    });
});
