import express, { Router, Request, Response } from "express";
import { wrapAsync } from "../../middleware/error-handling.js";
import { type ServiceContainer } from "../../core/container.js";

function escapeHtml(str: any): string {
  if (typeof str !== "string") str = String(str || "");
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDuration(sec: number): string {
  if (!sec || isNaN(sec)) return "00:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function createEmbedRoutes(container: ServiceContainer): Router {
  const router = Router();
  const db = container.database;
  const siteName = container.config?.siteName || "TuneCamp";

  const renderEmbed = wrapAsync(async (req: Request, res: Response) => {
    const rawType = (req.params.type || "release").toLowerCase();
    const idOrSlug = req.params.idOrSlug || req.params.id;

    if (!idOrSlug) {
      return res.status(404).send(renderNotFound("Specificatore mancante"));
    }

    const isTrack = rawType === "track" || rawType === "tracks";
    let title = "";
    let artist = "";
    let coverUrl = "/default-cover.png";
    let itemUrl = "/";
    let badgeType = "RELEASE";
    let tracks: Array<{ id: number | string; title: string; artist: string; duration: number; streamUrl: string }> = [];

    if (isTrack) {
      const isNumeric = /^\d+$/.test(idOrSlug);
      const track: any = isNumeric ? db.getTrack(Number(idOrSlug)) : null;
      if (!track) {
        return res.status(404).send(renderNotFound("Traccia non trovata"));
      }

      badgeType = "TRACK";
      title = track.title || `Traccia #${track.id}`;
      artist = track.artist_name || track.artistName || "TuneCamp Artist";
      coverUrl = track.coverUrl || (track.album_id ? `/api/albums/${track.album_id}/cover` : `/api/tracks/${track.id}/cover`);
      itemUrl = track.album_id ? `/albums/${track.album_id}?track=${track.id}` : `/tracks/${track.id}`;

      tracks = [
        {
          id: track.id,
          title: track.title,
          artist,
          duration: track.duration ? Math.round(track.duration) : 0,
          streamUrl: `/api/tracks/${track.id}/stream`
        }
      ];
    } else {
      // Album or Release
      let item: any = null;
      const isNumeric = /^\d+$/.test(idOrSlug);

      if (isNumeric) {
        const numId = Number(idOrSlug);
        item = db.getRelease?.(numId) || db.getAlbum?.(numId);
      }
      if (!item) {
        item = db.getReleaseBySlug?.(idOrSlug) || db.getAlbumBySlug?.(idOrSlug);
      }
      if (!item && isNumeric) {
        item = db.getAlbumByTitle?.(idOrSlug);
      }

      if (!item) {
        return res.status(404).send(renderNotFound("Release o Album non trovato"));
      }

      const isRelease = Boolean(item.is_release || item.is_formal_release || item.slug);
      badgeType = isRelease ? "RELEASE" : "ALBUM";
      title = item.title || "TuneCamp";
      artist = item.artist_name || item.artistName || "TuneCamp Artist";
      coverUrl = isRelease
        ? `/api/releases/${item.id || item.slug}/cover`
        : `/api/albums/${item.id || item.slug}/cover`;
      itemUrl = isRelease
        ? `/releases/${item.slug || item.id}`
        : `/albums/${item.slug || item.id}`;

      // Retrieve tracks
      let rawTracks: any[] = [];
      if (db.getReleaseTracks) {
        rawTracks = db.getReleaseTracks(item.id) || [];
      }
      if (!rawTracks.length && db.getTracksByAlbum) {
        rawTracks = db.getTracksByAlbum(item.id) || [];
      }
      if (!rawTracks.length && db.getTracks) {
        rawTracks = db.getTracks(item.id) || [];
      }

      tracks = rawTracks.map((t: any, idx: number) => ({
        id: t.id || t.track_id || idx + 1,
        title: t.title || `Traccia ${idx + 1}`,
        artist: t.artist_name || t.artistName || artist,
        duration: t.duration ? Math.round(t.duration) : 0,
        streamUrl: `/api/tracks/${t.id || t.track_id}/stream`
      }));

      // Fallback if no tracks attached directly
      if (!tracks.length) {
        tracks = [
          {
            id: item.id,
            title,
            artist,
            duration: 0,
            streamUrl: `/api/tracks/${item.id}/stream`
          }
        ];
      }
    }

    // Set permissive frame headers for iframe embedding
    res.removeHeader("X-Frame-Options");
    res.setHeader("Content-Security-Policy", "frame-ancestors *;");
    res.setHeader("Content-Type", "text/html; charset=utf-8");

    const tracksJson = JSON.stringify(tracks).replace(/</g, "\\u003c");

    res.send(`<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} — ${escapeHtml(artist)} [Embed]</title>
  <meta property="og:title" content="${escapeHtml(title)} — ${escapeHtml(artist)}" />
  <meta property="og:description" content="Ascolta ${escapeHtml(title)} su TuneCamp" />
  <meta property="og:image" content="${escapeHtml(coverUrl)}" />
  <style>
    :root {
      --bg: #090a0f;
      --card-bg: #111319;
      --border: rgba(255, 255, 255, 0.08);
      --border-hover: rgba(255, 255, 255, 0.16);
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #10b981;
      --accent-glow: rgba(16, 185, 129, 0.25);
      --badge-bg: rgba(16, 185, 129, 0.12);
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .embed-container {
      display: flex;
      flex-direction: row;
      width: 100%;
      height: 100%;
      padding: 14px;
      gap: 16px;
      background: linear-gradient(145deg, #131620 0%, #0c0e14 100%);
      border: 1px solid var(--border);
      align-items: stretch;
    }
    .cover-pane {
      position: relative;
      flex-shrink: 0;
      width: 130px;
      height: 100%;
      max-height: 190px;
      aspect-ratio: 1;
      border-radius: 8px;
      overflow: hidden;
      background: #000;
      border: 1px solid var(--border);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    }
    .cover-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transition: transform 0.3s ease;
    }
    .cover-pane:hover .cover-img {
      transform: scale(1.03);
    }
    .cover-link {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.2);
      opacity: 0;
      transition: opacity 0.2s ease;
      color: #fff;
      text-decoration: none;
    }
    .cover-pane:hover .cover-link {
      opacity: 1;
    }
    .main-pane {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 8px;
    }
    .header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .badge-group {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .tc-badge {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--accent);
      background: var(--badge-bg);
      border: 1px solid rgba(16, 185, 129, 0.3);
      padding: 2px 7px;
      border-radius: 4px;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .tc-badge:hover {
      background: rgba(16, 185, 129, 0.2);
    }
    .type-tag {
      font-size: 0.65rem;
      color: var(--text-muted);
      letter-spacing: 0.05em;
      text-transform: uppercase;
      font-weight: 600;
    }
    .info-group {
      min-width: 0;
    }
    .release-title {
      font-size: 1.15rem;
      font-weight: 800;
      line-height: 1.25;
      color: #fff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .release-artist {
      font-size: 0.85rem;
      color: var(--text-muted);
      margin-top: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .current-track-name {
      font-size: 0.8rem;
      color: #38bdf8;
      font-family: ui-monospace, SFMono-Regular, monospace;
      margin-top: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .controls-row {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 2px;
    }
    .btn-icon {
      background: transparent;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 6px;
      border-radius: 6px;
      transition: color 0.15s, background-color 0.15s;
    }
    .btn-icon:hover:not(:disabled) {
      color: #fff;
      background: rgba(255, 255, 255, 0.08);
    }
    .btn-icon:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }
    .btn-play {
      background: var(--accent);
      color: #042f2e;
      border: none;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
      box-shadow: 0 4px 14px var(--accent-glow);
      transition: transform 0.15s ease, background 0.15s ease;
    }
    .btn-play:hover {
      transform: scale(1.06);
      background: #34d399;
    }
    .btn-play:active {
      transform: scale(0.96);
    }
    .progress-wrap {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .scrubber-bar {
      position: relative;
      width: 100%;
      height: 6px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 3px;
      cursor: pointer;
    }
    .scrubber-fill {
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      width: 0%;
      background: var(--accent);
      border-radius: 3px;
      pointer-events: none;
    }
    .time-display {
      display: flex;
      justify-content: space-between;
      font-size: 0.72rem;
      font-family: ui-monospace, SFMono-Regular, monospace;
      color: var(--text-muted);
    }
    .tracklist-drawer {
      max-height: 52px;
      overflow-y: auto;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      padding-top: 4px;
    }
    .track-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 0.75rem;
      padding: 3px 6px;
      border-radius: 4px;
      cursor: pointer;
      color: var(--text-muted);
      transition: background 0.15s, color 0.15s;
    }
    .track-item:hover {
      background: rgba(255, 255, 255, 0.05);
      color: #fff;
    }
    .track-item.active {
      color: var(--accent);
      font-weight: 700;
      background: rgba(16, 185, 129, 0.08);
    }
    .track-item-title {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-right: 8px;
    }
    @media (max-width: 440px) {
      .embed-container {
        padding: 10px;
        gap: 10px;
      }
      .cover-pane {
        width: 90px;
        height: 90px;
      }
      .release-title {
        font-size: 0.98rem;
      }
      .btn-play {
        width: 34px;
        height: 34px;
      }
      .tracklist-drawer {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="embed-container">
    <div class="cover-pane">
      <img src="${escapeHtml(coverUrl)}" alt="${escapeHtml(title)}" class="cover-img" onerror="this.src='https://placehold.co/300x300?text=TuneCamp'" />
      <a href="${escapeHtml(itemUrl)}" target="_blank" rel="noopener noreferrer" class="cover-link" title="Apri su TuneCamp">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
      </a>
    </div>

    <div class="main-pane">
      <div class="header-row">
        <div class="badge-group">
          <a href="${escapeHtml(itemUrl)}" target="_blank" rel="noopener noreferrer" class="tc-badge" title="Ascolta su TuneCamp">
            [ TUNECAMP · ${escapeHtml(siteName)} ↗ ]
          </a>
          <span class="type-tag">${escapeHtml(badgeType)}</span>
        </div>
      </div>

      <div class="info-group">
        <div class="release-title" title="${escapeHtml(title)}">${escapeHtml(title)}</div>
        <div class="release-artist">di <strong>${escapeHtml(artist)}</strong></div>
        <div class="current-track-name" id="currentTrackTitle"></div>
      </div>

      <div class="controls-row">
        <button class="btn-icon" id="btnPrev" title="Traccia precedente" disabled>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 20L9 12l10-8v16zM5 19V5h2v14H5z"/></svg>
        </button>

        <button class="btn-play" id="btnPlay" title="Play">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" id="playIcon"><path d="M8 5v14l11-7z"/></svg>
        </button>

        <button class="btn-icon" id="btnNext" title="Traccia successiva" disabled>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M5 4l10 8-10 8V4zm12 1v14h2V5h-2z"/></svg>
        </button>

        <div class="progress-wrap">
          <div class="scrubber-bar" id="scrubberBar">
            <div class="scrubber-fill" id="scrubberFill"></div>
          </div>
          <div class="time-display">
            <span id="timeCurrent">00:00</span>
            <span id="timeDuration">00:00</span>
          </div>
        </div>
      </div>

      ${tracks.length > 1 ? `
        <div class="tracklist-drawer" id="tracklist">
          ${tracks.map((t, idx) => `
            <div class="track-item ${idx === 0 ? 'active' : ''}" data-index="${idx}">
              <span class="track-item-title">${idx + 1}. ${escapeHtml(t.title)}</span>
              <span>${formatDuration(t.duration)}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
    </div>
  </div>

  <audio id="audioElement" preload="metadata"></audio>

  <script>
    (function() {
      const tracks = ${tracksJson};
      let currentIndex = 0;
      let isPlaying = false;

      const audio = document.getElementById('audioElement');
      const btnPlay = document.getElementById('btnPlay');
      const btnPrev = document.getElementById('btnPrev');
      const btnNext = document.getElementById('btnNext');
      const scrubberBar = document.getElementById('scrubberBar');
      const scrubberFill = document.getElementById('scrubberFill');
      const timeCurrent = document.getElementById('timeCurrent');
      const timeDuration = document.getElementById('timeDuration');
      const currentTrackTitle = document.getElementById('currentTrackTitle');
      const tracklist = document.getElementById('tracklist');

      function formatTime(s) {
        if (isNaN(s) || s < 0) return '00:00';
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return (m < 10 ? '0' : '') + m + ':' + (sec < 10 ? '0' : '') + sec;
      }

      function updateTrackDisplay() {
        const cur = tracks[currentIndex];
        if (!cur) return;
        if (tracks.length > 1) {
          currentTrackTitle.textContent = (currentIndex + 1) + '. ' + cur.title;
        } else {
          currentTrackTitle.textContent = '';
        }

        if (tracklist) {
          const items = tracklist.querySelectorAll('.track-item');
          items.forEach((item, idx) => {
            item.classList.toggle('active', idx === currentIndex);
          });
        }

        btnPrev.disabled = currentIndex <= 0;
        btnNext.disabled = currentIndex >= tracks.length - 1;
      }

      function loadTrack(index, autoPlay) {
        if (index < 0 || index >= tracks.length) return;
        currentIndex = index;
        const track = tracks[currentIndex];
        audio.src = track.streamUrl;
        audio.load();
        updateTrackDisplay();

        if (autoPlay) {
          audio.play().catch(function(err) {
            console.warn('Playback error:', err);
          });
        }
      }

      function togglePlay() {
        if (audio.paused) {
          audio.play().catch(function(err) {
            console.warn('Playback error:', err);
          });
        } else {
          audio.pause();
        }
      }

      btnPlay.addEventListener('click', togglePlay);

      btnPrev.addEventListener('click', function() {
        if (currentIndex > 0) loadTrack(currentIndex - 1, true);
      });

      btnNext.addEventListener('click', function() {
        if (currentIndex < tracks.length - 1) loadTrack(currentIndex + 1, true);
      });

      if (tracklist) {
        tracklist.addEventListener('click', function(e) {
          const item = e.target.closest('.track-item');
          if (!item) return;
          const idx = parseInt(item.getAttribute('data-index'), 10);
          if (!isNaN(idx)) loadTrack(idx, true);
        });
      }

      audio.addEventListener('play', function() {
        isPlaying = true;
        btnPlay.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
      });

      audio.addEventListener('pause', function() {
        isPlaying = false;
        btnPlay.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
      });

      audio.addEventListener('timeupdate', function() {
        if (!audio.duration) return;
        const pct = (audio.currentTime / audio.duration) * 100;
        scrubberFill.style.width = pct + '%';
        timeCurrent.textContent = formatTime(audio.currentTime);
      });

      audio.addEventListener('durationchange', function() {
        timeDuration.textContent = formatTime(audio.duration);
      });

      audio.addEventListener('ended', function() {
        if (currentIndex < tracks.length - 1) {
          loadTrack(currentIndex + 1, true);
        } else {
          btnPlay.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
          scrubberFill.style.width = '0%';
          timeCurrent.textContent = '00:00';
        }
      });

      scrubberBar.addEventListener('click', function(e) {
        const rect = scrubberBar.getBoundingClientRect();
        const clickPos = (e.clientX - rect.left) / rect.width;
        if (audio.duration) {
          audio.currentTime = clickPos * audio.duration;
        }
      });

      // Initialize
      if (tracks.length > 0) {
        loadTrack(0, false);
      }
    })();
  </script>
</body>
</html>`);
  });

  function renderNotFound(msg: string): string {
    return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <title>Non trovato — TuneCamp</title>
  <style>
    body { background: #0c0d12; color: #94a3b8; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .box { text-align: center; padding: 20px; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; background: #13151c; }
    h2 { color: #f8fafc; font-size: 1.1rem; margin-bottom: 6px; }
    p { font-size: 0.85rem; }
  </style>
</head>
<body>
  <div class="box">
    <h2>Traccia o Release non trovata</h2>
    <p>${escapeHtml(msg)}</p>
  </div>
</body>
</html>`;
  }

  // Support /embed/:type/:idOrSlug and /embed/share/:type/:idOrSlug
  router.get("/:type(release|releases|album|albums|track|tracks)/:idOrSlug", renderEmbed);
  router.get("/share/:type(release|releases|album|albums|track|tracks)/:idOrSlug", renderEmbed);

  // Short alias: /embed/:idOrSlug (defaults to release/album search)
  router.get("/:idOrSlug", renderEmbed);

  return router;
}