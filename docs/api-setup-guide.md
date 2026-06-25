# External Services Setup Guide (API)

This guide explains step by step how to obtain and configure the API keys required to run all of TuneCamp's integrations.

---

## 1. Payments & Monetization

### Stripe (Fiat & Onramp)
1. Go to the [Stripe Dashboard](https://dashboard.stripe.com/).
2. **Secret Key**: Go to *Developers > API Keys* and copy the `Secret key` (`sk_test_...` or `sk_live_...`).
3. **Webhook Secret**:
   - Go to *Developers > Webhooks*.
   - Add an endpoint: `https://your-domain.com/api/payments/stripe/webhook`.
   - Select the event: `checkout.session.completed`.
   - **Important (multi-artist instances)**: Enable the **"Listen to events on connected accounts"** option on the endpoint. Without this checkbox, payments made on artists' Stripe Connect accounts will not trigger the webhook and no unlock code will be generated.
   - Copy the "Signing secret" (`whsec_...`).
4. **Crypto Onramp**: Request access to "Crypto Onramp" in your Stripe settings and copy the related key.

### Stripe Connect (artist onboarding — multi-artist instances only)

Stripe Connect lets you route fiat payments directly to each artist's Stripe account, with the instance's commission automatically withheld as an `application_fee`. **It is not required for single-artist instances.**

1. Make sure you have a Stripe account with the **Connect** features enabled (*Settings > Connect settings* in the dashboard).
2. From the TuneCamp Admin panel → artist → use the following endpoints (managed via the Admin UI):
   - `POST /api/admin/artists/:id/stripe-connect/onboard` — creates or reuses an Express Stripe account for the artist and returns the KYC onboarding link to send to the artist.
   - `GET /api/admin/artists/:id/stripe-connect/status` — checks `chargesEnabled`, `payoutsEnabled`, `detailsSubmitted`.
   - `DELETE /api/admin/artists/:id/stripe-connect` — disconnects the account (does not delete it on Stripe).
3. The artist completes KYC directly on the Stripe-hosted page.
4. As long as `chargesEnabled = false`, the artist's checkouts fall back to the instance account.
5. **No new environment variable required**: onboarding reuses the already-configured `STRIPE_SECRET_KEY`.

### MoonPay (alternative Onramp)
1. Sign up at [MoonPay Dashboard](https://dashboard.moonpay.com/).
2. Create a new API Key for the Onramp integration on the **Base** network.

---

## 2. Artificial Intelligence

### OpenRouter (Metadata & Recommendations)
1. Go to [OpenRouter.ai](https://openrouter.ai/).
2. Create an account and go to the *Keys* section.
3. Create a new API key.
4. (Optional) If you want to use free models, make sure to set `openrouter_model` to `openrouter/free` (the default behavior).

---

## 3. Cloud Storage

### Google Drive (Streaming & Import)
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project.
3. Enable the **Google Drive API**.
4. Go to *APIs & Services > Credentials*.
5. Create an **OAuth 2.0 Client ID** (type "Web application").
6. Add the authorized redirect URIs: `https://your-domain.com/api/storage/gdrive/callback`.
7. Copy the `Client ID` and the `Client Secret`.

---

## 4. Messaging & Social

### Telegram Bot (Quick Ingestion)
1. Search for [@BotFather](https://t.me/BotFather) on Telegram.
2. Send the `/newbot` command and follow the instructions.
3. Copy the **API Token** provided at the end.
4. For security, use your own user ID as `TUNECAMP_TELEGRAM_MASTER_ID`. You can find it using [@userinfobot](https://t.me/userinfobot).

---

## 5. Peer-to-Peer (P2P)

### Soulseek (Search & Download)
1. No API Key is needed, but a standard Soulseek account is required.
2. Download the original Soulseek client or register through a compatible client.
3. Use your `Username` and `Password` in the TuneCamp settings.

---

## 6. Server Configuration

All of these keys can be configured in two ways:

### Method A: `.env` file (recommended for development)
Create a `.env` file in the project root:
```env
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
OPENROUTER_API_KEY=sk-or-v1-...
TUNECAMP_GDRIVE_CLIENT_ID=...
TUNECAMP_GDRIVE_CLIENT_SECRET=...
TUNECAMP_TELEGRAM_BOT_TOKEN=...
TUNECAMP_TELEGRAM_MASTER_ID=...
SLSK_USER=...
SLSK_PASS=...
```

### Method B: Admin Dashboard (recommended for production)
Many of these keys can be entered directly in TuneCamp's Admin interface under the **Settings** section. Values entered here take precedence over the `.env` file and are stored in the SQLite database.

---

## 7. Model Context Protocol (MCP)

If you want to connect an external AI chatbot (e.g. Claude Desktop) to TuneCamp, you can use the built-in MCP server. Clients authenticate with per-user personal tokens (Bearer `tc_...`) that can be generated from your Profile in the webapp.
For the setup guide and how to use the bridge script, see [mcp-setup-guide.md](./mcp-setup-guide.md).

---

## Verification
After entering the keys, restart the TuneCamp server. Check the startup logs to make sure the services (Telegram, GDrive) are initialized correctly without authentication errors.
