import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createCommentsRoutes } from '../comments.js';

describe('Comments Routes', () => {
    let app: express.Express;
    let mockSocial: any;
    let mockAuthMiddleware: any;
    let consoleErrorSpy: any;

    beforeEach(() => {
        mockSocial = {
            getComments: jest.fn(),
            addComment: jest.fn(),
            deleteComment: jest.fn()
        };

        mockAuthMiddleware = {
            requireUser: (req: any, res: any, next: any) => {
                req.username = 'alice';
                req.isAdmin = false;
                next();
            }
        };

        app = express();
        app.use(express.json());
        app.use('/api/comments', createCommentsRoutes({
            social: mockSocial,
            authMiddleware: mockAuthMiddleware
        } as any));

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
                { id: 1, track_id: 123, username: 'alice', text: 'Nice track', created_at: '2026-06-07' }
            ];
            mockSocial.getComments.mockReturnValue(mockComments);

            const res = await request(app).get('/api/comments/track/123');
            expect(res.status).toBe(200);
            expect(res.body).toEqual(mockComments);
            expect(mockSocial.getComments).toHaveBeenCalledWith(123);
        });
    });

    describe('POST /api/comments/track/:trackId', () => {
        test('returns 400 if track ID is not a number', async () => {
            const res = await request(app)
                .post('/api/comments/track/abc')
                .send({ text: 'Love the beat!' });
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Invalid track ID');
        });

        test('returns 400 if text is missing', async () => {
            const res = await request(app)
                .post('/api/comments/track/123')
                .send({});
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('text required');
        });

        test('returns 400 if text is too long', async () => {
            const longText = 'a'.repeat(501);
            const res = await request(app)
                .post('/api/comments/track/123')
                .send({ text: longText });
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Comment too long (max 500 chars)');
        });

        test('creates and returns comment on success', async () => {
            const mockComment = { id: 1, track_id: 123, username: 'alice', text: 'Love the beat!', created_at: '2026-06-07' };
            mockSocial.addComment.mockReturnValue(mockComment);

            const res = await request(app)
                .post('/api/comments/track/123')
                .send({ text: 'Love the beat!' });

            expect(res.status).toBe(200);
            expect(res.body).toEqual(mockComment);
            expect(mockSocial.addComment).toHaveBeenCalledWith(123, 'alice', 'Love the beat!');
        });
    });

    describe('DELETE /api/comments/:commentId', () => {
        test('returns 400 if comment ID is not a number', async () => {
            const res = await request(app).delete('/api/comments/abc');
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Invalid comment ID');
        });

        test('returns success if deleteComment is successful', async () => {
            mockSocial.deleteComment.mockReturnValue(true);

            const res = await request(app).delete('/api/comments/1');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ success: true });
            expect(mockSocial.deleteComment).toHaveBeenCalledWith(1, 'alice', false);
        });

        test('returns 403 if deleteComment is not successful', async () => {
            mockSocial.deleteComment.mockReturnValue(false);

            const res = await request(app).delete('/api/comments/1');

            expect(res.status).toBe(403);
            expect(res.body.error).toBe('Cannot delete this comment');
        });
    });
});
