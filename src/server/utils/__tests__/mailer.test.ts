import { jest } from '@jest/globals';
import { sendBrevoEmail } from '../mailer.js';
import type { ServerConfig } from '../../core/config.js';

describe('sendBrevoEmail', () => {
    let mockFetch: jest.Mock;

    beforeEach(() => {
        mockFetch = jest.fn();
        global.fetch = mockFetch as unknown as typeof fetch;
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should throw an error if brevoApiKey is not configured', async () => {
        const config = { brevoSenderEmail: 'sender@example.com' } as ServerConfig;
        await expect(sendBrevoEmail(config, 'to@example.com', 'Subject', '<p>HTML</p>'))
            .rejects
            .toThrow('Brevo is not configured (BREVO_API_KEY / BREVO_SENDER_EMAIL)');
    });

    it('should throw an error if brevoSenderEmail is not configured', async () => {
        const config = { brevoApiKey: 'api-key' } as ServerConfig;
        await expect(sendBrevoEmail(config, 'to@example.com', 'Subject', '<p>HTML</p>'))
            .rejects
            .toThrow('Brevo is not configured (BREVO_API_KEY / BREVO_SENDER_EMAIL)');
    });

    it('should call fetch with correct parameters', async () => {
        const config = {
            brevoApiKey: 'api-key',
            brevoSenderEmail: 'sender@example.com',
            siteName: 'My Site'
        } as ServerConfig;

        mockFetch.mockResolvedValueOnce({
            ok: true
        });

        await sendBrevoEmail(config, 'to@example.com', 'Subject', '<p>HTML</p>');

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: {
                "api-key": 'api-key',
                "content-type": "application/json",
                accept: "application/json",
            },
            body: JSON.stringify({
                sender: { email: 'sender@example.com', name: 'My Site' },
                to: [{ email: 'to@example.com' }],
                subject: 'Subject',
                htmlContent: '<p>HTML</p>',
            }),
        });
    });

    it('should use default name if siteName and brevoSenderName are missing', async () => {
         const config = {
            brevoApiKey: 'api-key',
            brevoSenderEmail: 'sender@example.com',
        } as ServerConfig;

        mockFetch.mockResolvedValueOnce({
            ok: true
        });

        await sendBrevoEmail(config, 'to@example.com', 'Subject', '<p>HTML</p>');

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith("https://api.brevo.com/v3/smtp/email", expect.objectContaining({
             body: JSON.stringify({
                sender: { email: 'sender@example.com', name: 'TuneCamp' },
                to: [{ email: 'to@example.com' }],
                subject: 'Subject',
                htmlContent: '<p>HTML</p>',
            })
        }));
    });

    it('should throw an error if the fetch call fails', async () => {
        const config = {
            brevoApiKey: 'api-key',
            brevoSenderEmail: 'sender@example.com',
        } as ServerConfig;

        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 400,
            text: async () => 'Bad Request'
        });

        await expect(sendBrevoEmail(config, 'to@example.com', 'Subject', '<p>HTML</p>'))
            .rejects
            .toThrow('Brevo send failed: 400 Bad Request');
    });

    it('should handle text() failure in error response gracefully', async () => {
         const config = {
            brevoApiKey: 'api-key',
            brevoSenderEmail: 'sender@example.com',
        } as ServerConfig;

        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
            text: async () => Promise.reject(new Error('text reading failed'))
        });

        await expect(sendBrevoEmail(config, 'to@example.com', 'Subject', '<p>HTML</p>'))
            .rejects
            .toThrow('Brevo send failed: 500 ');
    });
});
