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
The **Listener** is the base role for registered users.

### Capabilities:
- **Streaming:** Access music via the web player or Subsonic-compatible apps.
- **Collection:** Purchase albums, manage favorites and playlists.
- **Social Interaction:** Comment and follow artists.

### Listener + Artist Profile ("Community Artist")
A Listener can have an **artist profile linked** to their account. This happens in three ways:
1. The admin links one manually (Admin → Users → Edit).
2. The listener requests one from **Profile → Settings → Become an Artist** and the admin approves it with one click from the Users panel.
3. In **community mode** (`mode: community`), every new registration gets an artist profile automatically.

With a linked artist profile the user can upload music and manage their own releases — reads and writes stay **owner-scoped** (public content + their own). Selling is controlled separately by the per-artist `can_sell` flag, which only Managers/Root Admin can enable ("Sales enabled" in the artist editor). See [community-mode.md](community-mode.md).

---

## Permission Matrix (Summary)

| Capability | Instance Owner | Manager | Curator | Listener + Artist | Listener |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Modify Site Settings | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage Users | ✅ | ✅ (view) | ❌ | ❌ | ❌ |
| Edit Others' Content | ✅ | ✅ | ✅ | ❌ | ❌ |
| Upload Music | ✅ | ✅ | ✅ | ✅ (own only) | ❌ |
| Sell Music | ✅ | ✅ | ✅ | only if `can_sell` enabled by admin | ❌ |
| Access Server Keys | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage Federation | ✅ | ✅ | ❌ | ❌ | ❌ |

---

## First Login: Setup Wizard

When a user logs in and their account still has the default password (`tunecamp`), the web app blocks access behind a setup wizard until the password is changed. The backend signals this via the `mustChangePassword` flag returned by `POST /api/auth/login` (computed by `isDefaultPassword` in `auth.service.ts`).

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
