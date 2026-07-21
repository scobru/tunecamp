# TuneCamp Lab

The **Lab** is TuneCamp's experimental zone — a place where developers can ship standalone audio tools that run embedded inside TuneCamp without touching the core codebase.

Each Lab app:
- Runs in a sandboxed **iFrame** (no risk to the host app)
- Can request browser permissions (microphone, etc.) scoped to itself
- Is described by a row in the `lab_apps` DB table
- Can optionally communicate with TuneCamp via the **Lab SDK** (PostMessage bridge)

---

## Quick start: adding a Lab app

Apps are stored in the `lab_apps` SQLite table (`src/server/core/database.ts`), managed through the admin API (`src/server/routes/admin/lab-apps.ts`) and the **Admin → Lab Apps** panel (`AdminLabAppsPanel.tsx`) — no code change needed to add or edit one.

- **Via UI:** Admin panel → Lab Apps → *Add App*, fill in the fields below.
- **Via API:** `POST /api/admin/lab-apps` (root-admin only) with the same fields as JSON body.
- **Built-in defaults:** seeded on first boot in `database.ts` (currently 4-Track Recorder, id 1, and Audiofabric, id 2) — edit those `INSERT OR IGNORE` blocks to change the shipped defaults.

The public `/lab` page and `/lab/<id>` runner read from `GET /api/lab-apps` (enabled apps only) and pick up new rows automatically, no rebuild required.

### Manifest fields

```typescript
interface LabApp {
  id: number;            // DB row id, auto-assigned  →  /lab/<id>
  name: string;
  description: string;
  src: string;          // URL of the app (hosted externally or relative path)
  category: 'recording' | 'synthesis' | 'composition' | 'effects' | 'other';
  author: string;
  sourceUrl: string;    // GitHub / repo link shown in the toolbar
  permissions: string[]; // Shown as badges on the card (informational)
  sandbox: string[];    // iFrame sandbox attribute tokens
  allow: string[];      // iFrame allow attribute (feature policy)
  enabled: boolean;     // hidden from /lab and GET /api/lab-apps when false
}
```

### Example — 4-Track Recorder

```typescript
// POST /api/admin/lab-apps body (id is auto-assigned)

{
  name: '4-Track Recorder',
  description:
    'Browser-based 4-track audio recorder with overdub support, ' +
    'latency compensation, and sample-accurate multi-track playback. ' +
    'Runs entirely in your browser — no server needed.',
  src: 'https://tunecamp-4-track-recorder.vercel.app',
  category: 'recording',
  author: 'andreboekhorst',
  sourceUrl: 'https://github.com/andreboekhorst/4-track-recorder',
  permissions: ['microphone'],
  sandbox: ['allow-scripts', 'allow-same-origin', 'allow-downloads', 'allow-forms'],
  allow: ['microphone'],
}
```

### Common `sandbox` values

| Token | When to use |
|---|---|
| `allow-scripts` | App runs JavaScript (always needed) |
| `allow-same-origin` | App uses `localStorage`, `IndexedDB`, cookies |
| `allow-downloads` | App lets users save files |
| `allow-forms` | App has `<form>` submissions |
| `allow-popups` | App opens new windows/tabs |
| `allow-modals` | App uses `alert` / `confirm` |

### Common `allow` (feature policy) values

| Value | When to use |
|---|---|
| `microphone` | App records from the user's microphone |
| `camera` | App accesses the camera |
| `midi` | App uses Web MIDI API |
| `autoplay` | App autoplays audio |

---

## Hosting options

### A — External URL (recommended for experiments)

Point `src` at a live demo URL. Fastest way to ship.

```typescript
src: 'https://www.4track.cc'
```

> **Caveat:** some sites set `X-Frame-Options: DENY` or `Content-Security-Policy: frame-ancestors 'none'`, which blocks embedding. If the app refuses to load in the iFrame, use option B.

### B — Fork + self-host

1. Fork the repo
2. Build it: `npm run build`
3. Host the `dist/` folder on any static hosting (Vercel, Netlify, GitHub Pages, your own server)
4. Point `src` at your hosted URL

### C — Bundle inside TuneCamp

Place the built `dist/` folder under `webapp/public/lab/<id>/` and set:

```typescript
src: '/lab/4track/index.html'
```

The app will be served by TuneCamp's own static file server. Good for offline / self-hosted instances.

---

## Lab SDK (PostMessage bridge)

Apps can optionally communicate with TuneCamp using `window.postMessage`. This lets a Lab app read the user's library, react to playback events, or save audio back to TuneCamp.

All four actions are handled by TuneCamp out of the box — no changes to the host app are needed when adding a new Lab app.

### Protocol

Every request follows the same pattern:

```javascript
// 1. Send the request to TuneCamp
window.parent.postMessage(
  { type: 'tunecamp:request', action: '<action>', payload: { /* optional */ } },
  '*'
);

// 2. Listen for the response
window.addEventListener('message', (event) => {
  if (event.data?.type !== 'tunecamp:response') return;
  if (event.data?.action !== '<action>') return; // match by action name
  console.log(event.data.payload);
});
```

The response envelope is always `{ type: 'tunecamp:response', action, payload }`.

---

### Available actions

#### `getUser`

Returns the currently logged-in user, or `null` if not authenticated.

```javascript
window.parent.postMessage(
  { type: 'tunecamp:request', action: 'getUser' },
  '*'
);

// Response payload
// { id: string, username: string, role: 'admin' | 'user' | 'super_user' | null }
// or null
```

---

#### `getLibrary`

Returns a slice of the user's track library.

```javascript
window.parent.postMessage(
  { type: 'tunecamp:request', action: 'getLibrary', payload: { limit: 50 } },
  '*'
);

// Response payload
// {
//   tracks: [
//     {
//       id: string,
//       title: string,
//       artist: string,
//       album: string,
//       duration: number,       // seconds
//       streamUrl: string,      // authenticated stream URL
//       coverUrl: string,       // cover art URL
//     },
//     ...
//   ]
// }
```

`limit` defaults to 50 if omitted.

---

#### `getNowPlaying`

Returns the track currently playing in TuneCamp, or `null` if nothing is playing.

```javascript
window.parent.postMessage(
  { type: 'tunecamp:request', action: 'getNowPlaying' },
  '*'
);

// Response payload (track playing)
// {
//   track: {
//     id: string,
//     title: string,
//     artist: string,
//     album: string,
//     duration: number,
//     streamUrl: string,
//     coverUrl: string,
//   },
//   isPlaying: boolean,
//   currentTime: number,   // seconds elapsed
//   duration: number,      // total duration in seconds
// }
// or null
```

---

#### `exportAudio`

Saves an audio `Blob` directly into the user's TuneCamp library.

```javascript
const blob = await myApp.exportMix(); // your app produces a Blob

window.parent.postMessage(
  {
    type: 'tunecamp:request',
    action: 'exportAudio',
    payload: {
      blob,
      filename: 'my-recording.wav',
      mimeType: 'audio/wav',
    },
  },
  '*'
);

// Response payload
// { success: true }
// or { success: false, error: string }
```

---

### Complete helper (copy-paste)

Drop this into any Lab app to get a typed, promise-based SDK with no dependencies:

```javascript
function tunecampSDK() {
  function request(action, payload) {
    return new Promise((resolve) => {
      function onMessage(event) {
        if (event.data?.type !== 'tunecamp:response') return;
        if (event.data?.action !== action) return;
        window.removeEventListener('message', onMessage);
        resolve(event.data.payload);
      }
      window.addEventListener('message', onMessage);
      try {
        window.parent.postMessage({ type: 'tunecamp:request', action, payload }, '*');
      } catch {
        // Not inside a TuneCamp iFrame
        window.removeEventListener('message', onMessage);
        resolve(null);
      }
    });
  }

  return {
    getUser:       ()        => request('getUser'),
    getNowPlaying: ()        => request('getNowPlaying'),
    getLibrary:    (limit)   => request('getLibrary', { limit: limit ?? 50 }),
    exportAudio:   (blob, filename, mimeType) =>
      request('exportAudio', { blob, filename, mimeType }),
  };
}

// Usage
const tc = tunecampSDK();
const user    = await tc.getUser();          // { id, username, role } | null
const library = await tc.getLibrary(20);     // { tracks: [...] }
const now     = await tc.getNowPlaying();    // { track, isPlaying, ... } | null
```

---

## Worked example: integrating 4-Track Recorder

### What it does

[4-Track Recorder](https://github.com/andreboekhorst/4-track-recorder) is a SvelteKit app that uses the Web Audio API to record up to 4 audio tracks in the browser, with overdub and latency compensation. It saves projects in a custom `.4trk` binary format.

### Tech stack

- **Frontend:** SvelteKit + TypeScript
- **Build:** Vite
- **Audio:** Web Audio API (no backend)
- **Storage:** local download (`.4trk` files)

### Why iFrame, not a React component

The app is built with Svelte, not React. Wrapping it as a React component would require re-writing it. The iFrame approach lets it run as-is, in its own JS context, without any framework conflicts.

### Embedding it in TuneCamp

The manifest entry above is all that's needed for the basic integration. The result:

- `/lab` shows a card with the app name, category badge, and permission hints
- `/lab/4track` opens the app full-screen inside TuneCamp's shell with a back button and a link to the source repo
- The `allow="microphone"` attribute forwards the browser's microphone permission prompt into the iFrame

### Optional: deeper integration via Lab SDK

A fork of 4-Track Recorder could use the implemented PostMessage bridge to:

```javascript
// After finishing a recording, offer to save it to the TuneCamp library
const blob = await exportMix(); // get the final mix as a Blob
window.parent.postMessage({
  type: 'tunecamp:request',
  action: 'exportAudio',
  payload: {
    blob,
    filename: 'my-recording.wav',
    mimeType: 'audio/wav',
  },
}, '*');
```

This would save the mix directly into the user's TuneCamp library without leaving the app.

---

## Submitting a Lab app

1. Deploy or fork your app so it has a stable `src` URL (or bundle it under `webapp/public/lab/<id>/` and self-host)
2. Ask a root-admin to add it via the **Admin → Lab Apps** panel, or open a PR adding an `INSERT OR IGNORE` seed block to `src/server/core/database.ts` (see the existing 4-Track Recorder / Audiofabric blocks) if it should ship as a built-in default
3. If opening a PR, title it `feat(lab): add <Your App Name>`
4. In the PR description include:
   - What the app does
   - Its source repo or live URL
   - Which browser permissions it needs and why
   - A screenshot or short video

---

## Differences from Plugins

| | Lab Apps | Backend Plugins |
|---|---|---|
| **What they extend** | Frontend UI (audio tools, instruments) | Backend providers (metadata, streaming, storage…) |
| **Tech stack** | Any (iFrame-based) | Node.js / ESM |
| **Where they live** | `lab_apps` DB table (via Admin panel / API) | `plugins/<name>.js` |
| **Loaded by** | React frontend at runtime, from `GET /api/lab-apps` | Server plugin loader at startup |
| **Examples** | 4-Track Recorder, Patchcab, ComposeYogi | Custom metadata source, Soulseek, S3 storage |

