import { describe, it, expect, vi, beforeEach } from 'vitest';
import API, { handleResponse, ApiError } from '../api';

describe('handleResponse', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    it('should return data when promise resolves successfully', async () => {
        const mockData = { id: 1, name: 'Test' };
        const mockPromise = Promise.resolve({ data: mockData });

        const result = await handleResponse(mockPromise);
        expect(result).toEqual(mockData);
    });

    it('should throw ApiError with correct message and status when promise rejects', async () => {
        const mockError = {
            response: {
                status: 404,
                data: { message: 'Not found' }
            }
        };
        const mockPromise = Promise.reject(mockError);

        await expect(handleResponse(mockPromise)).rejects.toThrow(ApiError);

        try {
            await handleResponse(mockPromise);
            // Should not reach here
            expect(true).toBe(false);
        } catch (error) {
            expect(error).toBeInstanceOf(ApiError);
            expect((error as ApiError).status).toBe(404);
            expect((error as ApiError).message).toBe('Not found');
        }
    });

    it('should handle missing response data correctly', async () => {
        const mockError = {
            response: {
                status: 500
            },
            message: 'Network Error'
        };
        const mockPromise = Promise.reject(mockError);

        try {
            await handleResponse(mockPromise);
            expect(true).toBe(false);
        } catch (error) {
            expect(error).toBeInstanceOf(ApiError);
            expect((error as ApiError).status).toBe(500);
            expect((error as ApiError).message).toBe('Network Error');
        }
    });

    it('should trigger auth:unauthorized event and clear token on 401 for non-auth endpoints when token exists', async () => {
        const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');
        localStorage.setItem('tunecamp_token', 'mock_token');

        const mockError = {
            response: {
                status: 401,
                data: { message: 'Unauthorized' }
            },
            config: {
                url: '/some/other/endpoint'
            }
        };

        const mockPromise = Promise.reject(mockError);

        try {
            await handleResponse(mockPromise);
        } catch (error) {
            // Error expected
        }

        expect(localStorage.getItem('tunecamp_token')).toBeNull();
        expect(dispatchEventSpy).toHaveBeenCalledWith(expect.any(Event));
        const event = dispatchEventSpy.mock.calls[0][0] as Event;
        expect(event.type).toBe('auth:unauthorized');

        dispatchEventSpy.mockRestore();
    });
});
