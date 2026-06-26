# Catalog Domain Context

## Vocabulary

### Santuario (Private Library)
The internal, owner-only collection of music scanned from local directories or cloud imports. Content in Santuario is in a **Draft** state and is not federated.

### Arena (Public Stage)
The public-facing catalog of **Formal Releases**. Content here is visible to the Fediverse and decentralized networks (Zen/IPFS).

### Library Album
A collection of tracks in **Santuario**. It represents a physical folder structure.

### Formal Release
A curated collection of tracks in **Arena**. It has a manual promotion status and can include tracks from multiple sources.

### Promotion
The irreversible (or high-friction) process of moving a **Library Album** from **Santuario** to **Arena**.

### Visibility
- **Public**: Visible to everyone and federated.
- **Unlisted**: Accessible via link, but not searchable or listed in the public Arena.
- **Private**: Visible only to the owner (Santuario default).

### Consumption Access
The right to **consume** a track — stream it, download it, view its metadata, or
add it to a playlist. All four entry points share one rule, centralized in
`canConsumeTrack` (`common/visibility.ts`): a viewer may consume a track if they
can see the private library (Curator/Manager), own it (by user or linked artist),
or the track is reachable on the **Public Stage** (released album, or surfaced
through a public playlist). Distinct from **management** (`canManageItem`), which
governs *editing*, not *consuming*.
