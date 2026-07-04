# Handoff: TuneCamp UX — Navigation, Library, Player & Home

## Overview
A set of UX improvements for the TuneCamp webapp (React + TypeScript + Zustand + React Router, DaisyUI theme). Five areas, each designed to be **low-risk**: they restructure and relabel existing surfaces rather than add new features. No route is deleted, no role guard or `ModuleGuard` changes, no data model changes.

The five changes:
1. **Sidebar IA** — regroup nav by intent, move service links into the profile menu, add a collapsible "More".
2. **Unified Library** — merge `/playlists` and `/favorites` into one `/library` page with tabs.
3. **Collapsed & mobile sidebar** — same behavior as today, new order.
4. **Slimmer PlayerBar** — fewer always-visible controls + one overflow menu. Includes a real bug fix.
5. **Listen-oriented Home** — an actionable hero + "Jump back in" row.

## About the Design Files
The bundled file `Navigazione.dc.html` is a **design reference created in HTML** — a prototype showing intended layout, grouping, labels, and states. It is **not production code to copy**. The task is to **recreate these intentions in the existing React codebase** using its established patterns (DaisyUI classes, `lucide-react` icons, Zustand stores, the existing `NavItem`/`PageHeader`/`ReleaseCard` components). The prototype uses inline styles and the vanilla `lucide` CDN purely for mockup purposes — ignore those mechanics and use the repo's conventions.

The prototype is organized as 5 stacked "turns" (newest at top): turn 5 = Home, 4 = Player, 3 = sidebar states, 2 = Library, 1 = sidebar IA. Options are labelled `1a/1b … 5a/5b` where `a` = current, `b` = proposed.

## Fidelity
**High-fidelity.** Colors, typography, spacing, grouping, and labels are final and taken from the repo's own theme (`webapp/src/index.css`). Recreate pixel-faithfully using the existing DaisyUI theme tokens — do not hardcode the hex/oklch values from the prototype; use the theme variables that already produce them.

---

## Change 1 — Sidebar Information Architecture
**File:** `webapp/src/components/layout/Sidebar.tsx` (all changes local to this component)

Today the sidebar shows ~30 items across 5 sections + an 8-item service footer. Regroup into:

- **Primary (no section header):** Home · Search · **Library**
- **Explore:** Releases · Artists · Radio · Live · Store · **More** (collapsible, closed by default → Dig, Lab)
- **Community:** Network · Board · Now Listening · Stats
- **Studio** (only when `canPublish(user, role)`): Publish · Social · My Catalog · Archive (admin-only, as today)
- **Profile menu** (new dropdown on the existing user footer avatar): Admin (→ Files, Search Content) · Settings · Wallet · Help (Guide + Support) · Tools · Legal · About · RSS · Community link

### Item → route mapping (all routes already exist in `App.tsx`)
- Library → `/library`? **No** — `/library` is the admin Archive today. Point the new listener-facing "Library" at the unified page from Change 2 (keep it on a route such as `/library` only if you also apply Change 2; otherwise use `/favorites` as the temporary target). Archive (admin) keeps pointing at the current private-library route.
- Releases → `/releases` (fold **Tracks** in as a tab inside the Releases page; remove the standalone Tracks nav item — the `/tracks` route stays as a deep link).
- Radio → `/radio` · Live → `/live` · Store → `/store` · Dig → `/dig` · Lab → `/lab`
- Network → `/network` · Board → `/board` · Now Listening → `/now-listening` · Stats → `/stats`
- Publish → `/publish` · Social → `/social` · My Catalog → `/my-music` · Archive → the admin `/library` (Archive)
- Files → `/browser` and Search Content → `/search/content` move **under the Admin entry** in the profile menu (they are `RootAdminGuard`/`ManagerOrRootGuard` tools).

### Implementation notes
- Keep the existing `NavItem`, `ExternalNavItem`, `SectionHeader` components and their collapsed-mode behavior untouched.
- The **profile menu** replaces the flat footer list: wrap the existing avatar/username block in a DaisyUI `dropdown dropdown-top` whose menu lists the service links (previously rendered inline). Preserve `ThemeSwitcher`, `WalletPill`, and logout inside it.
- **More group:** a native `<details>`/`<summary>` (or a `useState` toggle) styled as a `NavItem`, closed by default, containing Dig + Lab. Respect the existing `isModuleHidden("hideDig")` gating.
- Preserve every `isModuleHidden(...)`, `canPub`, `isAdmin`, `isRoot` condition exactly — only the grouping/placement changes.

### Labels are English (match the product)
Primary/Explore/Community/Studio + item labels as listed above. `Now Listening` and `Stats` are **instance-wide** discovery surfaces (not creator tools) — they belong in Community, not Studio.

---

## Change 2 — Unified Library
**New page:** `webapp/src/pages/Library.tsx` is currently the admin Archive. Do **not** overload it. Create the unified listener library as a new page (e.g. `MyLibrary.tsx`) OR rename carefully. Recommended: new component mounted at `/library` for listeners, and move the admin Archive to an explicit route like `/archive` (update the Sidebar "Archive" item + guard accordingly).

Merge the existing `Playlists.tsx` and `Favorites.tsx` into one page with a `PageHeader` ("Your Library", subtitle "Playlists, likes and the artists you follow", icon `Library`/`LibraryBig`) and a top-level tab set:

- **Playlists** — reuse the entire body of `Playlists.tsx` (view-mode grid/list/minimal toggle, `New Playlist` button, the `mine`/`public` sub-toggle, `renderPlaylistCover`, `CreateUserPlaylistModal`).
- **Tracks** — the liked-tracks `TrackList` table from `Favorites.tsx`.
- **Albums** — the starred-albums grid (`ReleaseCard`) from `Favorites.tsx`.
- **Artists** — the followed-artists circle grid (`ArtistCard`) from `Favorites.tsx`.

Show a count badge per tab. Drive the active tab from a `?tab=` search param (Playlists.tsx already uses `useSearchParams` for `mine`/`public` — extend the same pattern).

### Routes (in `App.tsx`) — keep everything working
- `/library` → unified page (default tab: Playlists).
- `/playlists` → `<Navigate to="/library" replace />`; `/playlists/:id` stays as the detail page.
- `/favorites` → `<Navigate to="/library?tab=tracks" replace />`.
- The existing legacy redirects (`/my-playlists` → `/playlists`) still resolve through the chain.
All data hooks (`API.getPlaylists`, `queryKeys.tracks/albums/releases/artists`, the `starred` filtering, `handleUnstar`) are reused verbatim — no new endpoints.

---

## Change 3 — Collapsed & Mobile Sidebar
No new behavior. The collapsed rail (`sidebarCollapsed` → `w-16`, centered 40px icon buttons, section headers become dividers, labels as `title` tooltips) and the mobile drawer (`MainLayout.tsx` `drawer` + navbar hamburger) already exist. They simply reflect the new order/grouping from Change 1 automatically once Sidebar.tsx is updated. Verify the collapsed dividers appear between the new groups and the "More" details collapses cleanly at `w-16`.

---

## Change 4 — Slimmer PlayerBar
**File:** `webapp/src/components/player/PlayerBar.tsx`

### Bug fix (do this regardless)
The Lyrics toggle button binds its active state to `isShuffled`:
```tsx
className={clsx("hidden md:flex btn btn-ghost btn-sm btn-square tooltip tooltip-top", isShuffled ? "text-primary" : "opacity-40")}
```
It lights up when Shuffle is on, not when lyrics are open. Bind it to the lyrics-open flag from `usePlayerStore` (add/read e.g. `isLyricsOpen`) instead of `isShuffled`.

### Declutter (desktop)
Keep always-visible: **transport** (Shuffle · Prev · Play · Next · Repeat), **volume**, and **Queue**. Move into the existing desktop overflow (`MoreVertical`) dropdown: **Lyrics, Visualizer (Canvas), Crossfade, Radio mode**, plus the track actions already there (Add to Playlist, Favorite Artist, Favorite Album, Download). This means removing the standalone always-visible `AudioLines` (Crossfade), `Mic2` (Lyrics), and `Maximize2` (Visualizer) buttons and adding those actions as items in the dropdown. Shuffle/Repeat stay (standard transport); Radio mode (TuneCamp-specific) goes into the menu. The mobile overflow menu already consolidates most of this — mirror the same item list.

---

## Change 5 — Listen-oriented Home
**File:** `webapp/src/pages/Home.tsx`

Replace the large generic hero (three non-playback buttons) with a **compact actionable hero**:
- Greeting/title (keep site identity but smaller — `text-3xl`).
- Primary CTA **Resume** — calls the player store to resume the last track (read last track/progress from `usePlayerStore` / now-playing heartbeat). Secondary **Shuffle latest** (plays from `catalog.recentReleases`). Keep **Explore Network** as a ghost link.
- Optional small "Last played" card (cover + title + artist + time left) from the player store.

Add a **"Jump back in"** row above Recent Releases: recently played tracks/playlists as cards with a play-on-hover overlay. Recent Releases grid, Browse by Genre, and the Stats strip stay where they are (already demoted). Uses only existing data (`API.getCatalog()`, player store) — no new endpoints.

---

## Design Tokens (from `webapp/src/index.css`, theme `tunecamp`)
Use the theme variables, not literals. Key ones the prototype reflects:
- `--color-base-100` `oklch(10% .01 280)` (surface) · `--color-base-200` `oklch(14% .01 280)` · `--color-base-300` `oklch(18% .02 280)`
- `--color-base-content` `oklch(98% .005 280)`
- `--color-primary` `oklch(65% .28 290)` (violet) · `--color-primary-content` white
- `--color-accent` `oklch(75% .15 190)` (cyan) · `--color-secondary` `oklch(60% .02 280)`
- Fonts: `--font-sans` **Outfit**, `--font-mono` **JetBrains Mono**
- Radii: `--radius-field` .5rem · `--radius-box` 1rem · pill nav items `rounded-full`
- Shadows: `--shadow-level-1..3`
- Active nav item = `bg-primary text-primary-content font-bold shadow-level-1`; inactive = `text-base-content/70`, icon `opacity-60`.

## Assets
- `logo.svg` (the tent mark) — already at `webapp/public/logo.svg`. Included in this bundle for reference.
- All icons are **lucide** (`lucide-react` in the app). Icon names used in the redesign: house, search, library/library-big, disc, user, rss, radio, shopping-bag, ellipsis, globe, message-square, headphones, bar-chart-2, upload, at-sign (Social), music, folder (Archive), plus player icons (shuffle, skip-back/forward, play/pause, repeat, volume-2, list-music, mic/mic-vocal, audio-lines, maximize-2, list-plus, heart, download).

## Files
- `Navigazione.dc.html` — the full design prototype (5 turns / options 1a–5b).
- `logo.svg` — brand mark.
- Source files to edit: `Sidebar.tsx`, `App.tsx`, `PlayerBar.tsx`, `Home.tsx`, `Playlists.tsx`, `Favorites.tsx` (+ new `MyLibrary.tsx`).
