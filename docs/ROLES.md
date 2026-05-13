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

## 4. Listener (Standard User / Artist)
The **Listener** (or Artist) is the base role for users who publish music and interact with the platform.

### Capabilities:
- **Discography Management:** Upload tracks, create albums, and manage their own releases.
- **Social Interaction:** Create posts, follow others, and manage their own profile.
- **Streaming:** Access music via the web player or Subsonic-compatible apps.

---

## Permission Matrix (Summary)

| Capability | Instance Owner | Manager | Curator | Listener |
| :--- | :---: | :---: | :---: | :---: |
| Modify Site Settings | ✅ | ❌ | ❌ | ❌ |
| Manage Users | ✅ | ✅ (view) | ❌ | ❌ |
| Edit Others' Content | ✅ | ✅ | ✅ | ❌ |
| Upload Music | ✅ | ✅ | ✅ | ✅ |
| Access Server Keys | ✅ | ❌ | ❌ | ❌ |
| Manage Federation | ✅ | ✅ | ❌ | ❌ |

---

## Security Verification

TuneCamp implements these controls at the API level:
1. **JWT Middleware:** Every authenticated request verifies the role (`isAdmin`) and identity (`userId`).
2. **Content Ownership:** Modification APIs (`PUT`, `DELETE`) verify that `owner_id` (referencing `admin.id`) matches the requester's `userId`, unless the requester is an administrator. The system includes self-healing maintenance to ensure all content is correctly owned by a valid administrator.
3. **SSRF Protection:** Network operations (ActivityPub follow) are protected against SSRF attacks via URL validation.
4. **Sanitization:** File names and metadata are sanitized to prevent Path Traversal and XSS attacks.
5. **Quota Check:** During upload, the user's available disk space is dynamically verified before accepting files.
