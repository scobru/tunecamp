# Roles & Permissions in TuneCamp

This document describes the different roles within a TuneCamp instance, their capabilities, and their associated security constraints.

TuneCamp uses a Role-Based Access Control (RBAC) system to ensure that each user can only operate within the scope of their assigned role.

---

## 1. Instance Owner (Root Admin)
The **Instance Owner** (or Root Admin) is the primary system administrator. This typically corresponds to the first user created (ID 1). It has the highest level of authority.

### Exclusive Capabilities:
- **Global Site Management:** Modify the site name, description, public URL, logos, and background images.
- **Web3 Configuration:** Set wallet addresses for USDC/USDT payments and NFT contracts.
- **Full User Management:**
  - Create and manage all roles.
  - Reset passwords for any user.
  - Delete accounts (except their own).
- **System Identity:** Access to cryptographic keys and server-level maintenance tasks.

---

## 2. Manager (Full Admin)
The **Manager** has broad administrative powers to oversee the community and content without full server control.

### Capabilities:
- **User Monitoring:** Can view the list of registered users.
- **Federated Network:** Manage ActivityPub follows and synchronization.
- **Content Moderation:** Manage posts and releases across the instance.
- **Artist Support:** Can operate as any artist they are assigned to.

---

## 3. Curator (Super User / Library Management)
The **Curator** is a specialized role focused on library quality and content organization.

### Capabilities:
- **Global Visibility:** Can view all content (including private/drafts) to assist in curation.
- **Library Management:** Can edit metadata, cover art, and organization for any track or album.
- **Maintenance:** Help maintain the library structure and correct errors.

---

## 4. Listener (Standard User)
The **Listener** is the base role for users who consume music and interact with the platform. Listeners **cannot publish**: TuneCamp is designed for artists who receive payments themselves, or labels with a direct relationship to their artists — so uploading tracks, creating releases, selling store assets, and social posting are reserved to Curators and Managers, who have that direct line to the artist.

### Capabilities:
- **Listening & Collection:** Stream music via the web player or Subsonic-compatible apps, purchase content, and manage favorites.
- **Social Interaction:** Create playlists, comment, follow artists, and manage their own profile.

### Becoming an Artist
An artist account is a **Curator** (or higher) linked to an artist profile. There are two paths:
1. The admin promotes a user to Curator and links an artist profile manually (Admin → Users → Edit).
2. The listener requests one from **Profile → Settings → Become an Artist**; when the admin approves it from the Users panel, the account is **promoted to Curator** and a non-sellable artist profile is created and linked. The approval is the direct admin–artist contact that publishing requires.

Selling is controlled separately by the per-artist `can_sell` flag, which only Managers/Root Admin can enable ("Sales enabled" in the artist editor).

---

## Permission Matrix (Summary)

| Capability | Instance Owner | Manager | Curator | Listener |
| :--- | :---: | :---: | :---: | :---: |
| Modify Site Settings | ✅ | ❌ | ❌ | ❌ |
| Manage Users | ✅ | ✅ (view) | ❌ | ❌ |
| Edit Others' Content | ✅ | ✅ | ✅ | ❌ |
| Upload Music / Create Releases | ✅ | ✅ | ✅ (with artist link) | ❌ |
| Sell Music / Store Assets | ✅ | ✅ | ✅ (with artist link + `can_sell`) | ❌ |
| Social Posts (ActivityPub) | ✅ | ✅ | ✅ (with artist link) | ❌ |
| Access Server Keys | ✅ | ❌ | ❌ | ❌ |
| Manage Federation | ✅ | ✅ | ❌ | ❌ |

---

## First Login: Setup Wizard

When a user logs in and their account password is the temporary sentinel `tunecamp`, the web app blocks access behind a setup wizard until the password is changed. The backend signals this via the `mustChangePassword` flag returned by `POST /api/auth/login` (computed by `isDefaultPassword` in `auth.service.ts`, which checks for the `tunecamp` sentinel).

> Note: the bootstrap admin created on first run uses `admin`/`admin` (or `TUNECAMP_ADMIN_USER`/`TUNECAMP_ADMIN_PASS`), **not** `tunecamp` — so that account is not forced through the wizard automatically; change its password manually after the first login. The wizard fires for accounts an admin has reset to `tunecamp` (see below).

What the wizard shows depends on the role:

- **Instance Owner (Root Admin)** — two steps:
  1. **Security** — replace the default password.
  2. **Identity** — set the instance's site name and description. This step can be skipped and configured later under Admin Settings.
- **All other roles** (Manager, Curator, Listener) — a single **Security** step to replace the temporary password. The Identity step is not shown because site settings are exclusive to the Instance Owner (see Permission Matrix above).

A Root Admin can force any user through the password step at their next login by resetting that user's password to `tunecamp` (`PUT /api/admin/system/users/:id/password`).

---

## Security Verification

TuneCamp implements these controls at the API level:
1. **JWT Middleware:** Every authenticated request verifies the role (`isAdmin`) and identity (`userId`).
2. **Content Ownership:** Modification APIs (`PUT`, `DELETE`) verify that `owner_id` (referencing `admin.id`) matches the requester's `userId`, unless the requester is an administrator. The system includes self-healing maintenance to ensure all content is correctly owned by a valid administrator.
3. **SSRF Protection:** Network operations (ActivityPub follow) are protected against SSRF attacks via URL validation.
4. **Sanitization:** File names and metadata are sanitized to prevent Path Traversal and XSS attacks.
5. **Quota Check:** During upload, the user's available disk space is dynamically verified before accepting files.
