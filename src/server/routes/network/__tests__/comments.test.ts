import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createCommentsRoutes } from '../comments.js';

describe('Comments Routes', () => {
    let app: express.Express;
    let mockZenDBService: any;
    let consoleErrorSpy: any;

    beforeEach(() => {
        mockZenDBService = {
            getComments: jest.fn(),
            getUser: jest.fn(),
            addComment: jest.fn(),
            deleteComment: jest.fn()
        };

        app = express();
        app.use(express.json());
        app.use('/api/comments', createCommentsRoutes(mockZenDBService));
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
    });

    describe('GET /api/comments/track/:trackId', () => {
        test('returns 400 if track ID is not a number', async () => {
            const res = await request(app).get('/api/comments/track/abc');
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Invalid track ID');
        });

        test('returns comments on success', async () => {
            const mockComments = [
                { id: 'c1', text: 'Nice track', pubKey: 'key1', username: 'alice' }
            ];
            mockZenDBService.getComments.mockResolvedValue(mockComments);

            const res = await request(app).get('/api/comments/track/123');
            expect(res.status).toBe(200);
            expect(res.body).toEqual(mockComments);
            expect(mockZenDBService.getComments).toHaveBeenCalledWith(123);
        });

        test('returns 500 if database service throws', async () => {
            mockZenDBService.getComments.mockRejectedValue(new Error('DB failure'));

            const res = await request(app).get('/api/comments/track/123');
            expect(res.status).toBe(500);
            expect(res.body.error).toBe('Failed to get comments');
        });
    });

    describe('POST /api/comments/track/:trackId', () => {
        const validCommentPayload = {
            pubKey: 'alicepubkey',
            text: 'Love the beat!',
            signature: 'sig123'
        };

        test('returns 400 if track ID is not a number', async () => {
            const res = await request(app)
                .post('/api/comments/track/abc')
                .send(validCommentPayload);
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Invalid track ID');
        });

        test('returns 400 if public key is missing', async () => {
            const res = await request(app)
                .post('/api/comments/track/123')
                .send({ text: 'Nice', signature: 'sig' });
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Public key and text required');
        });

        test('returns 400 if text is missing', async () => {
            const res = await request(app)
                .post('/api/comments/track/123')
                .send({ pubKey: 'pub', signature: 'sig' });
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Public key and text required');
        });

        test('returns 400 if text is too long', async () => {
            const longText = 'a'.repeat(501);
            const res = await request(app)
                .post('/api/comments/track/123')
                .send({ pubKey: 'pub', text: longText, signature: 'sig' });
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Comment too long (max 500 chars)');
        });

        test('uses provided username in the comment', async () => {
            const mockCommentResult = { id: 'c1', ...validCommentPayload, username: 'alice' };
            mockZenDBService.addComment.mockResolvedValue(mockCommentResult);

            const res = await request(app)
                .post('/api/comments/track/123')
                .send({ ...validCommentPayload, username: 'alice' });

            expect(res.status).toBe(200);
            expect(res.body).toEqual(mockCommentResult);
            expect(mockZenDBService.addComment).toHaveBeenCalledWith(123, {
                pubKey: 'alicepubkey',
                username: 'alice',
                text: 'Love the beat!',
                signature: 'sig123'
            });
        });

        test('fetches username from database if not provided', async () => {
            mockZenDBService.getUser.mockResolvedValue({ username: 'db_username' });
            const mockCommentResult = { id: 'c1', ...validCommentPayload, username: 'db_username' };
            mockZenDBService.addComment.mockResolvedValue(mockCommentResult);

            const res = await request(app)
                .post('/api/comments/track/123')
                .send(validCommentPayload);

            expect(res.status).toBe(200);
            expect(mockZenDBService.getUser).toHaveBeenCalledWith('alicepubkey');
            expect(mockZenDBService.addComment).toHaveBeenCalledWith(123, {
                pubKey: 'alicepubkey',
                username: 'db_username',
                text: 'Love the beat!',
                signature: 'sig123'
            });
        });

        test('uses fallback username if profile does not exist in db and no username is provided', async () => {
            mockZenDBService.getUser.mockResolvedValue(null);
            const mockCommentResult = { id: 'c1', ...validCommentPayload, username: 'alicepub...' };
            mockZenDBService.addComment.mockResolvedValue(mockCommentResult);

            const res = await request(app)
                .post('/api/comments/track/123')
                .send(validCommentPayload);

            expect(res.status).toBe(200);
            expect(mockZenDBService.addComment).toHaveBeenCalledWith(123, {
                pubKey: 'alicepubkey',
                username: 'alicepub...',
                text: 'Love the beat!',
                signature: 'sig123'
            });
        });

        test('returns 500 if addComment returns null/undefined', async () => {
            mockZenDBService.getUser.mockResolvedValue(null);
            mockZenDBService.addComment.mockResolvedValue(null);

            const res = await request(app)
                .post('/api/comments/track/123')
                .send(validCommentPayload);

            expect(res.status).toBe(500);
            expect(res.body.error).toBe('Failed to post comment');
        });

        test('returns 500 if database throws on comment insertion', async () => {
            mockZenDBService.getUser.mockRejectedValue(new Error('Lookup error'));

            const res = await request(app)
                .post('/api/comments/track/123')
                .send(validCommentPayload);

            expect(res.status).toBe(500);
            expect(res.body.error).toBe('Failed to post comment');
        });
    });

    describe('DELETE /api/comments/:commentId', () => {
        test('returns 400 if public key is not provided', async () => {
            const res = await request(app)
                .delete('/api/comments/c1')
                .send({ signature: 'sig' });
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Public key required');
        });

        test('returns success if deleteComment is successful', async () => {
            mockZenDBService.deleteComment.mockResolvedValue(true);

            const res = await request(app)
                .delete('/api/comments/c1')
                .send({ pubKey: 'pub', signature: 'sig' });

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ success: true });
            expect(mockZenDBService.deleteComment).toHaveBeenCalledWith('c1', 'pub', 'sig');
        });

        test('returns 403 if deleteComment is not successful', async () => {
            mockZenDBService.deleteComment.mockResolvedValue(false);

            const res = await request(app)
                .delete('/api/comments/c1')
                .send({ pubKey: 'pub', signature: 'sig' });

            expect(res.status).toBe(403);
            expect(res.body.error).toBe('Cannot delete this comment');
        });

        test('returns 500 if database throws on deletion', async () => {
            mockZenDBService.deleteComment.mockRejectedValue(new Error('Delete error'));

            const res = await request(app)
                .delete('/api/comments/c1')
                .send({ pubKey: 'pub', signature: 'sig' });

            expect(res.status).toBe(500);
            expect(res.body.error).toBe('Failed to delete comment');
        });
    });
});
