# Becoming an Artist & Sales Verification (`can_sell`)

> **Historical Note:** This document previously described the "community mode" (`mode: community`), where every registration automatically created a publishing artist profile. That model has been removed: open publishing in Funkwhale style does not make sense on TuneCamp, where publishers receive payments, thus requiring a direct admin–artist relationship. The request flow below and the `can_sell` sales gate remain.

## The Model: Curated Showcase

The instance is the store of an artist or a label.

- Public registrations (if enabled) create pure **listeners**: they listen, buy, create playlists, comment, but do not publish.
- Publishing (uploading, releases, sale items, social posts) requires a **Curator or higher** account with a linked artist profile (see [ROLES.md](ROLES.md)).
- Everything for sale has been placed there by the instance administrator, who is responsible for it.

## Artist Profile Request

To reduce friction in the listener → artist path:

1. The listener opens **Profile → Settings → Become an Artist** and clicks *Request Artist Profile* (`POST /api/users/me/artist-request`).
2. The admin sees the "Artist requested" badge in **Admin → Users** and approves it with a click (`POST /api/admin/system/users/:id/approve-artist`): an artist is created with the user's name and linked to their account. **The account keeps its `user` role** — the artist-profile link is what grants publishing rights (this is the "Listener-Artist" state; see [ROLES.md](ROLES.md)), so no Curator promotion happens. Sales remain disabled. (With **Listener Self-Publish** enabled in Admin → Settings, this approval step is skipped and the request is auto-approved.)
3. The admin enables sales separately once they have verified the artist.

Approval is exactly the "direct admin–artist contact" that publishing requires: approving means taking responsibility for that artist on your instance.

## Sales = Verified Artist (`can_sell`)

Sales are not a property of the instance but **of the individual artist**, via the `can_sell` flag on the `artists` table:

- `can_sell = 1` (default for artists created manually before the feature): prices and checkout work normally.
- `can_sell = 0` (default for profiles approved from requests): the artist publishes free content only.

Enforcement is **server-side**, not just UI:

1. **Stripe Checkout** (`POST /api/payments/stripe/create-session`) and **on-chain verification** (`POST /api/payments/verify`) reject items from disabled artists with a 403.
2. **Creating/editing releases** (`POST/PUT /api/releases`, `PUT /api/admin/releases/:id`): price fields are zeroed out if the artist cannot sell, so the catalog never shows a "Buy" button that checkout would reject.
3. The toggle can **only be modified by a Manager/Root Admin** ("Sales enabled" in the artist editor) — an artist cannot self-enable.

Rationale: on a platform that sells music, open uploads without verification is a legal risk (selling content for which the uploader does not own the rights, chargebacks, DMCA). The verification gate shifts responsibility to an explicit admin decision, as is already done for "grey" ingestion plugins (Soulseek/Torrent, disabled by default).

## Migration Notes

- Existing artists have `can_sell = 1` (migration uses DEFAULT 1): nothing changes for current instances.
- The `mode` setting is no longer read anywhere: instances that had it set to `community` return to standard behavior in the next release. Auto-created artist profiles remain linked, and those accounts (role `user`) can publish through that artist-profile link (the Listener-Artist model) — no Curator promotion is required.
- The "Public Registration" toggle in admin settings now works correctly: it previously wrote `allowPublicRegistration` while registration checked the legacy `allowRegistration` key (the check now reads both).
