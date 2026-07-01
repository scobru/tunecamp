export interface BrevoCredentials {
    apiKey?: string;
    senderEmail?: string;
    senderName?: string;
}

/**
 * Sends a transactional email via Brevo's HTTP API (no SDK needed — one endpoint, plain fetch).
 * Throws if Brevo isn't configured or the API call fails.
 */
export async function sendBrevoEmail(creds: BrevoCredentials, to: string, subject: string, htmlContent: string): Promise<void> {
    if (!creds.apiKey || !creds.senderEmail) {
        throw new Error("Brevo is not configured (BREVO_API_KEY / BREVO_SENDER_EMAIL)");
    }

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
            "api-key": creds.apiKey,
            "content-type": "application/json",
            accept: "application/json",
        },
        body: JSON.stringify({
            sender: { email: creds.senderEmail, name: creds.senderName || "TuneCamp" },
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
