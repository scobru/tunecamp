# TuneCamp Collab

**Collab** lets multiple artists on the same instance build a track together: upload stems, save version snapshots, and iterate — no separate app, no realtime, no ZEN.

## Why native, not a Lab app

Collab needs rich relational data (projects, versions, permissions) and dedicated pages (list, detail, version history) — the [Lab SDK](LAB.md) is designed for stateless one-shot tools embedded via iFrame, not this. Collab is a first-class TuneCamp feature with its own tables and routes.

## Data model

- **`collab_projects`** — `title`, `description`, `owner_id`, `visibility` (`shared` | `private`).
- **`collab_versions`** — append-only, never overwritten (`UNIQUE(project_id, version)`). Each row is a snapshot (`state`, opaque JSON), authored by whoever saved it.
- **`collab_stems`** — raw in-progress audio layers, deliberately separate from `tracks`/`samples` (no publish/curation semantics).

See [data-models.md](data-models.md) for the full schema list.

## Permissions

Reuses the existing publishing gate — no new permission system:

- **Read**: requires login; `visibility='shared'` projects are readable by any logged-in user, `private` only by the owner.
- **Write** (create project, upload stem, save version): requires `VisibilityGuardian.canPublishContent()` — same gate as releases, sample packs, and every other publish endpoint.
- **Delete**: project creator (`owner_id` match) only.
- **Open collaboration v1**: any artist on the instance who passes `canPublishContent` can write to a shared project — no invite/collaborator list.

## API

| Method | Route | Notes |
|---|---|---|
| `GET` | `/api/collab` | List shared projects (`?mine=true` for the caller's own). |
| `POST` | `/api/collab` | Create a project. |
| `GET` | `/api/collab/:id` | Project + versions + stems. |
| `DELETE` | `/api/collab/:id` | Owner only. |
| `POST` | `/api/collab/:id/versions` | Save a version snapshot (`state`, optional `note`). |
| `POST` | `/api/collab/:id/stems` | Upload an audio stem (multipart `file`). |
| `GET` | `/api/collab/:id/stems/:stemId/download` | Stream a stem's audio. |
| `DELETE` | `/api/collab/:id/stems/:stemId` | Stem author or project owner. |

All routes require login (`authMiddleware.requireUser`).

## Webapp

- `/collab` — list shared projects, create new ones (if `canPublishContent`).
- `/collab/:id` — stems (upload/play/delete), version history, save-snapshot form.

## Not (yet) realtime

No live cursors/presence — versioning (append-only rows) covers the collaboration need. Live presence is deferred to the already-planned "Phase C" ZEN-via-`worker_thread`-RPC work (ephemeral presence / real-time collaborative playlists) documented in the repo's session rules — Collab does not duplicate or depend on it.
