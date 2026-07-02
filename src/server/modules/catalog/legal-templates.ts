/**
 * Built-in Terms of Service and Privacy Policy templates.
 *
 * Every TuneCamp instance is operated independently: the instance operator —
 * not the TuneCamp project — is the service provider, content host, seller of
 * record for Store purchases, and data controller. These templates give a new
 * instance a sensible legal baseline out of the box; operators can replace
 * them entirely from Admin → Settings → Legal Pages (settings keys
 * `legalTerms` / `legalPrivacy`), and should have them reviewed by a lawyer
 * for their own jurisdiction.
 *
 * Markdown, rendered client-side by the webapp's renderMarkdown + DOMPurify.
 */

const contactLine = (contactEmail: string) =>
    contactEmail
        ? `You can reach the operator of this instance at [${contactEmail}](mailto:${contactEmail}).`
        : `Contact details for the operator are available on this instance's About or Support page.`;

export function buildDefaultTerms(siteName: string, contactEmail: string): string {
    return `# Terms of Service

**${siteName}** is an independently operated instance of [TuneCamp](https://github.com/scobru/tunecamp), an open-source, self-hosted music platform. These terms govern your use of this instance only. The TuneCamp project and its contributors do not operate this instance, do not host its content, and are not a party to these terms.

${contactLine(contactEmail)}

## 1. The Service

This instance provides music streaming, artist pages, playlists, social features federated over ActivityPub, and — where enabled — direct sales of digital music from artists to listeners. The service is provided by the operator of this instance ("the Operator").

## 2. Accounts

You are responsible for keeping your credentials secure and for all activity under your account. The Operator may suspend or remove accounts that violate these terms or applicable law.

## 3. Your Content and Copyright

By uploading or publishing content (music, artwork, text, posts) you declare and warrant that you own the necessary rights to it, or hold a valid licence covering its distribution through this instance, and you indemnify the Operator against third-party claims arising from your content.

You retain all rights to your content. You grant the Operator only the technical, non-exclusive licence needed to store, transcode, stream, and — via ActivityPub federation and public playlists — distribute it as part of operating the service.

## 4. Reporting Infringing or Illegal Content

If you believe content on this instance infringes your rights or is illegal, use the built-in report function on the release page or contact the Operator directly. Reports are reviewed and actionable content is removed or disabled ("notice and action"). Repeat infringers may lose their account.

## 5. Purchases and Memberships

Where the Store is enabled, sales are concluded between you and the Operator (or the artist, where indicated) — not with the TuneCamp project. Prices, payment processing (e.g. Stripe or on-chain checkout), and delivery of digital content are described at checkout.

**Right of withdrawal (EU consumers):** for digital content supplied immediately, you expressly consent to performance beginning at purchase and acknowledge that you thereby lose the right of withdrawal once the download or streaming access has been delivered. If a purchase fails or content is not delivered, contact the Operator for a remedy.

## 6. Third-Party Services

Optional features may rely on third-party services (metadata providers, scrobbling to Last.fm or ListenBrainz, streaming fallback from external platforms, cloud storage). These are subject to those services' own terms, and are enabled at the Operator's discretion and responsibility.

## 7. Federation

Public content and interactions may be shared with other servers in the Fediverse via ActivityPub, and public catalogs may be fetched by peer TuneCamp instances. Content that leaves this instance is subject to the policies of the receiving servers.

## 8. Disclaimer and Liability

The service is provided **"as is" and "as available"**, without warranties of any kind, to the extent permitted by law. The underlying TuneCamp software is distributed under the MIT licence without any warranty. Nothing in these terms limits liability that cannot be limited by law.

## 9. Changes

The Operator may update these terms; material changes will be announced on this instance. Continued use after changes take effect constitutes acceptance.
`;
}

export function buildDefaultPrivacy(siteName: string, contactEmail: string): string {
    return `# Privacy Policy

This policy describes how **${siteName}**, an independently operated [TuneCamp](https://github.com/scobru/tunecamp) instance, processes personal data. The data controller is the operator of this instance ("the Operator") — not the TuneCamp project.

${contactLine(contactEmail)}

## 1. Data We Process

- **Account data:** username, password (stored as a salted hash), optional email address, profile information you choose to add.
- **Usage data:** server logs including IP addresses and requested URLs, kept for security and troubleshooting; listening history and favourites where those features are used.
- **Purchase data:** when the Store is enabled, order details and payment status. Card details are handled by the payment processor (e.g. Stripe) and never stored on this instance.
- **Content you publish:** uploads, posts, comments, and public playlists are visible to other users and — via federation — to other servers.

## 2. Cookies and Local Storage

This instance uses only technical storage: an authentication token and interface preferences (theme, player state) kept in your browser. No advertising, profiling, or third-party tracking cookies are set by default, so no cookie consent banner is required.

## 3. Legal Bases and Purposes

Data is processed to provide the service you request (contract), to keep the service secure (legitimate interest), to complete purchases (contract and legal obligations, e.g. tax records), and — for optional features you enable, such as scrobbling — on the basis of your consent, which you can withdraw at any time in your settings.

## 4. Sharing and Recipients

- **Payment processors** (e.g. Stripe) when you make a purchase.
- **Scrobbling services** (Last.fm, ListenBrainz) only if you connect them in your settings.
- **Other servers (federation):** public activities, posts, and catalog data are distributed to Fediverse servers and peer instances that follow or fetch them; deletions are propagated but cannot be guaranteed on remote servers.

Data is not sold or used for advertising.

## 5. Retention

Account data is kept while your account exists and deleted when the account is removed, except where retention is legally required (e.g. purchase records). Server logs are rotated on a short schedule.

## 6. Your Rights

Under the GDPR (where applicable) you have the right to access, rectify, and erase your data, to data portability, to restrict or object to processing, and to withdraw consent. Contact the Operator to exercise these rights. You also have the right to lodge a complaint with your local supervisory authority (in Italy, the Garante per la Protezione dei Dati Personali).

## 7. Changes

The Operator may update this policy; material changes will be announced on this instance.
`;
}
