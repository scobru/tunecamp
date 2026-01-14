# Tunecamp Unlock Codes - Beginner's Guide

## 📋 Overview

The Unlock Codes system protects your release downloads with unique codes, validated in a **decentralized** way using GunDB and public peers. No backend server required!

**⚠️ Important - Self-Hosting Required**: The code generation tools must be run locally on your machine where you have access to the Tunecamp source code. If you deploy only the static HTML output (e.g., to Vercel, Netlify, GitHub Pages), you won't be able to generate new codes from the deployed site - it's just static HTML.

---

## 🚀 Quick Start

### 1. Install dependencies

```bash
cd tunecamp
npm install gun
```

### 2. Generate a SEA key pair (recommended)

To save codes in your private GunDB space instead of public:

```bash
npx ts-node src/tools/generate-sea-pair.ts
```

This creates `gundb-keypair.json` with your authentication keys. **Keep this file secret!**

### 3. Generate codes for your release

**With authentication (private space - recommended):**
```bash
npx ts-node src/tools/generate-codes.ts my-release --count 20 --keypair ./gundb-keypair.json
```

**Without authentication (public space - for testing only):**
```bash
npx ts-node src/tools/generate-codes.ts my-release --count 20
```

Example output (with authentication):
```
🔐 Tunecamp Unlock Codes Generator
================================
Release: my-release
Count: 20
🔒 Using authenticated private space

Connecting to GunDB peers...
Authenticating with SEA pair...
✅ Authenticated successfully

Generating 20 codes...
  Progress: 20/20

Syncing to peers...

✅ Generated 20 codes:
──────────────────────────────────────────────────
    1. ABCD-1234-EFGH
    2. JKLM-5678-NPQR
    3. STUV-9ABC-WXYZ
    ...
──────────────────────────────────────────────────

🔒 Codes stored in your private GunDB space
   Only you can access and manage these codes
```

### 4. Configure the release

In your `release.yaml`:

**For private space (with keypair - recommended):**
```yaml
title: "My Release"
date: "2024-01-15"
download: codes   # <-- Set 'codes' as download mode
unlockCodes:
  enabled: true
  namespace: tunecamp  # Optional, default: tunecamp
  publicKey: "your-public-key-here"  # <-- REQUIRED for private space!
```

**⚠️ Important**: When using `--keypair` to generate codes, you **MUST** add the `publicKey` to your `release.yaml`. This tells the frontend where to find your codes in GunDB.

To get your public key, check your `gundb-keypair.json` file and copy the `pub` field value.

**For public space (testing only):**
```yaml
title: "My Release"
date: "2024-01-15"
download: codes
unlockCodes:
  enabled: true
  namespace: tunecamp
  # No publicKey needed for public space
```

### 5. Generate the site

```bash
npm run build
tunecamp build ./my-catalog -o ./output
```

---

## 📖 How It Works

### Private Space (Recommended)

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    Artist    │────>│    GunDB     │<────│     Fan      │
│ Generate codes│    │ Public Peers │     │ Validate code│
│(authenticated)│    │(private space)│    │(using pubKey)│
└──────────────┘     └──────────────┘     └──────────────┘
       │                                         ↑
       │         publicKey in release.yaml ──────┘
       │
       └──> gundb-keypair.json (keep secret!)
```

**Workflow:**

1. **Generate key pair**: Artist generates SEA pair with `generate-sea-pair.ts`
2. **Generate codes**: Artist generates codes authenticating with SEA pair
3. **Private storage**: Codes (hashed) are saved in artist's private GunDB space
4. **Configure release**: Artist adds `publicKey` to `release.yaml` (so frontend knows where to look!)
5. **Synchronization**: Public peers sync the data
6. **Validation**: Fan enters code on release page
7. **Verification**: Frontend uses `publicKey` to read from artist's space via `gun.user(publicKey)`
8. **Download**: If valid, download is unlocked

**Private space advantages:**
- Only you can modify/manage codes
- Better security and control
- Codes are isolated in your user space

**⚠️ Critical**: Without `publicKey` in `release.yaml`, the frontend cannot find codes stored in private space!

---

## ⚙️ CLI Options

### Generate SEA pair

```bash
npx ts-node src/tools/generate-sea-pair.ts [options]

Options:
  --output <file>   Output file (default: ./gundb-keypair.json)
  --help, -h        Show help
```

### Generate codes

```bash
npx ts-node src/tools/generate-codes.ts <slug> [options]

Options:
  --count <n>       Number of codes (default: 10)
  --downloads <n>   Max downloads per code (default: 1)
  --expires <days>  Days until expiration (optional)
  --keypair <file>  File with SEA pair for private space (recommended)
  --output <file>   Save codes to file
  --namespace <ns>  GunDB namespace (default: tunecamp)
```

### Examples

```bash
# 1. Generate SEA pair (once only)
npx ts-node src/tools/generate-sea-pair.ts

# 2. Generate 50 codes in private space
npx ts-node src/tools/generate-codes.ts album-2024 --count 50 --keypair ./gundb-keypair.json

# 3. 100 codes with 3 downloads each, 30-day expiration (private space)
npx ts-node src/tools/generate-codes.ts album-2024 --count 100 --downloads 3 --expires 30 --keypair ./gundb-keypair.json

# 4. Save codes to file
npx ts-node src/tools/generate-codes.ts album-2024 --count 50 --keypair ./gundb-keypair.json --output codes.txt

# 5. Public space (for testing only, not recommended)
npx ts-node src/tools/generate-codes.ts album-2024 --count 50
```

---

## 🔧 Advanced Configuration

### Public Key (Required for Private Space)

When using `--keypair` to generate codes, you must provide the public key so the frontend can read the codes:

```yaml
# release.yaml
unlockCodes:
  enabled: true
  publicKey: "abc123..." # Copy from gundb-keypair.json "pub" field
```

**Where to find your public key:**
```json
// gundb-keypair.json
{
  "pub": "abc123...",  // <-- This is your publicKey
  "priv": "...",       // Keep secret!
  "epub": "...",
  "epriv": "..."       // Keep secret!
}
```

### Custom Peers

If you have your own GunDB relay (e.g., shogun-relay):

```yaml
# release.yaml
unlockCodes:
  enabled: true
  publicKey: "your-public-key"
  peers:
    - "https://your-relay.com/gun"
    - "https://gun-manhattan.herokuapp.com/gun"
```

### Multiple Namespaces

To separate different catalogs:

```yaml
# release.yaml
unlockCodes:
  enabled: true
  namespace: my-unique-catalog
  publicKey: "your-public-key"  # Still required for private space!
```

---

## 🎨 UI Customization

The unlock form is styled in `style.css`. Modify these classes:

- `.unlock-codes-section` - Main container
- `.unlock-header` - Title and icon
- `.code-input-group` - Input + button
- `.unlock-success` - Success state
- `.unlock-error` - Error message

---

## ❓ FAQ

### Are codes secure?
Yes! Codes are hashed with SHA-256 before being saved. Only the hash is visible on GunDB. With private space, data is also encrypted.

### Why use private space?
Private space allows you to:
- Control who can modify codes (only you)
- Encrypt data in your personal space
- Better manage your codes security

### What happens if peers are offline?
GunDB uses localStorage as cache. If you've already visited the page, it works offline.

### Can I use my own relay?
Yes! Add your URL in the `peers` configuration field.

### Can a code be used by multiple people?
Depends on `--downloads`. With `--downloads 3`, the code works for 3 downloads.

### Do I need to regenerate the SEA pair?
Only if:
- You lost the `gundb-keypair.json` file
- The file was compromised
- You want to create a new GunDB account

**Note**: If you regenerate the pair, old codes won't be accessible anymore!

---

## 🆘 Troubleshooting

**"GunDB not loaded"**
- Verify that the GunDB CDN is accessible
- Check browser console for errors

**"Invalid code"**
- Verify the code was generated for that release
- Codes are case-insensitive

**"Code already used"**
- The code has reached its download limit
- Generate new codes if needed

---

## 📁 Reference Files

| File | Description |
|------|-------------|
| `src/tools/generate-codes.ts` | CLI to generate codes |
| `src/tools/generate-sea-pair.ts` | CLI to generate SEA key pair |
| `templates/default/assets/unlock-codes.js` | Browser-side GunDB client |
| `templates/default/release.hbs` | Template with unlock UI |
| `templates/default/assets/style.css` | CSS styles for UI |
