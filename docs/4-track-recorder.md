# TuneCamp 4-Track Recorder

A browser-based 4-track cassette recorder built with the Web Audio API and Svelte 5. Forked and maintained as a standalone package at [`tunecamp-4-track-recorder`](https://github.com/scobru/tunecamp-4-track-recorder).

All processing runs entirely client-side — no server required.

## Features

- Low-latency overdub recording with latency compensation
- Sample-accurate multi-track playback
- Save/load projects in `.4trk` binary format (audio data + mixer settings)
- Mixer controls: per-track volume, pan, master volume

## Installation

```bash
npm install 4-track-recorder
```

## Basic Usage

```svelte
<script>
  import { FourTrack } from "4-track-recorder"
</script>

<FourTrack />
```

## Save and Load Projects

```svelte
<script>
  import { FourTrack } from "4-track-recorder"

  let save
  let load

  function handleSave() {
    const blob = save()
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "my-song.4trk"
    a.click()
    URL.revokeObjectURL(url)
  }
</script>

<FourTrack bind:save bind:load />
<button onclick={handleSave}>Save Project</button>
```

## Props

| Prop             | Type                             | Description                                    |
|------------------|----------------------------------|------------------------------------------------|
| `hiddenTracks`   | `HiddenTrackConfig[]`            | Background audio tracks (e.g. cassette hiss)   |
| `onready`        | `(detail: { engine }) => void`   | Callback when engine initializes               |
| `save`           | `() => Blob` (bindable)          | Export project as `.4trk` blob                 |
| `load`           | `(source: File \| string) => Promise<void>` (bindable) | Import `.4trk` file or URL |
| `initialProject` | `string \| File`                 | URL or File to auto-load on mount              |

## Repository

[github.com/scobru/tunecamp-4-track-recorder](https://github.com/scobru/tunecamp-4-track-recorder)
