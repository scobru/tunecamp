// TuneCamp Main Application

const App = {
  isAdmin: false,

  async init() {
    Player.init();
    await this.checkAuth();
    this.setupRouter();
    this.setupEventListeners();
    this.route();
  },

  async checkAuth() {
    try {
      const status = await API.getAuthStatus();
      this.isAdmin = status.authenticated;
      this.updateAuthUI(status);
    } catch (e) {
      console.error('Auth check failed:', e);
    }
  },

  updateAuthUI(status) {
    const btn = document.getElementById('admin-btn');
    if (status.firstRun) {
      btn.textContent = 'Setup Admin';
      btn.classList.add('btn-primary');
    } else if (this.isAdmin) {
      btn.textContent = 'Admin Panel';
      btn.classList.add('btn-primary');
    } else {
      btn.textContent = 'Login';
      btn.classList.remove('btn-primary');
    }
  },

  setupRouter() {
    window.addEventListener('hashchange', () => this.route());
  },

  setupEventListeners() {
    // Admin button
    document.getElementById('admin-btn').addEventListener('click', () => {
      if (this.isAdmin) {
        window.location.hash = '#/admin';
      } else {
        this.showLoginModal();
      }
    });

    // Modal close
    document.getElementById('modal-close').addEventListener('click', () => {
      this.hideModal();
    });

    // Login form
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleLogin();
    });

    // Nav links
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        e.target.classList.add('active');
      });
    });
  },

  async route() {
    const hash = window.location.hash || '#/';
    const path = hash.slice(1);
    const main = document.getElementById('main-content');

    try {
      if (path === '/' || path === '') {
        await this.renderHome(main);
      } else if (path === '/albums') {
        await this.renderAlbums(main);
      } else if (path.startsWith('/album/')) {
        const id = path.split('/')[2];
        await this.renderAlbum(main, id);
      } else if (path === '/tracks') {
        if (!this.isAdmin) {
          window.location.hash = '#/';
          return;
        }
        await this.renderTracks(main);
      } else if (path === '/artists') {
        await this.renderArtists(main);
      } else if (path.startsWith('/artist/')) {
        const id = path.split('/')[2];
        await this.renderArtist(main, id);
      } else if (path === '/search') {
        await this.renderSearch(main);
      } else if (path === '/admin') {
        if (this.isAdmin) {
          await this.renderAdmin(main);
        } else {
          window.location.hash = '#/';
        }
      } else {
        main.innerHTML = '<h1>Not Found</h1>';
      }
    } catch (e) {
      console.error('Route error:', e);
      main.innerHTML = '<div class="error-message">Error loading page</div>';
    }
  },

  // Views
  async renderHome(container) {
    try {
      const catalog = await API.getCatalog();

      container.innerHTML = `
        <section class="section">
          <h1 class="section-title">Welcome to TuneCamp</h1>
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-value">${catalog.stats.albums || 0}</div>
              <div class="stat-label">Albums</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${catalog.stats.tracks || 0}</div>
              <div class="stat-label">Tracks</div>
            </div>
          </div>
        </section>
        <section class="section">
          <div class="section-header">
            <h2 class="section-title">Recent Releases</h2>
            <a href="#/albums" class="btn btn-outline">View All</a>
          </div>
          <div class="grid" id="recent-albums"></div>
        </section>
      `;

      this.renderAlbumGrid(document.getElementById('recent-albums'), catalog.recentAlbums);
    } catch (e) {
      container.innerHTML = '<div class="error-message">Failed to load catalog</div>';
    }
  },

  async renderAlbums(container) {
    const albums = await API.getAlbums();

    container.innerHTML = `
      <section class="section">
        <h1 class="section-title">Albums</h1>
        <div class="grid" id="albums-grid"></div>
      </section>
    `;

    this.renderAlbumGrid(document.getElementById('albums-grid'), albums);
  },

  async renderAlbum(container, idOrSlug) {
    const album = await API.getAlbum(idOrSlug);

    // Build artist link
    const artistLink = album.artist_slug
      ? `<a href="#/artist/${album.artist_slug}" style="color: var(--text-secondary); text-decoration: none;">${album.artist_name || 'Unknown Artist'}</a>`
      : `<span style="color: var(--text-secondary);">${album.artist_name || 'Unknown Artist'}</span>`;

    container.innerHTML = `
      <div class="album-detail">
        <div class="album-header" style="display: flex; gap: 2rem; margin-bottom: 2rem;">
          <img src="${API.getAlbumCoverUrl(album.slug || album.id)}" alt="${album.title}" 
               style="width: 250px; height: 250px; border-radius: 12px; object-fit: cover;">
          <div>
            <h1>${album.title}</h1>
            <p style="margin-bottom: 1rem;">${artistLink}</p>
            ${album.date ? '<p style="color: var(--text-muted);">' + album.date + '</p>' : ''}
            ${album.genre ? '<p style="color: var(--text-muted);">' + album.genre + '</p>' : ''}
            ${album.description ? '<p style="color: var(--text-secondary); margin-top: 1rem; max-width: 500px; white-space: pre-wrap;">' + album.description + '</p>' : ''}
            ${album.download === 'free' ? '<a href="/api/albums/' + (album.slug || album.id) + '/download" class="btn btn-primary" style="margin-top: 1rem;">⬇️ Free Download</a>' : ''}
            
            ${(() => {
        if (album.external_links) {
          try {
            const links = JSON.parse(album.external_links);
            return links.map(link =>
              `<a href="${link.url}" target="_blank" class="btn btn-outline" style="margin-top: 1rem; margin-right: 0.5rem;">🔗 ${link.label}</a>`
            ).join('');
          } catch (e) { return ''; }
        }
        return '';
      })()}

            ${this.isAdmin && !album.is_release ? '<button class="btn btn-primary" id="promote-btn" style="margin-top: 1rem;">Promote to Release</button>' : ''}
          </div>
        </div>
        <div class="track-list" id="track-list"></div>
      </div>
    `;

    this.renderTrackList(document.getElementById('track-list'), album.tracks);

    // Promote handler
    if (this.isAdmin && !album.is_release) {
      document.getElementById('promote-btn').addEventListener('click', async () => {
        if (confirm('Promote this album to a public release?')) {
          try {
            await API.promoteToRelease(album.id);
            alert('Album promoted!');
            window.location.reload();
          } catch (e) {
            alert('Failed to promote: ' + e.message);
          }
        }
      });
    }
  },

  async renderArtists(container) {
    const artists = await API.getArtists();

    container.innerHTML = `
      <section class="section">
        <h1 class="section-title">Artists</h1>
        <div class="grid" id="artists-grid"></div>
      </section>
    `;

    const grid = document.getElementById('artists-grid');
    grid.innerHTML = artists.map(artist => `
      <a href="#/artist/${artist.slug || artist.id}" class="card">
        <div class="card-cover artist-cover-placeholder" data-src="${API.getArtistCoverUrl(artist.slug || artist.id)}">
          <div class="placeholder-icon">👤</div>
        </div>
        <div class="card-body">
          <div class="card-title">${artist.name}</div>
        </div>
      </a>
    `).join('');
    // Load artist images with fallback
    grid.querySelectorAll('.artist-cover-placeholder').forEach(el => {
      const img = new Image();
      img.onload = () => { el.innerHTML = ''; el.style.backgroundImage = `url(${el.dataset.src})`; el.style.backgroundSize = 'cover'; };
      img.onerror = () => { /* keep placeholder */ };
      img.src = el.dataset.src;
    });
  },

  async renderTracks(container) {
    const tracks = await API.getTracks();

    container.innerHTML = `
      <section class="section">
        <h1 class="section-title">All Tracks</h1>
        <div class="track-list" id="all-tracks-list"></div>
      </section>
    `;

    const list = document.getElementById('all-tracks-list');
    if (!tracks || tracks.length === 0) {
      list.innerHTML = '<p style="padding: 1rem; color: var(--text-secondary);">No tracks in library</p>';
      return;
    }

    list.innerHTML = tracks.map((track, index) => `
      <div class="track-item" data-track='${JSON.stringify(track).replace(/'/g, "&apos;")}' data-index="${index}">
        <div class="track-num">${index + 1}</div>
        <div class="track-info">
          <div class="track-title">${track.title}</div>
          <div style="color: var(--text-secondary); font-size: 0.875rem;">
            ${track.artist_name || 'Unknown Artist'}${track.album_title ? ' • ' + track.album_title : ''}
          </div>
        </div>
        <div class="track-duration">${Player.formatTime(track.duration)}</div>
        ${this.isAdmin && !track.album_id && track.file_path.includes('library') ?
        `<button class="btn btn-sm btn-outline add-to-release-btn" title="Add to Release" 
            style="margin-left: 1rem; padding: 2px 8px; font-size: 0.8rem;" 
            onclick="event.stopPropagation(); App.showAddToReleaseModal(${track.id}, '${track.title.replace(/'/g, "\\'")}')">
            + Release
           </button>` : ''}
        ${this.isAdmin ?
        `<button class="btn btn-sm btn-outline edit-track-btn" title="Edit Track" 
            style="margin-left: 0.5rem; padding: 2px 8px; font-size: 0.8rem;" 
            onclick="event.stopPropagation(); App.showEditTrackModal(${track.id})">
            ✏️
           </button>` : ''}
      </div>
    `).join('');

    this.attachTrackListeners(tracks);
  },

  async renderArtist(container, id) {
    const artist = await API.getArtist(id);

    const hasAlbums = artist.albums && artist.albums.length > 0;
    const hasTracks = artist.tracks && artist.tracks.length > 0;

    // Build links HTML
    let linksHtml = '';
    if (artist.links && Array.isArray(artist.links)) {
      const linkIcons = {
        website: '🌐',
        bandcamp: '🎵',
        spotify: '🎧',
        instagram: '📷',
        twitter: '🐦',
        youtube: '▶️',
        soundcloud: '☁️',
        facebook: '📘',
      };

      linksHtml = '<div class="artist-links" style="display: flex; gap: 1rem; margin-bottom: 2rem; flex-wrap: wrap;">';
      for (const linkObj of artist.links) {
        for (const [key, url] of Object.entries(linkObj)) {
          const icon = linkIcons[key] || '🔗';
          const name = key.charAt(0).toUpperCase() + key.slice(1);
          linksHtml += `<a href="${url}" target="_blank" class="btn btn-outline" style="gap: 0.5rem;"><span>${icon}</span> ${name}</a>`;
        }
      }
      linksHtml += '</div>';
    }

    container.innerHTML = `
      <section class="section">
        <div class="artist-header" style="display: flex; gap: 2rem; margin-bottom: 2rem; align-items: flex-start;">
          <div class="artist-cover-placeholder artist-header-cover" data-src="${API.getArtistCoverUrl(artist.slug || artist.id)}">
            <div class="placeholder-icon">👤</div>
          </div>
          <div style="flex: 1;">
            <h1 class="section-title" style="margin-bottom: 0.5rem;">${artist.name}</h1>
            ${artist.bio ? '<p style="color: var(--text-secondary); margin-bottom: 1rem; max-width: 600px;">' + artist.bio + '</p>' : ''}
            ${linksHtml}
          </div>
        </div>
        ${hasAlbums ? '<h2 class="section-title" style="font-size: 1.25rem; margin-bottom: 1rem;">Albums</h2>' : ''}
        <div class="grid" id="artist-albums"></div>
        ${hasTracks ? '<h2 class="section-title" style="font-size: 1.25rem; margin: 2rem 0 1rem;">Tracks</h2>' : ''}
        <div class="track-list" id="artist-tracks"></div>
      </section>
    `;

    // Load artist header image with fallback
    const artistHeaderCover = container.querySelector('.artist-header-cover');
    if (artistHeaderCover) {
      const img = new Image();
      img.onload = () => {
        artistHeaderCover.innerHTML = '';
        artistHeaderCover.style.backgroundImage = `url(${artistHeaderCover.dataset.src})`;
        artistHeaderCover.style.backgroundSize = 'cover';
        artistHeaderCover.style.backgroundPosition = 'center';
      };
      img.onerror = () => { /* keep placeholder */ };
      img.src = artistHeaderCover.dataset.src;
    }

    if (hasAlbums) {
      this.renderAlbumGrid(document.getElementById('artist-albums'), artist.albums);
    } else {
      document.getElementById('artist-albums').innerHTML = '<p style="color: var(--text-secondary);">No albums found</p>';
    }

    if (hasTracks) {
      this.renderTrackList(document.getElementById('artist-tracks'), artist.tracks);
    }
  },

  async renderSearch(container) {
    container.innerHTML = `
      <section class="section">
        <h1 class="section-title">Search</h1>
        <div class="search-container">
          <input type="text" class="search-input" id="search-input" placeholder="Search for albums, artists, or tracks...">
        </div>
        <div id="search-results"></div>
      </section>
    `;

    let timeout;
    document.getElementById('search-input').addEventListener('input', (e) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => this.performSearch(e.target.value), 300);
    });
  },

  async performSearch(query) {
    const results = document.getElementById('search-results');

    if (query.length < 2) {
      results.innerHTML = '';
      return;
    }

    try {
      const data = await API.search(query);

      let html = '';

      if (data.artists.length > 0) {
        html += '<h3 style="margin: 1rem 0;">Artists</h3>';
        html += '<div class="grid">';
        html += data.artists.map(a => `
          <a href="#/artist/${a.id}" class="card">
            <div class="card-cover" style="display: flex; align-items: center; justify-content: center; font-size: 3rem;">👤</div>
            <div class="card-body"><div class="card-title">${a.name}</div></div>
          </a>
        `).join('');
        html += '</div>';
      }

      if (data.albums.length > 0) {
        html += '<h3 style="margin: 1rem 0;">Albums</h3>';
        html += '<div class="grid">';
        html += data.albums.map(a => `
          <a href="#/album/${a.id}" class="card">
            <img src="${API.getAlbumCoverUrl(a.id)}" class="card-cover" alt="${a.title}">
            <div class="card-body">
              <div class="card-title">${a.title}</div>
              <div class="card-subtitle">${a.artist_name || ''}</div>
            </div>
          </a>
        `).join('');
        html += '</div>';
      }

      if (data.tracks.length > 0) {
        html += '<h3 style="margin: 1rem 0;">Tracks</h3>';
        html += '<div class="track-list">';
        data.tracks.forEach((t, i) => {
          html += `
            <div class="track-item" data-track='${JSON.stringify(t).replace(/'/g, "&apos;")}' data-index="${i}">
              <div class="track-info">
                <div class="track-title">${t.title}</div>
                <div style="color: var(--text-secondary); font-size: 0.875rem;">${t.artist_name || ''}</div>
              </div>
              <div class="track-duration">${Player.formatTime(t.duration)}</div>
            </div>
          `;
        });
        html += '</div>';
      }

      if (!html) {
        html = '<p style="color: var(--text-secondary); text-align: center;">No results found</p>';
      }

      results.innerHTML = html;
      this.attachTrackListeners();
    } catch (e) {
      results.innerHTML = '<div class="error-message">Search failed</div>';
    }
  },

  async renderAdmin(container) {
    const [releases, stats] = await Promise.all([
      API.getAdminReleases(),
      API.getAdminStats()
    ]);

    container.innerHTML = `
      <section class="section">
        <div class="admin-header">
          <h1 class="section-title">Admin Panel</h1>
          <div>
            <button class="btn btn-primary" id="new-release-btn">+ New Release</button>
            <button class="btn btn-outline" id="new-artist-btn">+ New Artist</button>
            <button class="btn btn-outline" id="upload-btn">📤 Upload Tracks</button>
            <button class="btn btn-outline" id="rescan-btn">🔄 Rescan</button>
            <button class="btn btn-outline" id="logout-btn">Logout</button>
          </div>
        </div>
        
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">${stats.artists}</div>
            <div class="stat-label">Artists</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.albums}</div>
            <div class="stat-label">Albums</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.tracks}</div>
            <div class="stat-label">Tracks</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.publicAlbums}</div>
            <div class="stat-label">Public</div>
          </div>
        </div>
        
        <!-- Upload Panel (hidden by default) -->
        <div id="upload-panel" class="admin-panel" style="display: none;">
          <h3>Upload Tracks to Library</h3>
          <div class="upload-zone" id="upload-zone">
            <input type="file" id="file-input" multiple accept="audio/*" style="display: none;">
            <p>📁 Drag & drop audio files here or <button class="btn btn-outline btn-sm" id="browse-btn">Browse</button></p>
            <p style="font-size: 0.8rem; color: var(--text-muted);">Supports: MP3, FLAC, OGG, WAV, M4A, AAC, OPUS</p>
          </div>
          <div id="upload-progress" style="display: none;">
            <div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>
            <p id="upload-status"></p>
          </div>
        </div>

        <!-- New Release Panel (hidden by default) -->
        <div id="release-panel" class="admin-panel" style="display: none;">
          <h3>Create New Release</h3>
          <form id="release-form">
            <div class="form-row">
              <div class="form-group">
                <label>Title *</label>
                <input type="text" id="release-title" required placeholder="Album title">
              </div>
              <div class="form-group">
                <label>Artist *</label>
                <select id="release-artist" required>
                  <option value="">Select Artist...</option>
                </select>
              </div>
              <div class="form-group">
                <label>Release Date</label>
                <input type="date" id="release-date" value="${new Date().toISOString().split('T')[0]}">
              </div>
            </div>
            <div class="form-group">
              <label>Description</label>
              <textarea id="release-description" rows="3" placeholder="Optional description..."></textarea>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Genres (comma separated)</label>
                <input type="text" id="release-genres" placeholder="Electronic, Ambient, etc.">
              </div>
              <div class="form-group">
                <label>Download Type</label>
                <select id="release-download">
                  <option value="free">Free Download</option>
                  <option value="paycurtain">Pay What You Want</option>
                  <option value="none">No Download</option>
                </select>
              </div>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn btn-primary">Create Release</button>
              <button type="button" class="btn btn-outline" id="cancel-release">Cancel</button>
            </div>
          </form>
        </div>
        
        <h2 class="section-title" style="font-size: 1.25rem; margin: 2rem 0 1rem;">Manage Releases</h2>
        <div id="releases-list"></div>
        
        <h2 class="section-title" style="font-size: 1.25rem; margin: 2rem 0 1rem;">Manage Artists</h2>
        <div id="artists-list"></div>
      </section>
    `;

    const list = document.getElementById('releases-list');
    list.innerHTML = releases.map(r => `
      <div class="release-row" data-release-id="${r.id}">
        <div class="release-cover-small album-cover-placeholder" data-src="${API.getAlbumCoverUrl(r.id)}">
          <div class="placeholder-icon" style="font-size: 1.5rem;">🎵</div>
        </div>
        <div class="release-info">
          <div class="release-title">${r.title}</div>
          <div class="release-artist">${r.artist_name || 'Unknown Artist'}</div>
        </div>
        <div class="release-actions">
          <button class="btn btn-sm btn-outline edit-release" data-id="${r.id}">✏️ Edit</button>
          <button class="btn btn-sm btn-outline upload-to-release" data-slug="${r.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}">+ Add Tracks</button>
          <button class="btn btn-sm btn-outline btn-danger delete-release">🗑️</button>
        </div>
        <div class="release-status">
          <span class="status-badge ${r.is_public ? 'status-public' : 'status-private'}">
            ${r.is_public ? 'Public' : 'Private'}
          </span>
          <label class="toggle">
            <input type="checkbox" ${r.is_public ? 'checked' : ''} data-album-id="${r.id}">
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    `).join('');

    // Load release covers with fallback
    list.querySelectorAll('.album-cover-placeholder').forEach(el => {
      const img = new Image();
      img.onload = () => { el.innerHTML = ''; el.style.backgroundImage = `url(${el.dataset.src})`; el.style.backgroundSize = 'cover'; };
      img.onerror = () => { /* keep placeholder */ };
      img.src = el.dataset.src;
    });

    // Render artists list
    const artistsList = document.getElementById('artists-list');
    const allArtists = await API.getArtists();
    artistsList.innerHTML = allArtists.map(a => `
      <div class="release-row" data-artist-id="${a.id}">
        <div class="release-cover-small artist-cover-placeholder" data-src="${API.getArtistCoverUrl(a.id)}">
          <div class="placeholder-icon" style="font-size: 1.5rem;">👤</div>
        </div>
        <div class="release-info">
          <div class="release-title">${a.name}</div>
          <div class="release-artist">${a.bio ? a.bio.substring(0, 50) + '...' : 'No bio'}</div>
        </div>
        <div class="release-actions">
          <button class="btn btn-sm btn-outline edit-artist" data-id="${a.id}">✏️ Edit</button>
        </div>
      </div>
    `).join('');

    // Load artist images
    artistsList.querySelectorAll('.artist-cover-placeholder').forEach(el => {
      const img = new Image();
      img.onload = () => { el.innerHTML = ''; el.style.backgroundImage = `url(${el.dataset.src})`; el.style.backgroundSize = 'cover'; };
      img.onerror = () => { /* keep placeholder */ };
      img.src = el.dataset.src;
    });

    // Edit artist handlers
    artistsList.querySelectorAll('.edit-artist').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.target.dataset.id;
        this.showEditArtistModal(id);
      });
    });

    // Toggle visibility handlers
    list.querySelectorAll('input[type="checkbox"]').forEach(input => {
      input.addEventListener('change', async (e) => {
        const id = e.target.dataset.albumId;
        const isPublic = e.target.checked;
        try {
          await API.toggleVisibility(id, isPublic);
          const badge = e.target.closest('.release-row').querySelector('.status-badge');
          badge.className = 'status-badge ' + (isPublic ? 'status-public' : 'status-private');
          badge.textContent = isPublic ? 'Public' : 'Private';
        } catch (err) {
          e.target.checked = !isPublic;
          alert('Failed to update visibility');
        }
      });
    });

    // Delete release handlers
    list.querySelectorAll('.delete-release').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const row = e.target.closest('.release-row');
        const id = row.dataset.releaseId;
        const title = row.querySelector('.release-title').textContent;

        if (confirm(`Delete "${title}"? This will remove all files!`)) {
          try {
            await API.deleteRelease(id);
            row.remove();
          } catch (err) {
            alert('Failed to delete release');
          }
        }
      });
    });

    // Edit release handlers
    list.querySelectorAll('.edit-release').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.dataset.id;
        this.showEditReleaseModal(id);
      });
    });

    // Add tracks to release handlers
    list.querySelectorAll('.upload-to-release').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const slug = e.target.dataset.slug;
        this.showUploadToRelease(slug);
      });
    });

    // Upload panel toggle
    document.getElementById('upload-btn').addEventListener('click', () => {
      const panel = document.getElementById('upload-panel');
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      document.getElementById('release-panel').style.display = 'none';
    });

    // New release panel toggle
    document.getElementById('new-release-btn').addEventListener('click', async () => {
      const panel = document.getElementById('release-panel');
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      document.getElementById('upload-panel').style.display = 'none';

      // Populate artists
      try {
        const artists = await API.getArtists();
        const select = document.getElementById('release-artist');
        select.innerHTML = '<option value="">Select Artist...</option>' +
          artists.map(a => `<option value="${a.name}">${a.name}</option>`).join('');
      } catch (e) { console.error("Failed to load artists", e); }
    });

    document.getElementById('cancel-release').addEventListener('click', () => {
      document.getElementById('release-panel').style.display = 'none';
    });

    // Release form
    document.getElementById('release-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleCreateRelease();
    });

    // Upload handlers
    this.setupUploadHandlers();

    // Rescan button
    document.getElementById('rescan-btn').addEventListener('click', async () => {
      const btn = document.getElementById('rescan-btn');
      btn.disabled = true;
      btn.textContent = 'Scanning...';
      try {
        await API.rescan();
        window.location.reload();
      } catch (e) {
        alert('Scan failed');
        btn.disabled = false;
        btn.textContent = '🔄 Rescan';
      }
    });

    // Logout button
    document.getElementById('logout-btn').addEventListener('click', () => {
      API.logout();
      this.isAdmin = false;
      this.checkAuth();
      window.location.hash = '#/';
    });

    // New Artist button
    document.getElementById('new-artist-btn').addEventListener('click', () => {
      this.showCreateArtistModal();
    });
  },

  setupUploadHandlers() {
    const zone = document.getElementById('upload-zone');
    const input = document.getElementById('file-input');
    const browseBtn = document.getElementById('browse-btn');

    browseBtn.addEventListener('click', () => input.click());

    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('dragover');
    });

    zone.addEventListener('dragleave', () => {
      zone.classList.remove('dragover');
    });

    zone.addEventListener('drop', async (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      await this.uploadFiles(e.dataTransfer.files);
    });

    input.addEventListener('change', async (e) => {
      await this.uploadFiles(e.target.files);
    });
  },

  async uploadFiles(files, options = {}) {
    if (files.length === 0) return;

    const progress = document.getElementById('upload-progress');
    const status = document.getElementById('upload-status');
    const fill = document.getElementById('progress-fill');

    progress.style.display = 'block';
    status.textContent = `Uploading ${files.length} file(s)...`;
    fill.style.width = '50%';

    try {
      const result = await API.uploadTracks(files, options);
      fill.style.width = '100%';
      status.textContent = `✅ Uploaded ${result.files.length} file(s)`;

      // Refresh after a short delay
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      status.textContent = '❌ Upload failed: ' + err.message;
      fill.style.width = '0%';
    }
  },

  showUploadToRelease(slug) {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'audio/*';

    input.addEventListener('change', async (e) => {
      await this.uploadFiles(e.target.files, { releaseSlug: slug });
    });

    input.click();
  },

  async handleCreateRelease() {
    const title = document.getElementById('release-title').value;
    const artistName = document.getElementById('release-artist').value;
    const date = document.getElementById('release-date').value;
    const description = document.getElementById('release-description').value;
    const genresRaw = document.getElementById('release-genres').value;
    const download = document.getElementById('release-download').value;

    const genres = genresRaw ? genresRaw.split(',').map(g => g.trim()).filter(g => g) : [];

    try {
      await API.createRelease({
        title,
        artistName,
        date,
        description: description || undefined,
        genres: genres.length > 0 ? genres : undefined,
        download
      });

      alert('Release created! Add tracks and cover via the release actions.');
      window.location.reload();
    } catch (err) {
      alert('Failed to create release: ' + err.message);
    }
  },

  // Helpers
  async showAddToReleaseModal(trackId, trackTitle) {
    const releases = await API.getAdminReleases();

    // Create modal content
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.id = 'add-track-modal';

    const options = releases.map(r => `<option value="${r.id}">${r.title}</option>`).join('');

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px;">
          <h2 class="section-title">Add Track to Release</h2>
          <p>Track: <strong>${trackTitle}</strong></p>
          <div class="form-group">
            <label>Select Target Release:</label>
            <select id="target-release-select" style="width: 100%; padding: 0.5rem; margin: 1rem 0;">
              ${options}
            </select>
          </div>
          <div class="form-actions">
            <button class="btn btn-primary" id="confirm-add-track">Add to Release</button>
            <button class="btn btn-outline" onclick="document.getElementById('add-track-modal').remove()">Cancel</button>
          </div>
        </div>
      `;

    document.body.appendChild(modal);

    document.getElementById('confirm-add-track').addEventListener('click', async () => {
      const releaseId = document.getElementById('target-release-select').value;
      try {
        await API.addTrackToRelease(releaseId, trackId);
        document.getElementById('add-track-modal').remove();
        alert('Track added to release!');
        // Ideally refresh UI or remove row, for now reload
        window.location.reload();
      } catch (e) {
        alert('Failed to add track: ' + e.message);
      }
    });
  },

  async showEditReleaseModal(releaseId) {
    // Fetch release details and artists
    const [release, artists] = await Promise.all([
      API.getAlbum(releaseId),
      API.getArtists()
    ]);

    const artistOptions = artists.map(a =>
      `<option value="${a.name}" ${a.name === release.artist_name ? 'selected' : ''}>${a.name}</option>`
    ).join('');

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.id = 'edit-release-modal';

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
          <h2 class="section-title">Edit Release: ${release.title}</h2>
          <form id="edit-release-form">
            <div class="form-group">
              <label>Cover Image</label>
              <div style="display: flex; align-items: center; gap: 1rem;">
                <div class="cover-preview" style="width: 100px; height: 100px; border-radius: 8px; background: var(--bg-secondary); display: flex; align-items: center; justify-content: center; font-size: 2rem; background-size: cover; background-position: center;" id="cover-preview">
                  ${release.cover_path ? '' : '🎵'}
                </div>
                <input type="file" id="edit-release-cover" accept="image/*" style="flex: 1;">
              </div>
            </div>
            <div class="form-group">
              <label>Title</label>
              <input type="text" id="edit-release-title" value="${release.title}" required>
            </div>
            <div class="form-group">
              <label>Artist</label>
              <select id="edit-release-artist">
                <option value="">Select Artist...</option>
                ${artistOptions}
              </select>
            </div>
            <div class="form-group">
              <label>Date</label>
              <input type="date" id="edit-release-date" value="${release.date || ''}">
            </div>
            <div class="form-group">
              <label>Description</label>
              <textarea id="edit-release-description" rows="3">${release.description || ''}</textarea>
            </div>
            <div class="form-group">
              <label>Genres (comma separated)</label>
              <input type="text" id="edit-release-genres" value="${release.genre || ''}">
            </div>
            <div class="form-group">
              <label>Download Type</label>
              <select id="edit-release-download">
                <option value="" ${!release.download ? 'selected' : ''}>Streaming Only</option>
                <option value="free" ${release.download === 'free' ? 'selected' : ''}>Free Download</option>
              </select>
            </div>
            
            <div class="form-group">
                <label>External Links (e.g. Bandcamp, Donation)</label>
                <div id="external-links-container" style="display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.5rem;">
                    <!-- Links injected here -->
                </div>
                <button type="button" class="btn btn-outline btn-sm" id="add-external-link">＋ Add Link</button>
            </div>
            <div class="form-actions" style="justify-content: space-between;">
              <div>
                <button type="submit" class="btn btn-primary">Save Changes</button>
                <button type="button" class="btn btn-outline" id="cancel-edit-release">Cancel</button>
              </div>
              <button type="button" class="btn btn-outline" id="delete-release-btn" style="border-color: var(--color-danger); color: var(--color-danger);">Delete Release</button>
            </div>
          </form>
        </div>
      `;

    document.body.appendChild(modal);

    // Set cover preview if exists
    if (release.cover_path) {
      document.getElementById('cover-preview').style.backgroundImage = `url(${API.getAlbumCoverUrl(release.slug || release.id)})`;
    }

    // Cover file preview
    document.getElementById('edit-release-cover').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          document.getElementById('cover-preview').style.backgroundImage = `url(${ev.target.result})`;
          document.getElementById('cover-preview').innerHTML = '';
        };
        reader.readAsDataURL(file);
      }
    });

    document.getElementById('cancel-edit-release').addEventListener('click', () => {
      document.getElementById('edit-release-modal').remove();
    });

    // External Links Logic
    const linksContainer = document.getElementById('external-links-container');
    const existingLinks = release.external_links ? JSON.parse(release.external_links) : [];

    function addLinkInput(label = '', url = '') {
      const div = document.createElement('div');
      div.style.display = 'flex';
      div.style.gap = '0.5rem';
      div.innerHTML = `
            <input type="text" placeholder="Label (e.g. Bandcamp)" class="link-label" value="${label}" style="flex: 1;">
            <input type="text" placeholder="URL (https://...)" class="link-url" value="${url}" style="flex: 2;">
            <button type="button" class="btn btn-outline btn-sm remove-link" style="color: var(--color-danger); border-color: var(--color-danger);">✕</button>
        `;
      div.querySelector('.remove-link').onclick = () => div.remove();
      linksContainer.appendChild(div);
    }

    // Populate existing
    existingLinks.forEach(link => addLinkInput(link.label, link.url));

    document.getElementById('add-external-link').onclick = () => addLinkInput();

    document.getElementById('edit-release-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('edit-release-title').value;
      const artistName = document.getElementById('edit-release-artist').value;
      const date = document.getElementById('edit-release-date').value;
      const description = document.getElementById('edit-release-description').value;
      const genresRaw = document.getElementById('edit-release-genres').value;
      const genres = genresRaw ? genresRaw.split(',').map(g => g.trim()).filter(g => g) : [];
      const coverFile = document.getElementById('edit-release-cover').files[0];
      const download = document.getElementById('edit-release-download').value;

      try {
        // Update release info
        await API.updateRelease(releaseId, {
          title,
          artistName: artistName || undefined,
          date: date || undefined,
          description: description || undefined,
          genres: genres.length > 0 ? genres : undefined,
          genres: genres.length > 0 ? genres : undefined,
          download: download || undefined,
          externalLinks: Array.from(document.querySelectorAll('#external-links-container > div')).map(div => ({
            label: div.querySelector('.link-label').value.trim(),
            url: div.querySelector('.link-url').value.trim()
          })).filter(l => l.label && l.url)
        });

        // Upload cover if provided
        if (coverFile) {
          await API.uploadCover(coverFile, release.slug);
        }

        document.getElementById('edit-release-modal').remove();
        alert('Release updated!');
        window.location.reload();
      } catch (err) {
        alert('Failed to update release: ' + err.message);
      }
    });

    document.getElementById('delete-release-btn').addEventListener('click', () => {
      const choiceModal = document.createElement('div');
      choiceModal.className = 'modal';
      choiceModal.style.display = 'flex';
      choiceModal.style.zIndex = '10001';
      choiceModal.innerHTML = `
            <div class="modal-content" style="max-width: 400px; text-align: center;">
                <h3>Delete Release</h3>
                <p>How do you want to delete this release?</p>
                <div style="display: flex; flex-direction: column; gap: 1rem; margin-top: 1.5rem;">
                    <button class="btn btn-primary" id="del-release-keep">Delete & Keep Files</button>
                    <p style="font-size: 0.8rem; color: var(--text-muted);">Removes release metadata but keeps audio files in library.</p>
                    
                    <button class="btn btn-outline" id="del-release-all" style="border-color: var(--color-danger); color: var(--color-danger);">Delete Everything</button>
                    <p style="font-size: 0.8rem; color: var(--text-muted);">Permanently deletes release and all files from disk.</p>
                    
                    <button class="btn btn-outline" id="del-release-cancel">Cancel</button>
                </div>
            </div>
        `;
      document.body.appendChild(choiceModal);

      document.getElementById('del-release-cancel').onclick = () => choiceModal.remove();

      document.getElementById('del-release-keep').onclick = async () => {
        if (confirm("Are you sure you want to delete the release record but keep files?")) {
          try {
            await API.deleteRelease(releaseId, true);
            alert("Release deleted (Files kept in library)");
            window.location.hash = '#albums';
            window.location.reload();
          } catch (e) {
            alert("Error: " + e.message);
          }
        }
        choiceModal.remove();
      };

      document.getElementById('del-release-all').onclick = async () => {
        if (confirm("WARNING: This will PERMANENTLY DELETE all files. Are you sure?")) {
          try {
            await API.deleteRelease(releaseId, false);
            alert("Release and files deleted permanently.");
            window.location.hash = '#albums';
            window.location.reload();
          } catch (e) {
            alert("Error: " + e.message);
          }
        }
        choiceModal.remove();
      };
    });
  },

  async showEditArtistModal(artistId) {
    const artist = await API.getArtist(artistId);

    // Parse links to display format
    let linksText = '';
    if (artist.links && Array.isArray(artist.links)) {
      for (const linkObj of artist.links) {
        for (const [key, url] of Object.entries(linkObj)) {
          linksText += `${key}: ${url}\n`;
        }
      }
    }

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.id = 'edit-artist-modal';

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
          <h2 class="section-title">Edit Artist: ${artist.name}</h2>
          <form id="edit-artist-form">
            <div class="form-group">
              <label>Avatar</label>
              <div style="display: flex; align-items: center; gap: 1rem;">
                <div class="artist-avatar-preview" style="width: 80px; height: 80px; border-radius: 50%; background: var(--bg-secondary); display: flex; align-items: center; justify-content: center; font-size: 2rem; background-size: cover; background-position: center;" id="avatar-preview">
                  ${artist.photo_path ? '' : '👤'}
                </div>
                <input type="file" id="edit-artist-avatar" accept="image/*" style="flex: 1;">
              </div>
            </div>
            <div class="form-group">
              <label>Bio</label>
              <textarea id="edit-artist-bio" rows="3">${artist.bio || ''}</textarea>
            </div>
            <div class="form-group">
              <label>Links (one per line, format: platform: url)</label>
              <textarea id="edit-artist-links" rows="4">${linksText.trim()}</textarea>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn btn-primary">Save Changes</button>
              <button type="button" class="btn btn-outline" id="cancel-edit-artist">Cancel</button>
              <button type="button" class="btn btn-danger btn-outline" id="delete-artist-btn" style="color: var(--color-danger); border-color: var(--color-danger); margin-left: auto;">Delete Artist</button>
            </div>
          </form>
        </div>
      `;

    document.body.appendChild(modal);

    // Set avatar preview if exists
    if (artist.photo_path) {
      document.getElementById('avatar-preview').style.backgroundImage = `url(${API.getArtistCoverUrl(artist.id)})`;
    }

    // Avatar file preview
    document.getElementById('edit-artist-avatar').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          document.getElementById('avatar-preview').style.backgroundImage = `url(${ev.target.result})`;
          document.getElementById('avatar-preview').innerHTML = '';
        };
        reader.readAsDataURL(file);
      }
    });

    document.getElementById('cancel-edit-artist').addEventListener('click', () => {
      document.getElementById('edit-artist-modal').remove();
    });

    document.getElementById('delete-artist-btn').addEventListener('click', async () => {
      if (confirm('Are you sure you want to delete this artist? This will also unlink all their albums and tracks.')) {
        try {
          await API.deleteArtist(artistId);
          document.getElementById('edit-artist-modal').remove();
          alert('Artist deleted');
          window.location.reload();
        } catch (err) {
          alert('Failed to delete artist: ' + err.message);
        }
      }
    });

    document.getElementById('edit-artist-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const bio = document.getElementById('edit-artist-bio').value;
      const linksRaw = document.getElementById('edit-artist-links').value;
      const avatarFile = document.getElementById('edit-artist-avatar').files[0];

      // Parse links
      let links = [];
      if (linksRaw.trim()) {
        const lines = linksRaw.split('\n').filter(l => l.trim());
        for (const line of lines) {
          const match = line.match(/^([\w]+):\s*(.+)$/);
          if (match) {
            links.push({ [match[1].toLowerCase()]: match[2].trim() });
          }
        }
      }

      try {
        // Update artist info
        await API.updateArtist(artistId, {
          bio: bio || undefined,
          links: links.length > 0 ? links : undefined
        });

        // Upload avatar if provided
        if (avatarFile) {
          await API.uploadArtistAvatar(artistId, avatarFile);
        }

        document.getElementById('edit-artist-modal').remove();
        alert('Artist updated!');
        window.location.reload();
      } catch (err) {
        alert('Failed to update artist: ' + err.message);
      }
    });
  },

  async showEditTrackModal(trackId) {
    const track = await API.getTrack(trackId);

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.id = 'edit-track-modal';

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
          <h2 class="section-title">Edit Track</h2>
          <p style="color: var(--text-muted); margin-bottom: 1rem; font-size: 0.9rem;">File: ${track.file_path.split('\\').pop() || track.file_path.split('/').pop()}</p>
          <form id="edit-track-form">
            <div class="form-group">
              <label>Title</label>
              <input type="text" id="edit-track-title" value="${track.title || ''}" required>
            </div>
            <div class="form-group">
              <label>Artist</label>
              <input type="text" id="edit-track-artist" value="${track.artist_name || ''}">
            </div>
            <div class="form-group">
              <label>Genre</label>
              <input type="text" id="edit-track-genre" value="">
            </div>
            <div class="form-group">
              <label>Track Number</label>
              <input type="number" id="edit-track-number" value="${track.track_num || ''}" min="1">
            </div>
            <p style="color: var(--text-muted); font-size: 0.8rem; margin-top: 1rem;">
              ℹ️ ID3 tags will be updated for MP3 files. Other formats update database only.
            </p>
            <div class="form-actions" style="justify-content: space-between;">
              <div>
                <button type="submit" class="btn btn-primary">Save Changes</button>
                <button type="button" class="btn btn-outline" id="cancel-edit-track">Cancel</button>
              </div>
              <button type="button" class="btn btn-outline" id="delete-track-btn" style="border-color: var(--color-danger); color: var(--color-danger);">Delete Track</button>
            </div>
          </form>
        </div>
      `;

    document.body.appendChild(modal);

    document.getElementById('cancel-edit-track').addEventListener('click', () => {
      document.getElementById('edit-track-modal').remove();
    });

    document.getElementById('edit-track-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('edit-track-title').value;
      const artist = document.getElementById('edit-track-artist').value;
      const genre = document.getElementById('edit-track-genre').value;
      const trackNumber = document.getElementById('edit-track-number').value;

      try {
        await API.updateTrack(trackId, {
          title: title || undefined,
          artist: artist || undefined,
          genre: genre || undefined,
          trackNumber: trackNumber ? parseInt(trackNumber) : undefined
        });
        document.getElementById('edit-track-modal').remove();
        alert('Track updated!');
        window.location.reload();
      } catch (err) {
        alert('Failed to update track: ' + err.message);
      }
    });

    document.getElementById('delete-track-btn').addEventListener('click', () => {
      const choiceModal = document.createElement('div');
      choiceModal.className = 'modal';
      choiceModal.style.display = 'flex';
      choiceModal.style.zIndex = '10001';
      choiceModal.innerHTML = `
            <div class="modal-content" style="max-width: 400px; text-align: center;">
                <h3>Delete Track</h3>
                <p>How do you want to delete this track?</p>
                <div style="display: flex; flex-direction: column; gap: 1rem; margin-top: 1.5rem;">
                    <button class="btn btn-primary" id="del-track-db">Remove from Library</button>
                    <p style="font-size: 0.8rem; color: var(--text-muted);">Removes metadata from database only. File remains on disk.</p>
                    
                    <button class="btn btn-outline" id="del-track-file" style="border-color: var(--color-danger); color: var(--color-danger);">Delete File</button>
                    <p style="font-size: 0.8rem; color: var(--text-muted);">Permanently deletes file from disk.</p>
                    
                    <button class="btn btn-outline" id="del-track-cancel">Cancel</button>
                </div>
            </div>
        `;
      document.body.appendChild(choiceModal);

      document.getElementById('del-track-cancel').onclick = () => choiceModal.remove();

      document.getElementById('del-track-db').onclick = async () => {
        if (confirm("Remove track from library? (File will stay)")) {
          try {
            await API.deleteTrack(trackId, false);
            alert("Track removed from library");
            window.location.reload();
          } catch (e) {
            alert("Error: " + e.message);
          }
        }
        choiceModal.remove();
      };

      document.getElementById('del-track-file').onclick = async () => {
        if (confirm("WARNING: This will PERMANENTLY DELETE the file. Are you sure?")) {
          try {
            await API.deleteTrack(trackId, true);
            alert("Track and file deleted permanently.");
            window.location.reload();
          } catch (e) {
            alert("Error: " + e.message);
          }
        }
        choiceModal.remove();
      };
    });
  },

  showCreateArtistModal() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.id = 'create-artist-modal';

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
          <h2 class="section-title">Create New Artist</h2>
          <form id="create-artist-form">
            <div class="form-group">
              <label>Name *</label>
              <input type="text" id="new-artist-name" required placeholder="Artist name">
            </div>
            <div class="form-group">
              <label>Bio</label>
              <textarea id="new-artist-bio" rows="3" placeholder="Short biography..."></textarea>
            </div>
            <div class="form-group">
              <label>Links (one per line, format: platform: url)</label>
              <textarea id="new-artist-links" rows="4" placeholder="website: https://example.com
instagram: https://instagram.com/artist
bandcamp: https://artist.bandcamp.com"></textarea>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn btn-primary">Create Artist</button>
              <button type="button" class="btn btn-outline" id="cancel-create-artist">Cancel</button>
            </div>
          </form>
        </div>
      `;

    document.body.appendChild(modal);

    document.getElementById('cancel-create-artist').addEventListener('click', () => {
      document.getElementById('create-artist-modal').remove();
    });

    document.getElementById('create-artist-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('new-artist-name').value;
      const bio = document.getElementById('new-artist-bio').value;
      const linksRaw = document.getElementById('new-artist-links').value;

      // Parse links from text format
      let links = [];
      if (linksRaw.trim()) {
        const lines = linksRaw.split('\n').filter(l => l.trim());
        for (const line of lines) {
          const match = line.match(/^([\w]+):\s*(.+)$/);
          if (match) {
            links.push({ [match[1].toLowerCase()]: match[2].trim() });
          }
        }
      }

      try {
        await API.createArtist({
          name,
          bio: bio || undefined,
          links: links.length > 0 ? links : undefined
        });
        document.getElementById('create-artist-modal').remove();
        alert('Artist created!');
        window.location.reload();
      } catch (err) {
        alert('Failed to create artist: ' + err.message);
      }
    });
  },

  renderAlbumGrid(container, albums) {
    if (!albums || albums.length === 0) {
      container.innerHTML = '<p style="color: var(--text-secondary);">No albums found</p>';
      return;
    }

    container.innerHTML = albums.map(album => `
      <a href="#/album/${album.slug || album.id}" class="card">
        <div class="card-cover album-cover-placeholder" data-src="${API.getAlbumCoverUrl(album.slug || album.id)}">
          <div class="placeholder-icon">🎵</div>
        </div>
        <div class="card-body">
          <div class="card-title">${album.title}</div>
          <div class="card-subtitle">${album.artist_name || ''}</div>
        </div>
      </a>
    `).join('');

    // Load album covers with fallback
    container.querySelectorAll('.album-cover-placeholder').forEach(el => {
      const img = new Image();
      img.onload = () => { el.innerHTML = ''; el.style.backgroundImage = `url(${el.dataset.src})`; el.style.backgroundSize = 'cover'; };
      img.onerror = () => { /* keep placeholder */ };
      img.src = el.dataset.src;
    });
  },

  renderTrackList(container, tracks) {
    if (!tracks || tracks.length === 0) {
      container.innerHTML = '<p style="padding: 1rem; color: var(--text-secondary);">No tracks</p>';
      return;
    }

    container.innerHTML = tracks.map((track, index) => `
      <div class="track-item" data-track='${JSON.stringify(track).replace(/'/g, "&apos;")}' data-index="${index}">
        <div class="track-num">${track.track_num || index + 1}</div>
        <div class="track-info">
          <div class="track-title">${track.title}</div>
        </div>
        <div class="track-duration">${Player.formatTime(track.duration)}</div>
      </div>
    `).join('');

    this.attachTrackListeners(tracks);
  },

  attachTrackListeners(allTracks) {
    document.querySelectorAll('.track-item').forEach(item => {
      item.addEventListener('click', () => {
        try {
          const track = JSON.parse(item.dataset.track.replace(/&apos;/g, "'"));
          const index = parseInt(item.dataset.index, 10);

          // Get all tracks in this list
          const tracks = allTracks || Array.from(item.closest('.track-list').querySelectorAll('.track-item'))
            .map(el => JSON.parse(el.dataset.track.replace(/&apos;/g, "'")));

          Player.play(track, tracks, index);
        } catch (e) {
          console.error('Failed to play track:', e);
        }
      });
    });
  },

  // Modal
  async showLoginModal() {
    const status = await API.getAuthStatus();
    const modal = document.getElementById('login-modal');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');

    if (status.firstRun) {
      title.textContent = 'Setup Admin Password';
      body.innerHTML = `
        <form id="login-form">
          <div class="form-group">
            <label for="password">Create Admin Password</label>
            <input type="password" id="password" placeholder="Enter password (min 6 chars)" required minlength="6">
          </div>
          <div class="form-group">
            <label for="password-confirm">Confirm Password</label>
            <input type="password" id="password-confirm" placeholder="Confirm password" required>
          </div>
          <button type="submit" class="btn btn-primary btn-block">Create Admin Account</button>
        </form>
        <div id="login-error" class="error-message"></div>
      `;

      document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleSetup();
      });
    } else {
      title.textContent = 'Admin Login';
      body.innerHTML = `
        <form id="login-form">
          <div class="form-group">
            <label for="password">Password</label>
            <input type="password" id="password" placeholder="Enter admin password" required>
          </div>
          <button type="submit" class="btn btn-primary btn-block">Login</button>
        </form>
        <div id="login-error" class="error-message"></div>
      `;

      document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleLogin();
      });
    }

    modal.classList.add('active');
  },

  hideModal() {
    document.getElementById('login-modal').classList.remove('active');
  },

  async handleLogin() {
    const password = document.getElementById('password').value;
    const error = document.getElementById('login-error');

    try {
      await API.login(password);
      this.isAdmin = true;
      this.hideModal();
      await this.checkAuth();
      window.location.hash = '#/admin';
    } catch (e) {
      error.textContent = 'Invalid password';
    }
  },

  async handleSetup() {
    const password = document.getElementById('password').value;
    const confirm = document.getElementById('password-confirm').value;
    const error = document.getElementById('login-error');

    if (password !== confirm) {
      error.textContent = 'Passwords do not match';
      return;
    }

    if (password.length < 6) {
      error.textContent = 'Password must be at least 6 characters';
      return;
    }

    try {
      await API.setup(password);
      this.isAdmin = true;
      this.hideModal();
      await this.checkAuth();
      window.location.hash = '#/admin';
    } catch (e) {
      error.textContent = 'Setup failed';
    }
  }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => App.init());
