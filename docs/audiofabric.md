# TuneCamp Audiofabric

A real-time 3D WebGL music visualizer powered by the Web Audio API and Three.js. Renders a spring-physics frequency fabric that pulses and flows with the music.

Audiofabric is integrated into TuneCamp as a built-in Lab app, seeded in the `lab_apps` table pointing to the deployed instance at `https://tunecamp-audiofabric.vercel.app`.

## Features

- **3D Physics Visualizer:** Interactive frequency fabric grid rendering with customizable/responsive dynamics.
- **Controls Panel:** Choose tracks, adjust visualization settings, and inspect track details.
- **Subsonic API Streaming:** Streams audio directly from your TuneCamp library using the Subsonic API protocol.
- **Interactivity:** Drag and scroll in the WebGL canvas to pan, rotate, and zoom the 3D fabric.

## Integration Details

- **Source Code Repository:** [github.com/scobru/tunecamp-audiofabric](https://github.com/scobru/tunecamp-audiofabric) (Forked from [github.com/rolyatmax/audiofabric](https://github.com/rolyatmax/audiofabric))
- **Category:** Visualisation / Effects
- **Permissions Required:** `autoplay` (configured in the iFrame allow list to play audio automatically on load).
- **Hosting Method:** Option A (external URL — deployed to Vercel at `tunecamp-audiofabric.vercel.app`, seeded via `lab_apps` DB row id 2).

## How to Stream from TuneCamp Library

To stream tracks directly from your TuneCamp instance's Subsonic API endpoint into Audiofabric:
1. Append the Subsonic configuration query parameters to the Lab URL:
   `?tc=SERVER_URL&u=USER&p=PASS`
2. Audiofabric will automatically query the server and load your library tracks into its custom playlist selector.
