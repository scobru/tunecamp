import { describe, expect, test, jest, beforeEach, afterEach } from '@jest/globals';
import { DeliveryQueue } from '../activitypub.delivery-queue.js';
import type { Database } from 'better-sqlite3';

describe('DeliveryQueue', () => {
    let mockDb: any;
    let mockDeliverFn: jest.Mock;
    let queue: DeliveryQueue;
    const baseUrl = 'https://example.com';

    let mockRun: jest.Mock;
    let mockAll: jest.Mock;
    let mockGet: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        mockRun = jest.fn();
        mockAll = jest.fn().mockReturnValue([]);
        mockGet = jest.fn();

        mockDb = {
            prepare: jest.fn().mockReturnValue({
                run: mockRun,
                all: mockAll,
                get: mockGet,
            })
        };

        mockDeliverFn = jest.fn().mockResolvedValue(true);

        queue = new DeliveryQueue(mockDb as unknown as Database, mockDeliverFn as any, baseUrl);
    });

    afterEach(() => {
        queue.stop();
        jest.useRealTimers();
    });

    describe('enqueue', () => {
        test('should enqueue a plain JSON object', async () => {
            const actorSlug = 'test-actor';
            const inboxUri = 'https://remote.com/inbox';
            const activity = { type: 'Create' };

            await queue.enqueue(actorSlug, inboxUri, activity);

            expect(mockDb.prepare).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO ap_delivery_queue')
            );
            expect(mockRun).toHaveBeenCalledWith(
                actorSlug,
                inboxUri,
                expect.any(String),
                expect.any(Number)
            );

            const insertedJsonStr = mockRun.mock.calls[0][2] as string;
            const insertedJson = JSON.parse(insertedJsonStr);
            expect(insertedJson.type).toBe('Create');
            expect(insertedJson['@context']).toBe('https://www.w3.org/ns/activitystreams');
            expect(insertedJson.id).toMatch(new RegExp(`^${baseUrl}/activity/`));
        });

        test('should enqueue a Fedify object (has toJsonLd)', async () => {
            const actorSlug = 'test-actor';
            const inboxUri = 'https://remote.com/inbox';
            const activity = {
                toJsonLd: jest.fn().mockResolvedValue({ type: 'CreateFedify' })
            };

            await queue.enqueue(actorSlug, inboxUri, activity);

            expect(activity.toJsonLd).toHaveBeenCalled();
            const insertedJsonStr = mockRun.mock.calls[0][2] as string;
            const insertedJson = JSON.parse(insertedJsonStr);
            expect(insertedJson.type).toBe('CreateFedify');
        });

        test('should keep existing id if present', async () => {
            const actorSlug = 'test-actor';
            const inboxUri = 'https://remote.com/inbox';
            const activity = { type: 'Create', id: 'https://example.com/custom-id' };

            await queue.enqueue(actorSlug, inboxUri, activity);

            const insertedJsonStr = mockRun.mock.calls[0][2] as string;
            const insertedJson = JSON.parse(insertedJsonStr);
            expect(insertedJson.id).toBe('https://example.com/custom-id');
        });

        test('should handle database errors gracefully and log them', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            mockRun.mockImplementation(() => {
                throw new Error('Database insertion failed');
            });

            await queue.enqueue('actor', 'inbox', { type: 'Create' });

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('❌ [DeliveryQueue] Could not enqueue delivery'),
                'Database insertion failed'
            );
            consoleSpy.mockRestore();
        });
    });

    describe('start and stop', () => {
        test('should set up the interval on start and clear it on stop', () => {
            const setIntervalSpy = jest.spyOn(global, 'setInterval');
            const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

            queue.start();
            expect(setIntervalSpy).toHaveBeenCalledTimes(1);

            queue.stop();
            expect(clearIntervalSpy).toHaveBeenCalledTimes(1);

            setIntervalSpy.mockRestore();
            clearIntervalSpy.mockRestore();
        });

        test('should not set up multiple intervals if called twice', () => {
            const setIntervalSpy = jest.spyOn(global, 'setInterval');

            queue.start();
            queue.start();

            expect(setIntervalSpy).toHaveBeenCalledTimes(1);

            setIntervalSpy.mockRestore();
        });
    });

    describe('processDue', () => {
        test('should do nothing if queue is empty', async () => {
            mockAll.mockReturnValue([]);
            await queue.processDue();
            expect(mockDeliverFn).not.toHaveBeenCalled();
            // DB shouldn't run DELETE or UPDATE
            expect(mockRun).not.toHaveBeenCalled();
        });

        test('should delete row on successful delivery', async () => {
            mockAll.mockReturnValue([{
                id: 1,
                actor_slug: 'actor1',
                inbox_uri: 'inbox1',
                activity_json: '{"type":"Create"}',
                attempts: 0
            }]);
            mockDeliverFn.mockResolvedValue(true);

            await queue.processDue();

            expect(mockDeliverFn).toHaveBeenCalledWith('actor1', 'inbox1', { type: 'Create' });
            expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM ap_delivery_queue'));
            expect(mockRun).toHaveBeenCalledWith(1);
        });

        test('should mark failed on corrupt payload without delivering', async () => {
            mockAll.mockReturnValue([{
                id: 2,
                actor_slug: 'actor2',
                inbox_uri: 'inbox2',
                activity_json: '{invalid-json',
                attempts: 0
            }]);

            await queue.processDue();

            expect(mockDeliverFn).not.toHaveBeenCalled();
            expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('UPDATE ap_delivery_queue SET status = \'failed\''));
            expect(mockRun).toHaveBeenCalledWith('corrupt payload', 2);
        });

        test('should increment attempts on delivery failure', async () => {
            mockAll.mockReturnValue([{
                id: 3,
                actor_slug: 'actor3',
                inbox_uri: 'inbox3',
                activity_json: '{"type":"Create"}',
                attempts: 0
            }]);
            mockDeliverFn.mockResolvedValue(false);

            await queue.processDue();

            expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('UPDATE ap_delivery_queue SET attempts = ?'));
            // next_attempt_at, last_error, id
            expect(mockRun).toHaveBeenCalledWith(1, expect.any(Number), 'remote rejected delivery', 3);
        });

        test('should mark failed if max attempts reached', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            mockAll.mockReturnValue([{
                id: 4,
                actor_slug: 'actor4',
                inbox_uri: 'inbox4',
                activity_json: '{"type":"Create"}',
                attempts: 11 // MAX_ATTEMPTS is 12, so attempt 12 (0-indexed 11) failure should trigger failure
            }]);
            mockDeliverFn.mockRejectedValue(new Error('Network error'));

            await queue.processDue();

            expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('UPDATE ap_delivery_queue SET status = \'failed\''));
            expect(mockRun).toHaveBeenCalledWith('Network error', 4);
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('💀 [DeliveryQueue] Giving up on delivery'));

            consoleSpy.mockRestore();
        });

        test('should prevent overlapping runs', async () => {
            mockAll.mockReturnValue([{
                id: 5,
                actor_slug: 'actor5',
                inbox_uri: 'inbox5',
                activity_json: '{"type":"Create"}',
                attempts: 0
            }]);

            let resolveDeliver: any;
            mockDeliverFn.mockReturnValue(new Promise(resolve => {
                resolveDeliver = resolve;
            }));

            // Start first run
            const promise1 = queue.processDue();

            // Start second run synchronously before first one finishes
            await queue.processDue();

            // Resolve the first run
            resolveDeliver(true);
            await promise1;

            // Only one DB select/fetch should have occurred since second run aborts
            // Number of times prepare is called:
            // 1 for SELECT inside processDue
            // 1 for DELETE inside processDue
            expect(mockAll).toHaveBeenCalledTimes(1);
        });
    });
});
