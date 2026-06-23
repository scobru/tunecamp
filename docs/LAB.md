# TuneCamp Lab

The **Lab** is TuneCamp's experimental zone — a place where developers can ship standalone audio tools that run embedded inside TuneCamp without touching the core codebase.

Each Lab app:
- Runs in a sandboxed **iFrame** (no risk to the host app)
- Can request browser permissions (microphone, etc.) scoped to itself
- Is described by a single object in the app registry
- Can optionally communicate with TuneCamp via the **Lab SDK** (PostMessage bridge)

---

## Quick start: adding a Lab app

All apps live in one file:

```
webapp/src/data/labApps.ts
```

Add an entry to the `LAB_APPS` array. That's it — the Lab page and runner pick it up automatically.

### Manifest fields

```typescript
interface LabApp {
  id: string;           // URL slug  →  /lab/<id>
  name: string;
  description: string;
  src: string;          // URL of the app (hosted externally or relative path)
  category: 'recording' | 'synthesis' | 'composition' | 'effects' | 'other';
  author: string;
  sourceUrl: string;    // GitHub / repo link shown in the toolbar
  permissions: string[]; // Shown as badges on the card (informational)
  sandbox: string[];    // iFrame sandbox attribute tokens
  allow: string[];      // iFrame allow attribute (feature policy)
}
```

### Example — 4-Track Recorder

```typescript
// webapp/src/data/labApps.ts

{
  id: '4track',
  name: '4-Track Recorder',
  description:
    'Browser-based 4-track audio recorder with overdub support, ' +
    'latency compensation, and sample-accurate multi-track playback. ' +
    'Runs entirely in your browser — no server needed.',
  src: 'https://www.4track.cc',
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

### Sending a request from inside the iFrame

```javascript
// Inside your Lab app
window.parent.postMessage(
  { type: 'tunecamp:request', action: 'getNowPlaying' },
  '*'
);
```

### Listening for TuneCamp responses

```javascript
window.addEventListener('message', (event) => {
  if (event.data?.type === 'tunecamp:response') {
    console.log(event.data.payload); // { track: { title, artist, ... } }
  }
});
```

### Available actions

| Action | Payload | Response |
|---|---|---|
| `getNowPlaying` | — | `{ track }` or `null` |
| `getUser` | — | `{ id, username, role }` |
| `getLibrary` | `{ page?, limit? }` | `{ tracks: [...] }` |
| `exportAudio` | `{ blob, filename, mimeType }` | `{ success: true }` |

> **Note:** The PostMessage bridge is planned for a future release. Apps that don't need TuneCamp data work perfectly without it.

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

### Optional: deeper integration via Lab SDK (future)

Once the PostMessage bridge is implemented, a fork of 4-Track Recorder could:

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

1. Fork `tunecamp/tunecamp`
2. Add your entry to `webapp/src/data/labApps.ts`
3. Open a PR with the title `feat(lab): add <Your App Name>`
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
| **Where they live** | `webapp/src/data/labApps.ts` | `plugins/<name>.js` |
| **Loaded by** | React frontend at runtime | Server plugin loader at startup |
| **Examples** | 4-Track Recorder, Patchcab, ComposeYogi | Custom metadata source, Soulseek, S3 storage |

See [`PLUGINS.md`](./PLUGINS.md) for backend plugin documentation.
