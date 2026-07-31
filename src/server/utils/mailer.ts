import type { ServerConfig } from "../core/config.js";

/**
 * Sends a transactional email via Brevo's HTTP API (no SDK needed — one endpoint, plain fetch).
 * Throws if Brevo isn't configured or the API call fails.
 */
export async function sendBrevoEmail(
    config: ServerConfig, 
    to: string, 
    subject: string, 
    htmlContent: string,
    database?: { getSetting: (key: string) => string | undefined }
): Promise<void> {
    const brevoApiKey = database?.getSetting("brevo_api_key") || config.brevoApiKey;
    const brevoSenderEmail = database?.getSetting("brevo_sender_email") || config.brevoSenderEmail;
    const brevoSenderName = database?.getSetting("brevo_sender_name") || config.brevoSenderName;

    if (!brevoApiKey || !brevoSenderEmail) {
        throw new Error("Brevo is not configured (BREVO_API_KEY / BREVO_SENDER_EMAIL)");
    }

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
            "api-key": brevoApiKey,
            "content-type": "application/json",
            accept: "application/json",
        },
        body: JSON.stringify({
            sender: { email: brevoSenderEmail, name: brevoSenderName || config.siteName || "TuneCamp" },
            to: [{ email: to }],
            subject,
            htmlContent,
        }),
    });

    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Brevo send failed: ${res.status} ${body}`);
    }
}
