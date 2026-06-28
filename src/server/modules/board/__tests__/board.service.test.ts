import { describe, test, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { BoardService } from '../board.service.js';
import type { DatabaseService } from '../../../core/database.js';

describe('BoardService', () => {
    let boardService: BoardService;
    let mockDb: any;
    let mockDatabaseService: DatabaseService;

    beforeEach(() => {
        mockDb = {
            prepare: jest.fn()
        };
        mockDatabaseService = {
            db: mockDb
        } as unknown as DatabaseService;

        boardService = new BoardService(mockDatabaseService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('getHistory', () => {
        test('should return reversed array of board messages', () => {
            const mockMessages = [
                { id: 1, message: 'first' },
                { id: 2, message: 'second' }
            ];

            const mockAll = jest.fn().mockReturnValue(mockMessages);
            mockDb.prepare.mockReturnValue({ all: mockAll });

            const result = boardService.getHistory();

            expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('SELECT bm.*, COALESCE(a.avatar, gu.avatar) AS avatar'));
            expect(mockAll).toHaveBeenCalledWith(100);
            expect(result).toEqual([
                { id: 2, message: 'second' },
                { id: 1, message: 'first' }
            ]);
        });

        test('should handle limit parameter', () => {
            const mockAll = jest.fn().mockReturnValue([]);
            mockDb.prepare.mockReturnValue({ all: mockAll });

            boardService.getHistory(50);
            expect(mockAll).toHaveBeenCalledWith(50);
        });

        test('should return empty array and log error on database failure', () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            mockDb.prepare.mockImplementation(() => {
                throw new Error('DB Error');
            });

            const result = boardService.getHistory();

            expect(result).toEqual([]);
            expect(consoleSpy).toHaveBeenCalledWith('[BoardService] Failed to fetch board history:', expect.any(Error));
            consoleSpy.mockRestore();
        });
    });

    describe('getMessage', () => {
        test('should return a message by id', () => {
            const mockMessage = { id: 1, message: 'test' };
            const mockGet = jest.fn().mockReturnValue(mockMessage);
            mockDb.prepare.mockReturnValue({ get: mockGet });

            const result = boardService.getMessage(1);

            expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM board_messages WHERE id = ?');
            expect(mockGet).toHaveBeenCalledWith(1);
            expect(result).toEqual(mockMessage);
        });

        test('should return null on database error', () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            mockDb.prepare.mockImplementation(() => {
                throw new Error('DB Error');
            });

            const result = boardService.getMessage(1);

            expect(result).toBeNull();
            expect(consoleSpy).toHaveBeenCalledWith('[BoardService] Failed to fetch board message by ID:', expect.any(Error));
            consoleSpy.mockRestore();
        });
    });

    describe('addMessage', () => {
        test('should add message, fetch avatar, emit event, and return the inserted message', () => {
            const mockRun = jest.fn().mockReturnValue({ lastInsertRowid: 123 });
            const mockGet = jest.fn().mockReturnValue({ avatar: 'avatar.png' });

            mockDb.prepare.mockImplementation((query: string) => {
                if (query.includes('INSERT')) {
                    return { run: mockRun };
                } else if (query.includes('SELECT COALESCE')) {
                    return { get: mockGet };
                }
                return {};
            });

            const emitSpy = jest.spyOn(boardService.events, 'emit');

            const result = boardService.addMessage('testuser', 'admin', 'hello world');

            expect(mockRun).toHaveBeenCalledWith('testuser', 'admin', 'hello world', 'webapp', null);
            expect(mockGet).toHaveBeenCalledWith('testuser');

            expect(result).toEqual(expect.objectContaining({
                id: 123,
                username: 'testuser',
                role: 'admin',
                message: 'hello world',
                source: 'webapp',
                telegram_message_id: null,
                avatar: 'avatar.png',
                created_at: expect.any(String)
            }));

            expect(emitSpy).toHaveBeenCalledWith('message', result);
        });

        test('should handle avatar lookup failure gracefully', () => {
            const mockRun = jest.fn().mockReturnValue({ lastInsertRowid: 123 });

            mockDb.prepare.mockImplementation((query: string) => {
                if (query.includes('INSERT')) {
                    return { run: mockRun };
                } else if (query.includes('SELECT COALESCE')) {
                    return {
                        get: () => { throw new Error('Avatar DB Error'); }
                    };
                }
                return {};
            });

            const emitSpy = jest.spyOn(boardService.events, 'emit');

            const result = boardService.addMessage('testuser', 'admin', 'hello world');

            expect(result).toEqual(expect.objectContaining({
                id: 123,
                avatar: null
            }));
            expect(emitSpy).toHaveBeenCalledWith('message', result);
        });

        test('should return null on insertion error', () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            mockDb.prepare.mockImplementation(() => {
                throw new Error('DB Error');
            });

            const result = boardService.addMessage('user', 'role', 'msg');

            expect(result).toBeNull();
            expect(consoleSpy).toHaveBeenCalledWith('[BoardService] Failed to save board message:', expect.any(Error));
            consoleSpy.mockRestore();
        });
    });

    describe('deleteMessage', () => {
        test('should delete message and emit event if changes were made', () => {
            const mockRun = jest.fn().mockReturnValue({ changes: 1 });
            mockDb.prepare.mockReturnValue({ run: mockRun });

            const emitSpy = jest.spyOn(boardService.events, 'emit');

            const result = boardService.deleteMessage(123);

            expect(mockDb.prepare).toHaveBeenCalledWith('DELETE FROM board_messages WHERE id = ?');
            expect(mockRun).toHaveBeenCalledWith(123);
            expect(result).toBe(true);
            expect(emitSpy).toHaveBeenCalledWith('message', { id: 123, deleted: true });
        });

        test('should not emit event if no changes were made', () => {
            const mockRun = jest.fn().mockReturnValue({ changes: 0 });
            mockDb.prepare.mockReturnValue({ run: mockRun });

            const emitSpy = jest.spyOn(boardService.events, 'emit');

            const result = boardService.deleteMessage(123);

            expect(result).toBe(false);
            expect(emitSpy).not.toHaveBeenCalled();
        });

        test('should return false on database error', () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            mockDb.prepare.mockImplementation(() => {
                throw new Error('DB Error');
            });

            const result = boardService.deleteMessage(123);

            expect(result).toBe(false);
            expect(consoleSpy).toHaveBeenCalledWith('[BoardService] Failed to delete board message:', expect.any(Error));
            consoleSpy.mockRestore();
        });
    });
});
