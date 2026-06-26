# Social Features: Posts & Comments

TuneCamp includes a social layer that allows artists to engage with their fans and users to provide feedback on tracks.

## 1. Artist Posts

Admins can publish posts to their instance's feed.
- **Content**: Supports text, links, and embedded tracks.
- **Federation**: Posts are automatically federated via **ActivityPub**, making them visible to followers on other TuneCamp instances or Mastodon/Pleroma.
- **Management**: Admins use the "Community" tab in the dashboard to create and delete posts.

## 2. Comments System

Users can leave comments on individual tracks to provide feedback or discuss the music.
- **Authentication**: Commenting requires a registered user account.
- **Moderation**:
  - Admins can delete any comment.
  - Users can delete their own comments.
- **API**:
  - `GET /api/comments/:trackId`: Fetch all comments for a track.
  - `POST /api/comments`: Add a new comment.

## 3. Broadcasting & Engagement

The platform follows a **Broadcaster** model for social features. Instead of maintaining a heavy internal social timeline (like Mastodon), TuneCamp focuses on broadcasting to the Fediverse and receiving engagement (comments/replies). 
- **Implementation**: Managed by the social manager (`src/server/core/managers/social.ts`, backed by `social.repository.ts`); posts are exposed through `src/server/routes/network/activitypub.ts` and comments through `src/server/routes/network/comments.ts`. The internal following and timeline ingestion features have been pruned to keep the system lightweight and focused on music.

## 4. Federated Identity

Each **artist** in TuneCamp is an **ActivityPub Actor** (a "Person") — federation is at the artist level, not per user account.
- Profile: `https://your-domain.com/actor/@username`
- Outgoing activities are signed with the artist's **RSA 4096-bit keypair**, generated automatically per artist.

> Note: earlier versions tied identity to Zen (SEA) keypairs. That has been removed —
> authentication is username/password (JWT) and federation signing uses RSA keys.
> See [FEDERATION.md](FEDERATION.md).

## 5. Release Reporting & Moderation

Users and guests can report releases that infringe copyrights, contain inappropriate content, or violate community guidelines.
- **Reporting**: Clicking the flag ("Flag") button on any release details page opens the `ReportReleaseModal` where users can specify a reason (Copyright, Inappropriate Content, Spam, Other) and provide detailed comments.
- **Moderation**: Instance Owners and Managers can access the "Reports" panel in the Admin dashboard (`AdminReportsPanel`) to review reports, dismiss them, or delete the offending releases.
- **API Endpoints**:
  - `POST /api/releases/:id/report`: Submit a report for a release.
  - `GET /api/admin/reports`: List all active reports.
  - `DELETE /api/admin/reports/:id`: Resolve / dismiss a report.

