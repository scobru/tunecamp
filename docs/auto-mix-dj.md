# Auto Mix / DJ Mode (Design Document)

> 🧪 **LAB feature** — part of the experimental [LAB](./index.md#-lab--experimental--proposals)
> track. Forward-looking; not part of a stable release.
>
> Status: **Phases 1–2 shipped in LAB** — a self-contained, growing increment is
> live under **LAB → DJ Mix** in the webapp (`/lab`). It turns a playlist into a
> continuous, gapless set using a two-deck **Web Audio** engine with equal-power
> crossfades, transition **presets** (Fade / Rise / Cut) with per-deck EQ, and
> **beat-aligned transitions** from fully client-side BPM/beat-grid detection.
> The remaining phases (the per-transition editor, Smart Reorder) plus the *Echo*
> preset and true tempo-warp are still **Proposal / Design**.
>
> **What's implemented (Phases 1–2):**
> - `webapp/src/lib/dj/DjEngine.ts` — two-deck Web Audio engine: equal-power
>   crossfade scheduling, Fade/Rise/Cut presets with low-shelf bass-swap and
>   high-pass sweep, a lookahead preloader, and bar-quantised, beat-snapped
>   transitions. Isolated from the main `<audio>` player (zero regression risk).
> - `webapp/src/utils/bpm.ts` — client-side tempo **and beat-grid phase**
>   detection (Web Audio autocorrelation), shared with Dig.
> - `webapp/src/pages/Lab.tsx` — the LAB UI: pick a playlist, choose a preset,
>   set crossfade length, a Beat-sync toggle, BPM chips, a shuffleable queue and
>   transport (play / skip / prev / mix-now / seek), now-playing + up-next.
> Target: clone the core of **Spotify "Mix"** (Aug 2025) — beat‑matched, DJ‑style
> transitions between the tracks of a playlist, with an automatic mode and a
> manual per‑transition editor.

This document describes *what* we want to build, *how* it maps onto the existing
TuneCamp architecture, and a *phased plan* so we can ship an MVP quickly and grow
it incrementally. It is meant to be read together with
[Webapp Architecture](./architecture-webapp.md),
[Backend Architecture](./architecture-backend.md),
[Data Models](./data-models.md) and [AI Integrations](./ai-integrations.md).

---

## 1. What we are cloning

Spotify's **Mix** feature (Premium, beta, mobile) lets a user turn any of their
playlists into a continuous DJ set:

- Open a playlist → tap **Mix** in the toolbar → the playlist becomes a "mixed"
  version where each track flows into the next with no gap.
- **Auto** mode produces an instant beat‑matched blend across the whole playlist.
- **Customize** lets the user tap a single transition (the join between track A
  and track B) and edit it:
  - Pick a **preset** (e.g. *Fade*, *Rise*).
  - Tune **volume**, **EQ** and **effect** curves.
  - Move the **transition point** using **waveform + beat data** to find the
    best spot in each track.
- Each track shows its **BPM** and **musical key** (Camelot notation) so the
  user can scan/reorder for smoother flow.
- **Smart Reorder** (Feb 2026) auto‑rearranges the playlist by BPM/key to
  maximise flow quality.

### Our scope

| In scope (clone) | Out of scope (for now) |
|---|---|
| Per‑playlist "Mix" mode toggle | Spotify's exact licensing/DRM constraints |
| Auto beat‑matched crossfades | Stem separation / per‑stem mixing |
| Per‑transition manual editor (preset, curves, transition point) | Live scratch / hot‑cue performance UI |
| BPM + Camelot key per track | Real‑time tempo *warping* of mismatched BPMs in v1 |
| Smart Reorder suggestions | Collaborative/social mixing |

The single biggest architectural change is the **playback engine**: the current
player uses a single HTML5 `<audio>` element
(`webapp/src/components/player/PlayerBar.tsx`), which cannot overlap two tracks
or apply EQ. DJ transitions require the **Web Audio API** with two simultaneous
source nodes. This is the heart of the feature and the rest of the design hangs
off it.

---

## 2. UX flow

```
Playlist page (PlaylistView)
   └─ [ Mix ] button in the toolbar
        ├─ Auto  → instant mix, start playback in DJ mode
        └─ Customize → Mix Editor
                ├─ Track list with BPM + Camelot key chips
                ├─ Smart Reorder suggestion ("Reorder for better flow?")
                └─ Transition rows (A → B)
                        └─ Tap a transition → Transition Editor sheet
                                ├─ Preset: Fade | Rise | Cut | Echo …
                                ├─ Transition length (bars / seconds)
                                ├─ Transition point (waveform scrubber w/ beat grid)
                                ├─ Volume curve
                                ├─ EQ curve (low/mid/high fades)
                                └─ Preview ▶
```

Playback: when a mix is active, the player bar shows a **DJ Mode** indicator and
auto‑plays through the mixed transitions (no track gaps, progress bar spans the
blend). The existing queue/shuffle UI is reused; shuffle is disabled or
re‑mixes on the fly (Auto mode supports shuffle like Spotify's Automix).

---

## 3. High‑level architecture

```
┌─────────────────────────── Frontend (React/Zustand) ───────────────────────────┐
│  PlaylistView ──▶ MixEditor ──▶ TransitionEditor                                 │
│                                                                                  │
│  useMixStore (new)            DJ Audio Engine (new, Web Audio API)               │
│   - mix plan                   - 2× deck (source → EQ → gain → master)           │
│   - per-transition settings    - schedules crossfade/EQ automation at lookahead  │
│   - active deck / position     - swaps decks at transition end                   │
│         │                              │                                         │
│         ▼  POST /api/mixes             ▼  GET /api/tracks/:id/stream (existing)  │
└─────────┼──────────────────────────────┼────────────────────────────────────────┘
          ▼                              ▼
┌─────────────────────── Backend (Express + SQLite) ──────────────────────────────┐
│  Mix routes (new)              Track Analysis service (new)                       │
│   - CRUD mix plans              - BPM detection                                   │
│   - auto-generate plan          - musical key → Camelot                           │
│   - smart reorder               - beat grid + downbeats                           │
│                                 - reuse waveform-data + ffmpeg + OpenRouter       │
│  audio_features table (new)     stored on tracks / audio_features                 │
└──────────────────────────────────────────────────────────────────────────────────┘
```

Two clean halves:

1. **Offline analysis** (backend): every track gets BPM, key, beat grid. Cached
   in SQLite like waveforms already are.
2. **Real‑time mixing** (frontend): a Web Audio engine that overlaps the
   outgoing and incoming track and runs the scheduled automation for the chosen
   transition.

---

## 4. Track analysis (backend)

DJ transitions need three things per track. We already have the raw material:
`fluent-ffmpeg` for decode, `waveform-data` for waveforms, and
`audio-fingerprinting.md` shows we already process PCM.

| Feature | How | Notes |
|---|---|---|
| **BPM / tempo** | Onset‑detection + autocorrelation over decoded PCM, or a small native lib (e.g. `aubio`/`essentia` via ffmpeg pipe; or `web-audio-beat-detector` server‑side via offline context) | Store integer BPM + confidence |
| **Beat grid** | First downbeat offset + BPM ⇒ derive bar/beat positions | Needed to align "mix in/out" to bar boundaries |
| **Musical key** | Chromagram → Krumhansl key profile, output as **Camelot** (e.g. `8A`) | Used for harmonic‑mixing compatibility |
| **Cue points** | Heuristic: intro end / outro start from energy envelope | Default transition anchors |

Implementation:

- New module `src/server/modules/analysis/audio-analysis.service.ts`
  (mirrors the existing `streaming`/`live` module shape).
- Triggered on ingest (alongside waveform generation) and via an admin backfill
  command, exactly like fingerprints/waveforms today. Results are **cached** —
  never recomputed (same philosophy as
  [AI Integrations](./ai-integrations.md) §4).
- **AI assist (optional, already available):** OpenRouter
  (`src/server/modules/ai/openrouter.service.ts`) can fill BPM/key from external
  metadata (Spotify/MusicBrainz already integrated) as a fast first pass, with
  DSP as the accurate fallback. Many tracks already have `external_id` linking
  to providers that expose tempo/key.

> **v1 simplification:** if DSP is too heavy for the single‑process SQLite
> deployment (see [Scaling](./scaling.md)), ship analysis as an **opt‑in
> background job** and gate the Mix button on "analysis ready" tracks.

---

## 5. Data model

New table, following the conventions in
[`src/server/core/database.types.ts`](../src/server/core/database.types.ts):

```sql
CREATE TABLE audio_features (
  track_id       INTEGER PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
  bpm            REAL,
  bpm_confidence REAL,
  key_camelot    TEXT,        -- e.g. '8A'
  key_open       TEXT,        -- optional, open-key notation
  beat_offset_ms INTEGER,     -- first downbeat
  beat_grid      TEXT,        -- JSON: optional precomputed beat times
  cue_in_ms      INTEGER,     -- suggested mix-in point
  cue_out_ms     INTEGER,     -- suggested mix-out point
  analyzed_at    INTEGER,
  analyzer       TEXT         -- 'dsp' | 'ai' | 'provider'
);
```

Mix plans (a user's customized mix of a playlist):

```sql
CREATE TABLE mixes (
  id          INTEGER PRIMARY KEY,
  owner_id    INTEGER REFERENCES users(id),
  playlist_id INTEGER,          -- nullable: ad-hoc mixes from a queue
  name        TEXT,
  mode        TEXT,             -- 'auto' | 'custom'
  created_at  INTEGER,
  updated_at  INTEGER
);

CREATE TABLE mix_transitions (
  mix_id        INTEGER REFERENCES mixes(id) ON DELETE CASCADE,
  position      INTEGER,        -- index of the OUTGOING track in the ordered mix
  from_track_id INTEGER,
  to_track_id   INTEGER,
  preset        TEXT,           -- 'fade' | 'rise' | 'cut' | 'echo'
  length_ms     INTEGER,
  out_point_ms  INTEGER,        -- where track A starts mixing out
  in_point_ms   INTEGER,        -- where track B starts mixing in
  curves        TEXT,           -- JSON: { volumeA, volumeB, eqLow, eqMid, eqHigh, fx }
  PRIMARY KEY (mix_id, position)
);
```

Track ordering for `mode='auto'` is derived on the fly; for `mode='custom'` it is
the order of `mix_transitions` (plus the final track). Visibility/ownership is
enforced through the existing `VisibilityGuardian`
(`src/server/common/visibility.ts`) and RBAC ([ROLES.md](./ROLES.md)).

---

## 6. API surface

New routes under `src/server/routes/library/` (sibling of the existing
`playlists.ts` / `catalog.ts`). All authenticated; ownership‑scoped.

| Method & path | Purpose |
|---|---|
| `GET /api/tracks/:id/features` | BPM, Camelot key, beat grid, cue points (for chips + editor) |
| `POST /api/mixes/auto` | Body `{ playlistId }` → returns an **auto‑generated** ordered plan with default transitions (no persistence) |
| `POST /api/mixes` | Persist a custom mix plan |
| `GET /api/mixes/:id` | Fetch a saved mix with all transitions + per‑track features |
| `PATCH /api/mixes/:id` | Update order / a single transition |
| `POST /api/mixes/reorder` | Body `{ trackIds }` → **Smart Reorder**: returns the BPM/key‑optimal ordering + a quality score |

The actual audio is streamed with the **existing** endpoint
`GET /api/tracks/:id/stream` (range requests already supported in
`src/server/modules/streaming/streaming.service.ts`). The engine just needs
those bytes decodable by Web Audio — see §7 caveat.

---

## 7. Real‑time DJ audio engine (frontend) — the core

A new `webapp/src/lib/dj/DjEngine.ts` built on the **Web Audio API**, replacing
the single `<audio>` element *only when DJ mode is active*. Two "decks":

```
                ┌──────── Deck A ────────┐
 stream A ─▶ source ─▶ EQ(low/mid/high) ─▶ gain ─┐
                                                  ├─▶ master ─▶ destination
 stream B ─▶ source ─▶ EQ(low/mid/high) ─▶ gain ─┘
                └──────── Deck B ────────┘
```

- Each deck = a source node (`MediaElementAudioSourceNode` wrapping an
  `<audio>`, or `AudioBufferSourceNode` for fully buffered short tracks) →
  3‑band EQ (`BiquadFilterNode` lowshelf/peaking/highshelf) → `GainNode`.
- **Crossfade** = scheduled `gain.setValueCurveAtTime` on both decks over
  `length_ms`, plus the chosen **EQ automation** (e.g. swap basslines: fade
  A's low out while B's low comes in to avoid bass clash).
- **Beat alignment:** when |BPM_A − BPM_B| is small, align the transition
  window to bar boundaries using each track's `beat_offset_ms` + BPM. For v1 we
  align *phase* (start the blend on a downbeat) without time‑stretching; true
  tempo‑warp is a later phase.
- **Scheduling model:** a lookahead scheduler (the well‑known
  `currentTime + lookahead` pattern) preps Deck B ~10–15 s before the
  transition, then arms the automation. On completion, Deck B becomes the
  active deck and Deck A is freed.
- **Presets** map to automation generators:
  - *Fade* — linear/equal‑power volume crossfade.
  - *Rise* — incoming high‑pass that opens up + volume swell.
  - *Cut* — hard switch on the next downbeat (no overlap).
  - *Echo* — outgoing delay/feedback tail (`DelayNode`) into the blend.

> **Caveat — CORS / decoding:** `MediaElementAudioSourceNode` and
> `decodeAudioData` require the stream to be same‑origin or CORS‑enabled. Local
> `/api/tracks/:id/stream` is same‑origin ✓. **Remote/proxied tracks**
> (SoundCloud/Bandcamp fallbacks, `/api/proxy/stream`) must send permissive
> CORS headers or DJ mode is disabled for them. Decide policy early.

The engine is isolated behind an interface so `PlayerBar.tsx` keeps using the
simple `<audio>` path when DJ mode is off — zero regression risk for normal
playback.

---

## 8. Frontend state & components

**New store** `webapp/src/stores/useMixStore.ts` (Zustand, same pattern as
`usePlayerStore.ts`):

```ts
interface MixState {
  isDjMode: boolean;
  mix: MixPlan | null;            // ordered tracks + transitions
  activeDeck: 'A' | 'B';
  currentTransition: Transition | null;
  editing: { transitionIndex: number } | null;
  // actions
  startAuto: (playlistId) => Promise<void>;
  loadMix: (mixId) => Promise<void>;
  updateTransition: (index, patch) => void;
  smartReorder: () => Promise<void>;
  saveMix: () => Promise<void>;
}
```

`usePlayerStore` gains a thin bridge: when `isDjMode` is true, `next()` and the
progress/`ended` handling delegate to `DjEngine` instead of the `<audio>`
element.

**New components** (under `webapp/src/components/player/dj/`, consistent with the
existing `player/` folder and [component inventory](./component-inventory.md)):

- `MixButton.tsx` — toolbar entry on the playlist page.
- `MixEditor.tsx` — track list w/ BPM+key chips, Smart Reorder banner, transition rows.
- `TransitionEditor.tsx` — bottom sheet: preset picker, length, waveform
  scrubber with beat grid (reuse `Waveform.tsx`), volume/EQ curve controls,
  Preview.
- `KeyBpmChip.tsx` — small reusable Camelot/BPM badge.
- `DjModeIndicator.tsx` — state in `PlayerBar`.

---

## 9. Auto‑mix & Smart Reorder algorithm

**Transition defaults (Auto):** for each adjacent pair A→B:

1. Anchor `out_point` at A's `cue_out`, `in_point` at B's `cue_in`.
2. Snap both to the nearest downbeat (beat grid).
3. Pick `length` from tempo (e.g. 8 bars if BPMs close, shorter/Cut if far).
4. Choose EQ automation: bass‑swap crossfade by default.

**Smart Reorder** — order tracks to maximise flow. Greedy/nearest‑neighbour over
a compatibility score:

```
score(A,B) = w_bpm · f(|bpmA − bpmB|)          // tempo proximity
           + w_key · camelotCompat(keyA, keyB)  // harmonic mixing (±1 / relative)
           + w_energy · g(energyA, energyB)      // optional, from RMS/loudness
```

`camelotCompat` implements the Camelot wheel rules (same number, ±1 on the
wheel, A↔B relative major/minor). Return both the new ordering and a 0–100
"flow score" to display in the UI ("Reorder for better flow → +18").

This is **deterministic and cheap** (no LLM needed). OpenRouter remains an
optional enhancer for *creative* set‑building ("build a 30‑min warm‑up that ends
energetic"), reusing the recommendation pattern already in
[AI Integrations](./ai-integrations.md).

---

## 10. Phased delivery

| Phase | Deliverable | Notes |
|---|---|---|
| **0 — Analysis** | `audio_features` table + analysis service + `GET /tracks/:id/features`; BPM/key chips shown in playlist UI | No mixing yet; pure metadata. Low risk. |
| **1 — Auto crossfade** ✅ | `DjEngine` with 2 decks + equal‑power crossfade; **LAB → DJ Mix** plays a playlist gaplessly | **Shipped in LAB.** The big Web Audio lift. Beatmatch optional here. |
| **2 — Beat alignment + presets** ✅ | Bar‑quantised, beat‑snapped transitions (client‑side BPM + beat‑grid), Fade/Rise/Cut presets, EQ bass‑swap + high‑pass sweep, lookahead preload | **Shipped in LAB** (client‑side). *Echo* preset and true tempo‑warp still pending. |
| **3 — Manual editor** | `MixEditor` + `TransitionEditor`, persist `mixes`/`mix_transitions`, Preview | Full Spotify‑parity customization. |
| **4 — Smart Reorder** | `POST /api/mixes/reorder` + UI banner | Camelot/BPM optimisation. |
| **5 — Polish** | Shuffle‑aware auto‑mix, AI creative set‑builder, mobile/Subsonic considerations | Stretch. |

An MVP that already "feels like Spotify Mix" is **Phases 0–2**.

---

## 11. Risks & open questions

- **Web Audio rework** is the dominant cost and touches the most‑loved code path
  (playback). Mitigate by keeping DJ mode fully behind a flag and leaving the
  `<audio>` path untouched when off.
- **CORS/decoding of remote tracks** (§7) — DJ mode likely **local‑library only**
  in v1. Confirm acceptable.
- **Analysis cost on single‑process SQLite** ([Scaling](./scaling.md)) — make
  analysis a throttled background job; gate Mix on readiness.
- **Lossless/WAV** are transcoded to MP3 on the fly today
  (`PlayerBar.tsx`); ensure the engine consumes the decodable variant.
- **Gapless vs licensing:** unlike Spotify we serve owned/federated content, so
  no extra licensing constraints — a genuine advantage worth highlighting.
- **Mobile/Subsonic clients** ([SUBSONIC.md](./SUBSONIC.md)) can't run our Web
  Audio engine; DJ mode is a web‑app feature for now.

## 12. Open decisions for the team

1. v1 scope: **local‑library only** mixing — yes/no?
2. BPM/key source: **DSP**, **provider metadata via OpenRouter**, or both with
   DSP as fallback?
3. Do we persist mixes server‑side (sharable) or keep them client‑local first?
4. Is DJ mode **Premium/role‑gated** (mirroring Spotify) or available to all
   listeners on a TuneCamp instance?

---

*Design doc — author to fill in owner & target milestone. See
[STATUS.md](./STATUS.md) once implementation begins.*
