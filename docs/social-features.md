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

## 3. Engagement Feed

The main "Feed" combines local artist posts with social interactions (likes, shares) from the federated network.
- **Implementation**: Managed by the `SocialService` and routes in `src/server/routes/posts.ts` and `comments.ts`.

## 4. Federated Identity

Every user in TuneCamp is also an **ActivityPub Actor**.
- Profile: `https://your-domain.com/actor/@username`
- Social interactions are cryptographically signed using the user's Zen keypair.
