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
- **Content Moderation:** Manage posts and releases across the instance. Can review, resolve, or dismiss copyright and content reports from the Reports dashboard (Admin → Reports).
- **Artist Support:** Can operate as any artist they are assigned to.

### Release Reports (copyright & content)

Any logged-in user can report a release via `POST /api/releases/:id/report`. The payload should include a `reason` string (e.g. `"copyright"`, `"inappropriate"`).

Managers and Root Admins see pending reports at **Admin → Reports** (`GET /api/admin/reports`). Each report shows the release, the reporting user, and the reason. To resolve or dismiss a report: `DELETE /api/admin/reports/:id`.

Reports are also surfaced in the admin panel UI — a badge on the Reports menu item counts unresolved items.

---

## 3. Curator (Super User / Library Management)
The **Curator** is a specialized role focused on library quality and content organization.

### Capabilities:
- **Global Visibility:** Can view all content (including private/drafts) across the whole library via `VIEW_PRIVATE_LIBRARY` — to triage, review, and report.
- **Upload:** Can upload tracks and create albums/releases into the library via `canWriteContent` (it holds `MANAGE_PRIVATE_LIBRARY`), **even without a linked artist profile**. This is what distinguishes a Curator from a plain Listener. Publishing a release *attributed to an artist identity* still requires a linked artist profile (`canPublishContent`/`artistId`), same as everyone else.
- **Library Management (own content only):** Can edit metadata, cover art, and organization for content it owns (`owner_id` matches, e.g. its own uploads).

### What a Curator deliberately *cannot* do:
- **Edit or delete other owners' content.** Per-item writes are owner-scoped, enforced by `VisibilityGuardian.canManageItem`; cross-owner write requires Manager/Root Admin (`MANAGE_ALL_CONTENT`). The global-visibility capability lets a Curator *see* everything to triage and report, not mutate it.
- **Manage users, site settings, or federation** — those are Manager/Root-Admin powers.
- **Moderate community posts (the Board).** Deleting another user's Board message is a Manager/Root-Admin action; a Curator can only delete its own posts.

> **Naming caveat:** the capability is called `MANAGE_PRIVATE_LIBRARY`, but for a Curator it grants global *read visibility* plus write of its *own* content — not cross-owner write. Don't read the name as "can manage everyone's library".

---

## 4. Listener (Standard User)
The **Listener** is the base role for users who consume music and interact with the platform.

### Capabilities:
- **Listening & Collection:** Stream music via the web player or Subsonic-compatible apps, purchase content, and manage favorites.
- **Social Interaction:** Create playlists, comment, follow artists, and manage their own profile.

---

## 5. Listener-Artist (Listener with an artist profile)
A **Listener-Artist** is a standard `user`-role account that has been linked to an artist profile by an admin. The role stays `user` — **no promotion to Curator happens** — but the artist-profile link grants publishing rights via `canPublishContent`. This is the state a listener enters after their artist request is approved.

### Additional capabilities over plain Listener:
- **Upload tracks** and create albums/releases under their own artist profile.
- **ActivityPub posts** (release announcements) under their artist identity.
- **Storage quota** assigned at approval time (configurable via Admin → Settings → `listenerSelfPublishQuota`).

### What they still cannot do:
- Edit or manage other users' content (no library-wide write access).
- Access the admin panel.
- Sell content (blocked at checkout server-side) — see `can_sell` below.

### Paths to become a Listener-Artist:
1. **Admin-initiated:** Admin links an artist profile to an existing user manually (Admin → Users → Edit → Artist Profile).
2. **Self-request:** The listener requests one from **Profile → Settings → Become an Artist**. The admin approves from the Users panel (`POST /api/admin/system/users/:id/approve-artist`): an artist profile is created under their username, `can_sell` is set to `false`, and the storage quota is applied. The role stays `user`.

### Self-Publish mode (admin auto-approval flag)
The **Listener Self-Publish** toggle in **Admin → Settings** (setting `listenerSelfPublish`) removes the admin from the loop entirely. When it is **on**:

- **Artist requests are auto-approved.** `POST /api/users/me/artist-request` immediately creates the artist profile (applying `listenerSelfPublishQuota`) and returns `autoApproved: true` with a fresh token — no "Artist requested" badge to review. The role still stays `user` and `can_sell` still defaults to `false`.
- **Releases are auto-published.** A self-publishing artist's promotion (`POST /api/lifecycle/promote/:id`) skips the curation queue and goes straight to `released` instead of `pending`, so the release never waits for admin approval.

When the flag is **off** (default), both steps require explicit admin action: the request sits as a pending badge in **Admin → Users**, and the release sits in the **Curation Queue** (`status = 'pending'`) until a Manager/Root Admin approves it (`POST /api/lifecycle/approve/:id`).

The companion `listenerSelfPublishQuota` sets the default physical-upload quota granted at auto-approval (MB; default `1024` = 1 GB, `0` = unlimited; still adjustable per user afterwards).

---

## 6. The `can_sell` flag (per-artist sales gate)
`can_sell` is a flag on the **artist profile** (not on the user account). It controls whether buyers can complete a purchase for that artist's content. It is independent of the user's role.

| `can_sell` | Effect |
| :--- | :--- |
| `0` (default after approval) | Stripe checkout, crypto on-ramp, and NFT mint are **refused** server-side for this artist's items. The Buy button may be hidden client-side, but the server enforces the block regardless. |
| `1` | Full sales enabled — Stripe (direct charge to artist's connected account if `stripe_account_id` is set, otherwise instance account), crypto, and NFT mint all work. |

**How `can_sell` gets enabled:**
- **Artist with a linked user account:** toggle "Sales enabled" in **Admin → Users → Edit User** (the artist section of that dialog). The control in Admin → Library → Artists → Edit is read-only for linked artists ("Managed from the linked user's Edit User dialog").
- **Artist without a linked user account (library-only):** toggle "Sales enabled" in **Admin → Library → Artists → Edit**.
- **Automatic via Stripe Connect:** When an artist completes Stripe Connect onboarding and `charges_enabled` becomes `true` on their connected account, the `account.updated` webhook automatically sets `can_sell = 1`. If Stripe later disables charges, it reverts to `0`.

---

## Permission Matrix (Summary)

| Capability | Root Admin | Manager | Curator | Listener-Artist | Listener |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Modify Site Settings | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage Users | ✅ | ✅ (view) | ❌ | ❌ | ❌ |
| Edit Others' Content | ✅ | ✅ | ❌ (own only) | ❌ | ❌ |
| Upload Music / Create Releases | ✅ | ✅ | ✅ (with artist link) | ✅ (own profile only) | ❌ |
| Sell Music / Store Assets | ✅ | ✅ (with `can_sell`) | ✅ (with artist link + `can_sell`) | ✅ (with `can_sell`) | ❌ |
| Social Posts (ActivityPub) | ✅ | ✅ | ✅ (with artist link) | ✅ (own profile only) | ❌ |
| Access Server Keys | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage Federation | ✅ | ✅ | ❌ | ❌ | ❌ |

### Internal role names (for debugging / DB queries)

| UI name | DB `role` value | `UserRole` enum |
| :--- | :--- | :--- |
| Root Admin / Instance Owner | `root_admin` | `ROOT_ADMIN` |
| Manager | `admin` | `ADMIN` |
| Curator | `super_user` | `SUPER_USER` |
| Listener-Artist | `user` + `artist_id IS NOT NULL` | `NORMAL_USER` |
| Listener | `user` | `NORMAL_USER` |
| Unauthenticated | — | `GUEST` |

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
