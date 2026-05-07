# UX Patterns for Decentralized Music

## 🌐 Managing Federation Status
- **Clarity of Reach**: Users must know if a track is local, cached from GunDB, or available via ActivityPub.
- **Visual Cues**:
    - `🏠 LOCAL`: Hosted on the current node.
    - `🌩️ P2P`: Found via GunDB (roaming).
    - `🐘 FEDI`: Discovered via ActivityPub/Fedify.
- **Action Feedback**: When "publishing" a release, show a progress log of federation events (e.g., "Signed by GunDB", "Broadcasted to 12 Fediverse instances").

## 🔑 Crypto-UX without Friction
- **Lazy Auth**: Allow browsing and searching without login. Only prompt for SEA keys when the user wants to Like, Comment, or Purchase.
- **Key Recovery**: Proactively suggest backing up SEA keys (GunDB) as a "Seed Phrase" or "Identity File".
- **Roaming Login**: The "Login with Zen" flow should be as simple as pasting a key or scanning a QR code from a mobile app.

## 📦 Progressive Scanning
- **Feedback Loop**: When a user adds music to `musicDir`, show a real-time progress bar of the scan.
- **Metadata Edge Cases**: Clearly flag tracks missing ARTIST or ALBUM tags and provide a 1-click "Quick Fix" editor.

## 📱 Mobile-First Subsonic
- **Subsonic Discovery**: Provide a "Mobile Setup" page with a QR code containing the Subsonic URL and Token (following `subsonic://` or standard URL schemes) to avoid manual typing.
- **Client Recommendations**: Explicitly link to known-working clients (Amperfy, Play:Sub, Symfonium).
um).
