// TuneCamp Main Application

const App = {
  isAdmin: false,
  isRootAdmin: false,

  async init() {
    Player.init();
    await this.loadSiteSettings();
    await this.checkAuth();
    this.setupRouter();
    this.setupEventListeners();
    this.setupPlaybackErrorHandler();
    this.registerServiceWorker();
    this.route();
  },

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then(registration => {
            console.log('ServiceWorker registration successful with scope: ', registration.scope);
          })
          .catch(err => {
            console.log('ServiceWorker registration failed: ', err);
          });
      });
    }
  },

  async loadSiteSettings() {
    try {
      const settings = await API.getSiteSettings();
      this.siteName = settings.siteName || 'TuneCamp';
      document.querySelector('.brand-name').textContent = this.siteName;
      document.title = this.siteName;

      if (settings.backgroundImage) {
        document.body.style.setProperty('--custom-bg', `url('${settings.backgroundImage}')`);
        document.body.classList.add('has-custom-bg');
      }
    } catch (e) {
      console.error('Failed to load site settings:', e);
      this.siteName = 'TuneCamp';
    }
  },

  async checkAuth() {
    try {
      const status = await API.getAuthStatus();
      this.isAdmin = status.authenticated;
      if (this.isAdmin) {
        try {
          const me = await API.getCurrentAdmin();
          this.isRootAdmin = me.isRootAdmin || false;
        } catch {
          this.isRootAdmin = false;
        }
      } else {
        this.isRootAdmin = false;
      }
      this.updateAuthUI(status);
    } catch (e) {
      console.error('Auth check failed:', e);
    }
  },

  updateAuthUI(status) {
    const btn = document.getElementById('admin-btn');
    const browserLink = document.querySelector('.nav-link[data-route="browser"]');

    // Default hide browser link
    if (browserLink) browserLink.style.display = 'none';

    if (status.firstRun) {
      btn.textContent = 'Setup Admin';
      btn.classList.add('btn-primary');
      btn.style.display = 'inline-block';
    } else if (this.isAdmin) {
      btn.textContent = 'Admin Panel';
      btn.classList.add('btn-primary');
      btn.style.display = 'inline-block';
      // Show browser link only if admin
      if (browserLink) browserLink.style.display = 'inline-block';
    } else {
      btn.textContent = 'Admin';
      btn.classList.remove('btn-primary');
      // If we want to hide the admin login button entirely for regular users, uncomment next line:
      // btn.style.display = 'none'; 
      // But keeping it visible for now so they CAN login.
      btn.style.display = 'inline-block';
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
      const usernameInput = document.getElementById('username');
      // legacy support: if username input doesn't exist (shouldn't happen with updated html), it will be null
      const username = usernameInput ? usernameInput.value.trim() : null;
      const password = document.getElementById('password').value;

      await this.handleLogin(username, password);
    });

    // Nav links
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        e.target.classList.add('active');

        // Close mobile menu on link click
        const navLinks = document.getElementById('nav-links');
        if (navLinks.classList.contains('active')) {
          navLinks.classList.remove('active');
        }
      });
    });

    // Mobile Menu Toggle
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    if (mobileMenuToggle) {
      mobileMenuToggle.addEventListener('click', () => {
        const navLinks = document.getElementById('nav-links');
        navLinks.classList.toggle('active');
      });
    }

    // === User Auth Event Handlers ===
    this.setupUserAuthHandlers();

    // === Playlist Modal Event Handlers ===
    this.setupPlaylistModalHandlers();


    // === Unlock Modal Event Handlers ===
    this.setupUnlockModalHandlers();
  },

  setupPlaylistModalHandlers() {
    const playlistModal = document.getElementById('add-to-playlist-modal');
    const playlistModalClose = document.getElementById('playlist-modal-close');
    const createNewPlaylistBtn = document.getElementById('create-new-playlist-btn');

    if (!playlistModal) return;

    // Close modal
    playlistModalClose.addEventListener('click', () => {
      playlistModal.classList.remove('active');
    });

    // Click outside to close
    playlistModal.addEventListener('click', (e) => {
      if (e.target === playlistModal) {
        playlistModal.classList.remove('active');
      }
    });

    // Create new playlist button
    createNewPlaylistBtn.addEventListener('click', () => {
      playlistModal.classList.remove('active');
      window.location.hash = '#/playlists';
    });

  },

  setupUnlockModalHandlers() {
    const modal = document.getElementById('unlock-modal');
    const closeBtn = document.getElementById('unlock-modal-close');
    const form = document.getElementById('unlock-form');
    const errorDiv = document.getElementById('unlock-error');

    if (!modal) return;

    const closeModal = () => {
      modal.classList.remove('active');
      errorDiv.textContent = '';
      document.getElementById('unlock-code-input').value = '';
    };

    closeBtn.addEventListener('click', closeModal);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = document.getElementById('unlock-code-input').value.trim();
      if (!code) return;

      // We use the ID stored in the dataset
      const albumId = modal.dataset.albumId;

      try {
        // 1. Validate code via API
        const validation = await API.validateUnlockCode(code);
        if (!validation.valid) {
          errorDiv.textContent = 'Invalid or expired code.';
          return;
        }

        // 2. Determine if code matches this album (if code is bound to release)
        if (validation.release && validation.release.id != albumId) {
          errorDiv.textContent = 'This code is for a different release: ' + validation.release.title;
          return;
        }

        // 3. Trigger download properly
        // We can use the download endpoint now since valid code will pass server check
        const url = `/api/albums/${albumId}/download?code=${encodeURIComponent(code)}`;
        window.location.href = url;

        closeModal();

      } catch (err) {
        console.error('Unlock error:', err);
        errorDiv.textContent = 'Error validating code. Please try again.';
      }
    });
  },

  showUnlockModal(albumId) {
    const modal = document.getElementById('unlock-modal');
    if (modal) {
      modal.dataset.albumId = albumId;
      modal.classList.add('active');
    }
  },

  setupUserAuthHandlers() {
    // User login button
    const userLoginBtn = document.getElementById('user-login-btn');
    const userMenu = document.getElementById('user-menu');
    const userName = document.getElementById('user-name');
    const userLogoutBtn = document.getElementById('user-logout-btn');
    const userAuthModal = document.getElementById('user-auth-modal');
    const userModalClose = document.getElementById('user-modal-close');
    const userModalTitle = document.getElementById('user-modal-title');
    const userLoginForm = document.getElementById('user-login-form');
    const userRegisterForm = document.getElementById('user-register-form');
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    const userAuthError = document.getElementById('user-auth-error');

    // Check if elements exist (they might not on some pages)
    if (!userLoginBtn) return;

    // Update UI based on current auth state
    const updateAuthUI = () => {
      if (typeof UserAuth !== 'undefined' && UserAuth.isLoggedIn()) {
        userLoginBtn.style.display = 'none';
        userMenu.style.display = 'flex';
        userName.textContent = UserAuth.getUsername();
      } else {
        userLoginBtn.style.display = 'block';
        userMenu.style.display = 'none';
      }
    };

    // Initial UI update
    updateAuthUI();

    // Listen for restored sessions
    window.addEventListener('userauth:restored', updateAuthUI);

    // Show modal on login click
    userLoginBtn.addEventListener('click', () => {
      userAuthModal.classList.add('active');
      userAuthError.textContent = '';
    });

    // Close modal
    userModalClose.addEventListener('click', () => {
      userAuthModal.classList.remove('active');
    });

    // Click outside to close
    userAuthModal.addEventListener('click', (e) => {
      if (e.target === userAuthModal) {
        userAuthModal.classList.remove('active');
      }
    });

    // Tab switching
    tabLogin.addEventListener('click', () => {
      tabLogin.classList.add('active');
      tabRegister.classList.remove('active');
      userLoginForm.style.display = 'block';
      userRegisterForm.style.display = 'none';
      userModalTitle.textContent = 'Login';
      userAuthError.textContent = '';
    });

    tabRegister.addEventListener('click', () => {
      tabRegister.classList.add('active');
      tabLogin.classList.remove('active');
      userRegisterForm.style.display = 'block';
      userLoginForm.style.display = 'none';
      userModalTitle.textContent = 'Create Account';
      userAuthError.textContent = '';
    });

    // Login form submit
    userLoginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;
      userAuthError.textContent = '';

      try {
        await UserAuth.login(username, password);
        userAuthModal.classList.remove('active');
        updateAuthUI();
      } catch (err) {
        userAuthError.textContent = err.message;
      }
    });

    // Register form submit
    userRegisterForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('reg-username').value.trim();
      const password = document.getElementById('reg-password').value;
      const passwordConfirm = document.getElementById('reg-password-confirm').value;
      userAuthError.textContent = '';

      if (password !== passwordConfirm) {
        userAuthError.textContent = 'Passwords do not match';
        return;
      }

      try {
        await UserAuth.register(username, password);
        userAuthModal.classList.remove('active');
        updateAuthUI();
        alert('Account created successfully! You are now logged in.');
      } catch (err) {
        userAuthError.textContent = err.message;
      }
    });

    // Logout button
    userLogoutBtn.addEventListener('click', () => {
      UserAuth.logout();
      updateAuthUI();
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
      } else if (path === '/browser' || path.startsWith('/browser/')) {
        const subpath = path.replace('/browser/', '').replace('/browser', '');
        await this.renderBrowser(main, subpath);
      } else if (path === '/network') {
        await this.renderNetwork(main);
      } else if (path === '/playlists') {
        await this.renderPlaylists(main);
      } else if (path.startsWith('/playlist/')) {
        const id = path.split('/')[2];
        await this.renderPlaylist(main, id);
      } else if (path === '/stats') {
        await this.renderStats(main);
      } else if (path.startsWith('/artist/')) {
        const id = path.split('/')[2];
        await this.renderArtist(main, id);
      } else if (path.startsWith('/post/')) {
        const slug = path.split('/')[2];
        await this.renderPost(main, slug);
      } else if (path === '/admin') {
        if (this.isAdmin) {
          await this.renderAdmin(main);
        } else {
          window.location.hash = '#/';
        }
      } else if (path === '/support') {
        await this.renderSupport(main);
      } else {
        main.innerHTML = '<h1>Not Found</h1>';
      }
    } catch (e) {
      console.error('Route error:', e);
      main.innerHTML = '<div class="error-message">Error loading page</div>';
    }
  },

  async renderSupport(container) {
    container.innerHTML = `
      <section class="section">
        <h1 class="section-title">Support</h1>
        <p style="color: var(--text-secondary); margin-bottom: 2rem;">Support the artists and the platform.</p>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem;">
          <!-- Artist Support -->
          <div class="card">
             <div class="card-body" style="padding: 2rem;">
               <h2 style="margin-bottom: 1rem; color: var(--accent);">Support the Artist</h2>
               <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">
                 Directly support the artists on this server. Your contribution helps them create more music.
               </p>
               <div id="artist-support-links">
                 <div style="padding: 1rem; text-align: center; color: var(--text-muted);">Loading links...</div>
               </div>
             </div>
          </div>

          <!-- TuneCamp Support -->
          <div class="card">
             <div class="card-body" style="padding: 2rem;">
               <h2 style="margin-bottom: 1rem; color: var(--success);">Support TuneCamp</h2>
               <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">
                 TuneCamp is an open-source project empowering independent musicians. 
                 Support the development of this platform.
               </p>
               <div style="display: flex; flex-direction: column; gap: 1rem;">
                  <a href="https://buymeacoffee.com/scobru" target="_blank" class="btn btn-outline" style="justify-content: center;">
                    Buy us a coffee
                  </a>
                  <a href="https://github.com/scobru/tunecamp" target="_blank" class="btn btn-outline" style="justify-content: center;">
                    GitHub Sponsors
                  </a>
               </div>
             </div>
          </div>
        </div>
      </section>
    `;

    // Load artist support links (e.g. from site settings or first artist)
    try {
      const settings = await API.getSiteSettings();
      const linksContainer = document.getElementById('artist-support-links');

      // In single artist mode, use that artist. In label mode, maybe list all or generic?
      // For now let's try to get the "main" artist or site owner links if available
      // Or simply iterate over all artists if there are few? 
      // Let's assume we want to show links from the catalog.yaml if defined, or from the first artist.

      let links = [];

      // Check if catalog has donation links (we might need to add this to API)
      if (settings.donationLinks) {
        links = settings.donationLinks;
      } else {
        // Fallback to first artist
        const artists = await API.getArtists();
        if (artists.length > 0) {
          const artist = artists[0];
          if (artist.links) {
            // Parse links if string (API returns object usually but verify)
            // Wait, API.getArtists already returns parsed object via the router?
            // Checking router: router.get("/") simply res.json(allArtists). 
            // db.getArtists() returns rows with 'links' as TEXT.
            // So artist.links is a STRING here.
            // I need to parse it.
            try {
              const rawLinks = typeof artist.links === 'string' ? JSON.parse(artist.links) : artist.links;
              if (Array.isArray(rawLinks)) {
                // Reuse detection logic
                const detectType = (label, url) => {
                  const lower = (label + url).toLowerCase();
                  if (lower.includes('patreon') || lower.includes('ko-fi') || lower.includes('paypal') || lower.includes('buymeacoffee') || lower.includes('liberapay') || lower.includes('donate')) {
                    return 'support';
                  }
                  return 'social';
                };

                links = rawLinks
                  .map(l => {
                    let linkObj = l;
                    if (l.label && l.url) {
                      linkObj = { platform: l.label, url: l.url, type: l.type };
                    } else {
                      const key = Object.keys(l)[0];
                      linkObj = { platform: key.charAt(0).toUpperCase() + key.slice(1), url: l[key], type: 'social' }; // Old format assume social unless detected
                    }

                    // Auto-detect if type missing
                    if (!linkObj.type) {
                      linkObj.type = detectType(linkObj.platform || '', linkObj.url || '');
                    }
                    return linkObj;
                  })
                  .filter(l => l.type === 'support');
              }
            } catch (e) {

              console.error('Failed to parse artist links', e);
            }
          } else if (artist.donationLinks) {
            links = artist.donationLinks;
          }
        }
      }

      if (links && links.length > 0) {
        linksContainer.innerHTML = links.map(link => `
                <a href="${link.url}" target="_blank" class="btn btn-primary btn-block" style="margin-bottom: 1rem; justify-content: center;">
                  ${getIconForPlatform(link.platform)} 
                  ${link.description || 'Support via ' + link.platform}
                </a>
            `).join('');
      } else {
        linksContainer.innerHTML = '<p style="text-align: center; color: var(--text-muted);">No donation links configured.</p>';
      }

      function getIconForPlatform(platform) {
        return '';
      }

    } catch (e) {
      console.error('Error loading support links', e);
      document.getElementById('artist-support-links').innerHTML = '<p style="color: var(--danger);">Failed to load info</p>';
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
            ${album.download === 'free' ? '<a href="/api/albums/' + (album.slug || album.id) + '/download" class="btn btn-primary" style="margin-top: 1rem;">Free Download</a>'
        : album.download === 'codes' ? '<button class="btn btn-primary" onclick="App.showUnlockModal(' + album.id + ')" style="margin-top: 1rem;">Unlock Download</button>'
          : ''}
            
            ${(() => {
        if (album.external_links) {
          try {
            const links = JSON.parse(album.external_links);
            return links.map(link =>
              `<a href="${link.url}" target="_blank" class="btn btn-outline" style="margin-top: 1rem; margin-right: 0.5rem;">${link.label}</a>`
            ).join('');
          } catch (e) { return ''; }
        }
        return '';
      })()}

            ${this.isAdmin && !album.is_release ? '<button class="btn btn-primary" id="promote-btn" style="margin-top: 1rem;">Promote to Release</button>' : ''}
          </div>
        </div>
        <div class="track-list" id="track-list"></div>
        
        <!-- Comments Section -->
        <div class="comments-section" id="comments-section">
          <div class="comments-header">
            <h3 class="comments-title">Comments</h3>
            <span class="comments-count" id="comments-count"></span>
          </div>
          <div id="comment-form-container"></div>
          <div class="comments-list" id="comments-list">
            <div class="comments-empty">Loading comments...</div>
          </div>
        </div>
      </div>
    `;

    this.renderTrackList(document.getElementById('track-list'), album.tracks);

    // Load comments for the first track (or album itself)
    const firstTrack = album.tracks && album.tracks.length > 0 ? album.tracks[0] : null;
    if (firstTrack) {
      this.renderComments(firstTrack.id);
    } else {
      document.getElementById('comments-list').innerHTML = '<div class="comments-empty">No tracks to comment on</div>';
    }

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

  async renderComments(trackId) {
    const formContainer = document.getElementById('comment-form-container');
    const listContainer = document.getElementById('comments-list');
    const countSpan = document.getElementById('comments-count');

    // Show comment form or login prompt
    const isLoggedIn = typeof UserAuth !== 'undefined' && UserAuth.isLoggedIn();

    if (isLoggedIn) {
      formContainer.innerHTML = `
        <form class="comment-form" id="comment-form">
          <textarea class="comment-input" id="comment-text" placeholder="Write a comment..." rows="2" maxlength="500"></textarea>
          <button type="submit" class="btn btn-primary">Post</button>
        </form>
      `;

      document.getElementById('comment-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = document.getElementById('comment-text').value.trim();
        if (!text) return;

        try {
          await UserAuth.postComment(trackId, text);
          document.getElementById('comment-text').value = '';
          this.renderComments(trackId); // Refresh
        } catch (err) {
          alert('Failed to post comment: ' + err.message);
        }
      });
    } else {
      formContainer.innerHTML = `
        <div class="comment-login-prompt">
          <a id="comment-login-link">Login</a> to leave a comment
        </div>
      `;

      document.getElementById('comment-login-link').addEventListener('click', () => {
        document.getElementById('user-auth-modal').classList.add('active');
      });
    }

    // Load comments
    try {
      const comments = await UserAuth.getComments(trackId);
      countSpan.textContent = `${comments.length} comment${comments.length !== 1 ? 's' : ''}`;

      if (comments.length === 0) {
        listContainer.innerHTML = '<div class="comments-empty">No comments yet. Be the first!</div>';
        return;
      }

      const currentPubKey = isLoggedIn ? UserAuth.getPubKey() : null;

      listContainer.innerHTML = comments.map(c => {
        const initial = (c.username || '?').charAt(0).toUpperCase();
        const timeAgo = this.formatTimeAgo(c.createdAt);
        const isOwner = currentPubKey && c.pubKey === currentPubKey;

        return `
          <div class="comment-item" data-comment-id="${c.id}">
            <div class="comment-avatar">${initial}</div>
            <div class="comment-content">
              <div class="comment-header">
                <span class="comment-username">${c.username || 'Anonymous'}</span>
                <span class="comment-time">${timeAgo}</span>
              </div>
              <div class="comment-text">${this.escapeHtml(c.text)}</div>
              ${isOwner ? `
                <div class="comment-actions">
                  <button class="comment-delete" data-id="${c.id}">Delete</button>
                </div>
              ` : ''}
            </div>
          </div>
        `;
      }).join('');

      // Delete handlers
      listContainer.querySelectorAll('.comment-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (confirm('Delete this comment?')) {
            try {
              await UserAuth.deleteComment(btn.dataset.id);
              this.renderComments(trackId);
            } catch (err) {
              alert('Failed to delete: ' + err.message);
            }
          }
        });
      });
    } catch (err) {
      listContainer.innerHTML = '<div class="comments-empty">Failed to load comments</div>';
    }
  },

  formatTimeAgo(timestamp) {
    // Use Gleam implementation for type safety
    if (typeof GleamUtils !== 'undefined' && GleamUtils.format_time_ago) {
      const result = GleamUtils.format_time_ago(timestamp, Date.now());
      // If Gleam returns empty string, fall back to JavaScript date formatting
      if (result === '') {
        return new Date(timestamp).toLocaleDateString();
      }
      return result;
    }
    // Fallback implementation
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    if (seconds < 604800) return Math.floor(seconds / 86400) + 'd ago';
    return new Date(timestamp).toLocaleDateString();
  },

  escapeHtml(text) {
    // Use Gleam implementation for type safety
    if (typeof GleamUtils !== 'undefined' && GleamUtils.escape_html) {
      return GleamUtils.escape_html(text || '');
    }
    // Fallback implementation (DOM-based)
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
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
        <div class="track-waveform">
            <canvas width="300" height="50" data-waveform="${track.waveform || ''}"></canvas>
        </div>
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
        ${this.isAdmin ?
        `<button class="btn btn-sm btn-ghost add-to-playlist-btn" title="Add to Playlist" 
            style="margin-left: 0.5rem; padding: 4px 8px; font-size: 0.9rem;" 
            onclick="event.stopPropagation(); App.showAddToPlaylistModal(${track.id})">
            📋
           </button>` : ''}
        <button class="btn btn-sm btn-ghost add-to-queue-btn" title="Add to Queue" 
            style="margin-left: 0.5rem; padding: 4px 8px; font-size: 0.9rem;" 
            onclick="event.stopPropagation(); Player.addToQueue(${JSON.stringify(track).replace(/"/g, '&quot;')})">
            ➕
        </button>
      </div>
    `).join('');

    this.attachTrackListeners(tracks);
    this.drawWaveforms(list);
  },

  drawWaveforms(container) {
    container.querySelectorAll('canvas').forEach(canvas => {
      const dataStr = canvas.dataset.waveform;
      if (!dataStr) return;

      try {
        const peaks = JSON.parse(dataStr);
        if (!Array.isArray(peaks)) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const barWidth = width / peaks.length;
        const gap = 0; // seamless

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#5eadb0'; // Accent color, could use var but canvas needs hex usually

        peaks.forEach((peak, i) => {
          const barHeight = Math.max(2, peak * height); // Min 2px
          // Center the bar vertically
          const y = (height - barHeight) / 2;

          ctx.fillRect(i * barWidth, y, barWidth - gap, barHeight);
        });
      } catch (e) {
        console.error('Waveform draw error', e);
      }
    });
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
        // Handle new structured format { type, label, url }
        if (linkObj.url && (linkObj.label || linkObj.type)) {
          const url = linkObj.url;
          const label = linkObj.label || linkObj.type;

          let icon = '🔗';
          // Icon detection
          const searchStr = (label + ' ' + (linkObj.type || '') + ' ' + url).toLowerCase();
          for (const [key, iconChar] of Object.entries(linkIcons)) {
            if (searchStr.includes(key)) {
              icon = iconChar;
              break;
            }
          }

          linksHtml += `<a href="${url}" target="_blank" class="btn btn-outline" style="gap: 0.5rem;"><span>${icon}</span> ${label}</a>`;
        } else {
          // Handle legacy format { platform: url }
          for (const [key, url] of Object.entries(linkObj)) {
            const icon = linkIcons[key] || '🔗';
            const name = key.charAt(0).toUpperCase() + key.slice(1);
            linksHtml += `<a href="${url}" target="_blank" class="btn btn-outline" style="gap: 0.5rem;"><span>${icon}</span> ${name}</a>`;
          }
        }
      }
      linksHtml += '</div>';
    }

    const posts = await API.getArtistPosts(id).catch(() => []);
    const hasPosts = posts && posts.length > 0;

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

        ${hasPosts ? `
        <h2 class="section-title" style="font-size: 1.25rem; margin-bottom: 1rem;">Recent Activity</h2>
        <div class="posts-list mb-4" id="artist-posts" style="margin-bottom: 3rem;">
            ${posts.map(p => `
                <div class="card" style="padding: 1.5rem; margin-bottom: 1rem;">
                    <div style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 0.5rem; display: flex; justify-content: space-between;">
                        <span>${new Date(p.created_at).toLocaleDateString()} ${new Date(p.created_at).toLocaleTimeString()}</span>
                        <!-- <a href="${'/api/ap/note/post/' + p.slug}" target="_blank" title="View ActivityPub Object" style="color: inherit; text-decoration: none;">🔗</a> -->
                    </div>
                    <div style="white-space: pre-wrap; font-size: 1.05rem; line-height: 1.6;">${App.escapeHtml(p.content)}</div>
                </div>
            `).join('')}
        </div>
        ` : ''}

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

  async renderPost(container, slug) {
    try {
      const post = await API.getPostBySlug(slug);

      container.innerHTML = `
            <div class="page-header" style="text-align: center; padding: 4rem 0;">
                <h1 style="font-size: 2rem; margin-bottom: 2rem;">Post from ${post.artist_name || 'an artist'}</h1>
                <div class="card" style="max-width: 800px; margin: 0 auto; padding: 2rem; text-align: left;">
                    <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; border-bottom: 1px solid var(--border); padding-bottom: 1rem;">
                        <div class="artist-cover-placeholder" style="width: 50px; height: 50px; font-size: 1.2rem;" data-src="${API.getArtistCoverUrl(post.artist_slug || post.artist_id)}">
                            <div class="placeholder-icon">👤</div>
                        </div>
                        <div>
                            <a href="/#/artist/${post.artist_slug || post.artist_id}" style="font-weight: bold; font-size: 1.1rem; color: var(--text-main); text-decoration: none;">${post.artist_name || 'Unknown Artist'}</a>
                            <div style="font-size: 0.85rem; color: var(--text-muted);">${new Date(post.created_at).toLocaleString()}</div>
                        </div>
                    </div>
                    <div style="white-space: pre-wrap; font-size: 1.1rem; line-height: 1.6; margin-bottom: 2rem;">${App.escapeHtml(post.content)}</div>
                    
                    <div style="display: flex; gap: 1rem;">
                        <a href="/#/artist/${post.artist_slug || post.artist_id}" class="btn btn-primary">View Artist Profile</a>
                    </div>
                </div>
            </div>
        `;

      // Load avatar
      const cover = container.querySelector('.artist-cover-placeholder');
      if (cover) {
        const img = new Image();
        img.onload = () => {
          cover.innerHTML = '';
          cover.style.backgroundImage = `url(${cover.dataset.src})`;
          cover.style.backgroundSize = 'cover';
          cover.style.backgroundPosition = 'center';
        };
        img.src = cover.dataset.src;
      }

    } catch (e) {
      console.error(e);
      container.innerHTML = `
            <div class="page-header">
                <h1>Post Not Found</h1>
                <p>The post you are looking for does not exist or has been deleted.</p>
                <a href="/#/" class="btn btn-primary">Go Home</a>
            </div>
        `;
    }
  },

  async renderPost(container, slug) {
    try {
      const post = await API.getPostBySlug(slug);

      container.innerHTML = `
            <div class="page-header" style="text-align: center; padding: 4rem 0;">
                <h1 style="font-size: 2rem; margin-bottom: 2rem;">Post from ${post.artist_name || 'an artist'}</h1>
                <div class="card" style="max-width: 800px; margin: 0 auto; padding: 2rem; text-align: left;">
                    <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; border-bottom: 1px solid var(--border); padding-bottom: 1rem;">
                        <div class="artist-cover-placeholder" style="width: 50px; height: 50px; font-size: 1.2rem;" data-src="${API.getArtistCoverUrl(post.artist_slug || post.artist_id)}">
                            <div class="placeholder-icon">👤</div>
                        </div>
                        <div>
                            <a href="/#/artist/${post.artist_slug || post.artist_id}" style="font-weight: bold; font-size: 1.1rem; color: var(--text-main); text-decoration: none;">${post.artist_name || 'Unknown Artist'}</a>
                            <div style="font-size: 0.85rem; color: var(--text-muted);">${new Date(post.created_at).toLocaleString()}</div>
                        </div>
                    </div>
                    <div style="white-space: pre-wrap; font-size: 1.1rem; line-height: 1.6; margin-bottom: 2rem;">${App.escapeHtml(post.content)}</div>
                    
                    <div style="display: flex; gap: 1rem;">
                        <a href="/#/artist/${post.artist_slug || post.artist_id}" class="btn btn-primary">View Artist Profile</a>
                    </div>
                </div>
            </div>
        `;

      // Load avatar
      const cover = container.querySelector('.artist-cover-placeholder');
      if (cover) {
        const img = new Image();
        img.onload = () => {
          cover.innerHTML = '';
          cover.style.backgroundImage = `url(${cover.dataset.src})`;
          cover.style.backgroundSize = 'cover';
          cover.style.backgroundPosition = 'center';
        };
        img.src = cover.dataset.src;
      }

    } catch (e) {
      console.error(e);
      container.innerHTML = `
            <div class="page-header">
                <h1>Post Not Found</h1>
                <p>The post you are looking for does not exist or has been deleted.</p>
                <a href="/#/" class="btn btn-primary">Go Home</a>
            </div>
        `;
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

  async renderNetwork(container) {
    container.innerHTML = `
      <section class="section">
        <h1 class="section-title">🌐 TuneCamp Network</h1>
        <p style="color: var(--text-secondary); margin-bottom: 2rem;">
          Explore tracks shared by other TuneCamp instances on the decentralized network.
        </p>
        <div id="network-loading" style="text-align: center; padding: 2rem;">
          <p>Loading community tracks...</p>
        </div>
        <div id="network-tracks" style="display: none;"></div>
        <div id="network-sites" style="display: none; margin-top: 2rem;"></div>
      </section>
    `;

    try {
      const [tracksRaw, sitesRaw] = await Promise.all([
        API.getNetworkTracks(),
        API.getNetworkSites()
      ]);

      // Deduplicate sites by URL, keeping the most recent
      const uniqueSites = new Map();
      sitesRaw.forEach(s => {
        // Validate site data - align with server structure
        if (!s.url ||
          s.url.includes('localhost') ||
          s.url.includes('127.0.0.1') ||
          s.url.startsWith('file://') ||
          !s.url.startsWith('http')) return;

        // Filter out default/placeholder titles (align with server defaults)
        const title = s.title || '';
        if (!title ||
          title === 'Untitled' ||
          title === 'TuneCamp Server' ||
          title.trim() === '') return;

        // Normalize URL (remove trailing slash)
        const normalizedUrl = s.url.replace(/\/$/, '');

        if (!uniqueSites.has(normalizedUrl)) {
          uniqueSites.set(normalizedUrl, {
            ...s,
            url: normalizedUrl,
            title: title,
            artistName: s.artistName || '',
            coverImage: s.coverImage || null,
            lastSeen: s.lastSeen || Date.now()
          });
        } else {
          // If duplicate, keep the one seen most recently
          const existing = uniqueSites.get(normalizedUrl);
          const existingLastSeen = existing.lastSeen || 0;
          const newLastSeen = s.lastSeen || 0;
          if (newLastSeen > existingLastSeen) {
            uniqueSites.set(normalizedUrl, {
              ...s,
              url: normalizedUrl,
              title: title,
              artistName: s.artistName || '',
              coverImage: s.coverImage || null,
              lastSeen: newLastSeen
            });
          }
        }
      });
      const sites = Array.from(uniqueSites.values());

      // Filter valid tracks and deduplicate by audioUrl
      // Align with server track structure: slug, title, audioUrl, duration, artistName, coverUrl, siteUrl, etc.
      const blocked = JSON.parse(localStorage.getItem('tunecamp_blocked_tracks') || '[]');
      const seenTrackUrls = new Set();
      const tracks = tracksRaw.filter(t => {
        // Validate required fields (align with server structure)
        if (!t.audioUrl ||
          !t.title ||
          blocked.includes(t.audioUrl)) return false;

        // Validate siteUrl - derive from siteId if not present, or skip if invalid
        let siteUrl = t.siteUrl;
        if (!siteUrl && t.siteId && t.siteId !== 'local') {
          // Try to find site URL from sites list
          const site = sites.find(s => s.id === t.siteId);
          if (site) {
            siteUrl = site.url;
          }
        }

        // Skip if still no valid siteUrl or if localhost
        if (!siteUrl ||
          siteUrl.includes('localhost') ||
          siteUrl.includes('127.0.0.1') ||
          siteUrl.startsWith('file://') ||
          !siteUrl.startsWith('http')) return false;

        // Deduplicate by audioUrl
        if (seenTrackUrls.has(t.audioUrl)) return false;
        seenTrackUrls.add(t.audioUrl);

        // Add normalized siteUrl to track
        t.siteUrl = siteUrl;
        return true;
      });

      const loadingEl = document.getElementById('network-loading');
      if (loadingEl) loadingEl.style.display = 'none';

      const tracksContainer = document.getElementById('network-tracks');
      const sitesContainer = document.getElementById('network-sites');

      if (!tracksContainer || !sitesContainer) return; // User navigated away

      if (tracks && tracks.length > 0) {
        tracksContainer.style.display = 'block';
        tracksContainer.innerHTML = `
          <h2 class="section-title" style="font-size: 1.25rem; margin-bottom: 1rem;">
            🎵 Community Tracks (${tracks.length})
          </h2>
          <div class="track-list">
            ${tracks.map((t, i) => `
              <div class="track-item network-track" data-audio-url="${t.audioUrl}" data-index="${i}"
                   data-track='${JSON.stringify({
          id: t.slug,
          title: t.title,
          artist_name: t.artistName,
          duration: t.duration,
          audioUrl: t.audioUrl,
          coverUrl: t.coverUrl,
          isExternal: true
        }).replace(/'/g, "&apos;")}'>
                <div class="track-cover-small" style="width: 40px; height: 40px; border-radius: 4px; background: var(--bg-tertiary); margin-right: 1rem; flex-shrink: 0; background-size: cover; background-position: center; display: flex; align-items: center; justify-content: center; overflow: hidden;">
                  ${t.coverUrl ? `<div style="width:100%; height:100%; background-image: url('${t.coverUrl}'); background-size: cover; background-position: center;"></div>` : '<span style="font-size: 1.2rem; opacity: 0.5;">🎵</span>'}
                </div>
                <div class="track-info">
                  <div class="track-title">${App.escapeHtml(t.title || 'Untitled')}</div>
                  <div style="color: var(--text-secondary); font-size: 0.875rem;">
                    ${App.escapeHtml(t.artistName || 'Unknown Artist')} · <a href="${t.siteUrl}" target="_blank" rel="noopener noreferrer" style="color: var(--accent);">${(() => {
            try {
              return new URL(t.siteUrl).hostname;
            } catch (e) {
              return 'Unknown';
            }
          })()}</a>
                  </div>
                </div>
                <div class="track-actions" style="display:flex; gap:10px; align-items:center;">
                    <div class="track-duration">${Player.formatTime(t.duration)}</div>
                </div>
              </div>
            `).join('')}
          </div>
        `;

        // Add click handlers for network tracks
        tracksContainer.querySelectorAll('.network-track').forEach(item => {
          item.addEventListener('click', () => {
            try {
              const track = JSON.parse(item.dataset.track.replace(/&apos;/g, "'"));
              const index = parseInt(item.dataset.index, 10);

              // Build queue from all network tracks
              const allTracks = tracks.map(t => ({
                id: t.slug,
                title: t.title,
                artist_name: t.artistName,
                duration: t.duration,
                audioUrl: t.audioUrl,
                coverUrl: t.coverUrl,
                isExternal: true
              }));

              this.playExternalTrack(track, allTracks, index);
            } catch (e) {
              console.error('Failed to play network track:', e);
            }
          });
        });
      } else {
        tracksContainer.style.display = 'block';
        tracksContainer.innerHTML = `
          <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
            <p>No tracks found in the network yet.</p>
            <p style="font-size: 0.875rem; margin-top: 0.5rem;">
              Make your releases public to share them with the community!
            </p>
          </div>
        `;
      }

      if (sites && sites.length > 0) {
        sitesContainer.style.display = 'block';
        sitesContainer.innerHTML = `
          <h2 class="section-title" style="font-size: 1.25rem; margin-bottom: 1rem;">
            🏠 TuneCamp Instances (${sites.length})
          </h2>
          <div class="grid">
            ${sites.map(s => {
          const coverHtml = s.coverImage
            ? `<div class="card-cover" style="background-image: url('${s.coverImage}'); background-size: cover; background-position: center;"></div>`
            : `<div class="card-cover" style="display: flex; align-items: center; justify-content: center; font-size: 3rem; background: var(--bg-secondary);">🏠</div>`;

          return `
              <a href="${s.url}" target="_blank" rel="noopener noreferrer" class="card" style="text-decoration: none;">
                ${coverHtml}
                <div class="card-body">
                  <div class="card-title">${App.escapeHtml(s.title || 'Untitled')}</div>
                  <div class="card-subtitle">${App.escapeHtml(s.artistName || (() => {
            try {
              return new URL(s.url).hostname;
            } catch (e) {
              return 'Unknown';
            }
          })())}</div>
                </div>
              </a>
            `}).join('')}
          </div>
        `;
      }
    } catch (e) {
      console.error('Failed to load network data:', e);
      const loadingEl = document.getElementById('network-loading');
      if (loadingEl) {
        loadingEl.innerHTML = `
        <div class="error-message">Failed to load network data. Try again later.</div>
      `;
      }
    }
  },

  async renderStats(container) {
    container.innerHTML = '<div class="loading">Loading stats...</div>';

    try {
      const [overview, recent, topTracks, topArtists] = await Promise.all([
        API.getListeningStats(),
        API.getRecentPlays(20),
        API.getTopTracks(10, 30),
        API.getTopArtists(10, 30)
      ]);

      container.innerHTML = `
        <div class="stats-container">
          <div class="page-header">
            <h2>Your Listening Stats</h2>
            <div class="stats-period">Last 30 Days</div>
          </div>

          <div class="stats-overview">
            <div class="stat-card">
              <div class="stat-value">${overview.totalPlays}</div>
              <div class="stat-label">Total Plays</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${App.formatTimeAgo(overview.totalListeningTime * 1000).replace(' ago', '')}</div>
              <div class="stat-label">Listening Time</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${overview.uniqueTracks}</div>
              <div class="stat-label">Unique Tracks</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${overview.playsToday}</div>
              <div class="stat-label">Plays Today</div>
            </div>
          </div>

          <div class="stats-grid">
            <div class="stats-section">
              <h3>Recently Played</h3>
              <div class="track-list scrollable-list">
                ${recent.length ? recent.map(play => `
                  <div class="track-item" onclick="Player.play({id: ${play.track_id}, title: '${App.escapeHtml(play.track_title).replace(/'/g, "\\'")}', artist_name: '${App.escapeHtml(play.artist_name || '').replace(/'/g, "\\'")}'})">
                    <div class="track-info">
                      <div class="track-title">${App.escapeHtml(play.track_title)}</div>
                      <div class="track-artist">${App.escapeHtml(play.artist_name || 'Unknown Artist')}</div>
                    </div>
                    <div class="track-meta">
                      ${App.formatTimeAgo(new Date(play.played_at).getTime())}
                    </div>
                  </div>
                `).join('') : '<p class="empty-state">No recent plays</p>'}
              </div>
            </div>

            <div class="stats-section">
              <h3>Top Tracks (30d)</h3>
              <div class="track-list">
                ${topTracks.length ? topTracks.map((track, i) => `
                  <div class="track-item" onclick="Player.play({id: ${track.id}, title: '${App.escapeHtml(track.title).replace(/'/g, "\\'")}', artist_name: '${App.escapeHtml(track.artist_name || '').replace(/'/g, "\\'")}'})">
                    <div class="track-num">${i + 1}</div>
                    <div class="track-info">
                      <div class="track-title">${App.escapeHtml(track.title)}</div>
                      <div class="track-artist">${App.escapeHtml(track.artist_name || 'Unknown Artist')}</div>
                    </div>
                    <div class="track-meta">
                      ${track.play_count} plays
                    </div>
                  </div>
                `).join('') : '<p class="empty-state">No top tracks yet</p>'}
              </div>
            </div>

            <div class="stats-section">
              <h3>Top Artists (30d)</h3>
              <div class="artist-list">
                ${topArtists.length ? topArtists.map((artist, i) => `
                  <div class="artist-item" onclick="window.location.hash='#/artist/${artist.id}'">
                    <div class="artist-num">${i + 1}</div>
                    <div class="artist-info">
                      <div class="artist-name">${App.escapeHtml(artist.name)}</div>
                    </div>
                    <div class="artist-meta">
                      ${artist.play_count} plays
                    </div>
                  </div>
                `).join('') : '<p class="empty-state">No top artists yet</p>'}
              </div>
            </div>
          </div>
        </div>
      `;
    } catch (error) {
      console.error('Error rendering stats:', error);
      container.innerHTML = '<div class="error-message">Failed to load statistics</div>';
    }
  },

  async renderBrowser(container, currentPath = '') {
    if (!this.isAdmin) {
      container.innerHTML = '<div class="error-message">Access denied. Admin only.</div>';
      return;
    }

    container.innerHTML = '<div class="loading">Loading browser...</div>';

    try {
      const data = await API.getBrowser(currentPath);

      const parentPath = data.parent !== null ? `
      <div class="browser-item folder-item" onclick="window.location.hash='#/browser/${data.parent}'" style="border-bottom: 1px solid var(--border);">
        <div class="browser-icon">🔙</div>
        <div class="browser-name">.. (Up)</div>
      </div>` : '';

      const content = data.entries.length ? data.entries.map(entry => {
        const encodedPath = encodeURIComponent(entry.path);

        if (entry.type === 'directory') {
          return `
            <div class="browser-item folder-item" onclick="window.location.hash='#/browser/${entry.path}'">
              <div class="browser-icon"></div>
              <div class="browser-name">${App.escapeHtml(entry.name)}</div>
              <div class="browser-actions"></div>
            </div>
          `;
        } else if (entry.type === 'image') {
          const imgUrl = `/api/browser/file?path=${encodedPath}`;
          return `
            <div class="browser-item file-item">
              <div class="browser-icon">🖼️</div>
              <div class="browser-name">
                <a href="${imgUrl}" target="_blank" style="color: inherit; text-decoration: none;">${App.escapeHtml(entry.name)}</a>
              </div>
              <div class="browser-meta">${entry.ext}</div>
            </div>
          `;
        } else if (entry.type === 'file') {
          // Audio file
          const streamUrl = `/api/browser/file?path=${encodedPath}`;
          const trackData = JSON.stringify({
            title: entry.name,
            artist_name: 'File Browser',
            audioUrl: streamUrl,
            isExternal: true
          }).replace(/'/g, "&apos;");

          return `
            <div class="browser-item file-item">
              <div class="browser-icon">🎵</div>
              <div class="browser-name">${App.escapeHtml(entry.name)}</div>
              <div class="browser-actions" style="margin-left: auto; display: flex; gap: 0.5rem;">
                <button class="btn btn-sm btn-ghost" onclick='event.stopPropagation(); Player.play(${trackData})'>▶ Play</button>
                <button class="btn btn-sm btn-ghost" onclick='event.stopPropagation(); Player.addToQueue(${trackData})'>☰ Queue</button>
                <a href="${streamUrl}" download class="btn btn-sm btn-ghost">⬇</a>
              </div>
            </div>
          `;
        } else {
          return `
            <div class="browser-item file-item">
              <div class="browser-icon">📄</div>
              <div class="browser-name">${App.escapeHtml(entry.name)}</div>
            </div>
            `;
        }
      }).join('') : '<div class="empty-state">Folder is empty</div>';

      container.innerHTML = `
        <div class="browser-container">
          <div class="page-header" style="flex-direction: column; align-items: flex-start; gap: 0.5rem;">
            <h2>File Browser</h2>
            <div class="browser-path" style="font-family: monospace; color: var(--text-muted);">/${data.path}</div>
          </div>

          <div class="browser-list" style="display: flex; flex-direction: column; gap: 0.5rem;">
            ${parentPath}
            ${content}
          </div>
        </div>
      `;
    } catch (error) {
      console.error('Error rendering browser:', error);
      container.innerHTML = '<div class="error-message">Failed to load directory</div>';
    }
  },

  async renderPlaylists(container) {
    container.innerHTML = '<div class="loading">Loading playlists...</div>';
    try {
      const playlists = await API.getPlaylists();

      let createForm = '';
      if (this.isAdmin) {
        createForm = `
          <div class="card mb-4">
            <h3>Create Playlist</h3>
            <div class="form-group">
              <input type="text" id="playlist-name" class="form-control" placeholder="Playlist Name">
              <input type="text" id="playlist-desc" class="form-control" placeholder="Description (optional)" style="margin-top: 5px;">
              <label><input type="checkbox" id="playlist-public"> Public</label>
              <button class="btn btn-primary" id="create-playlist-btn" style="margin-top: 10px;">Create</button>
            </div>
          </div>
        `;
      }

      container.innerHTML = `
        <div class="page-header">
          <h2>Playlists</h2>
        </div>
        ${createForm}
        <div class="grid">
          ${playlists.length ? playlists.map(p => `
            <div class="card card-hover" onclick="window.location.hash='#/playlist/${p.id}'" style="cursor: pointer;">
              <h3>${App.escapeHtml(p.name)}</h3>
              <p class="text-secondary">${App.escapeHtml(p.description || '')}</p>
              <div style="font-size: 0.8em; color: #888;">
                ${p.is_public ? '🌐 Public' : '🔒 Private'} • ${new Date(p.created_at).toLocaleDateString()}
              </div>
            </div>
          `).join('') : '<p>No playlists found.</p>'}
        </div>
      `;

      if (this.isAdmin) {
        document.getElementById('create-playlist-btn').addEventListener('click', async (e) => {
          e.stopPropagation();
          const name = document.getElementById('playlist-name').value;
          const desc = document.getElementById('playlist-desc').value;
          const isPublic = document.getElementById('playlist-public').checked;
          if (!name) return alert('Name required');
          try {
            await API.createPlaylist(name, desc);
            // createPlaylist API might not accept isPublic yet? 
            // wait, existing createPlaylist args: name, desc. 
            // I updated backend to accept isPublic but did I update API client?
            // API.createPlaylist(name, desc) -> POST body { name, description }.
            // I should check API.createPlaylist.
            // If not, I can create then update visibility.
            await this.renderPlaylists(container);
          } catch (err) {
            console.error(err);
            alert('Failed to create playlist');
          }
        });
      }

    } catch (err) {
      console.error(err);
      container.innerHTML = '<div class="error-message">Failed to load playlists</div>';
    }
  },

  async renderPlaylist(container, id) {
    container.innerHTML = '<div class="loading">Loading playlist...</div>';
    try {
      const playlist = await API.getPlaylist(id);

      let adminControls = '';
      if (this.isAdmin) {
        adminControls = `
          <div class="actions" style="margin-bottom: 20px;">
             <button class="btn btn-danger" id="delete-playlist-btn">Delete Playlist</button>
             <button class="btn btn-outline" id="toggle-visibility-btn">${playlist.is_public ? 'Make Private' : 'Make Public'}</button>
          </div>
        `;
      }

      container.innerHTML = `
        <div class="page-header">
          <h2>${App.escapeHtml(playlist.name)}</h2>
          <p>${App.escapeHtml(playlist.description || '')}</p>
          ${adminControls}
        </div>
        <div class="track-list">
          ${playlist.tracks.length ? playlist.tracks.map((t, i) => `
            <div class="track-item" onclick="App.playPlaylistTrack(${id}, ${i})">
              <div class="track-number">${i + 1}</div>
              <div class="track-title">${App.escapeHtml(t.title)}</div>
              <div class="track-artist">${App.escapeHtml(t.artist_name || 'Unknown')}</div>
              <div class="track-duration">${Player.formatTime(t.duration)}</div>
              ${this.isAdmin ? `<div class="track-actions"><button class="btn-icon" onclick="event.stopPropagation(); App.removeFromPlaylist(${id}, ${t.id})">❌</button></div>` : ''}
            </div>
          `).join('') : '<p>No tracks in this playlist.</p>'}
        </div>
      `;

      // Helper for playing playlist
      App.playPlaylistTrack = (playlistId, index) => {
        Player.playQueue(playlist.tracks, index);
      };

      if (this.isAdmin) {
        document.getElementById('delete-playlist-btn').addEventListener('click', async () => {
          if (confirm('Delete playlist?')) {
            await API.deletePlaylist(id);
            window.location.hash = '#/playlists';
          }
        });
        document.getElementById('toggle-visibility-btn').addEventListener('click', async () => {
          await API.updatePlaylist(id, { isPublic: !playlist.is_public });
          this.renderPlaylist(container, id);
        });

        App.removeFromPlaylist = async (pId, tId) => {
          if (confirm('Remove track?')) {
            await API.removeTrackFromPlaylist(pId, tId);
            this.renderPlaylist(container, id);
          }
        };
      }

    } catch (err) {
      console.error(err);
      container.innerHTML = '<div class="error-message">Failed to load playlist</div>';
    }
  },

  playExternalTrack(track, queue, index) {
    Player.play(track, queue, index);
  },

  removeNetworkTrack(url) {
    if (!confirm('Remove this track from the list?')) return;
    const blocked = JSON.parse(localStorage.getItem('tunecamp_blocked_tracks') || '[]');
    blocked.push(url);
    localStorage.setItem('tunecamp_blocked_tracks', JSON.stringify(blocked));
    this.route();
  },

  setupPlaybackErrorHandler() {
    document.addEventListener('tunecamp:playback-error', (e) => {
      const { track, error } = e.detail;
      if (track && (track.isExternal || track.audioUrl)) {
        const trackElements = document.querySelectorAll('.network-track');
        trackElements.forEach(el => {
          if (el.dataset.audioUrl === track.audioUrl) {
            el.style.opacity = '0.5';
            const titleEl = el.querySelector('.track-title');
            if (titleEl && !titleEl.innerText.includes('Failed')) {
              titleEl.innerText += ' (Playback Failed)';
              titleEl.style.color = 'var(--error)';
            }
          }
        });
      }
    });
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
            <button class="btn btn-primary" id="new-release-btn">New Release</button>
            ${this.isRootAdmin ? '<button class="btn btn-outline" id="new-artist-btn">New Artist</button>' : ''}
            <button class="btn btn-outline" id="upload-btn">Upload Tracks</button>
            ${this.isRootAdmin ? '<button class="btn btn-outline" id="users-btn">Users</button>' : ''}
            <button class="btn btn-outline" id="posts-btn">Posts</button>
            ${this.isRootAdmin ? '<button class="btn btn-outline" id="rescan-btn">Rescan</button>' : ''}
            ${this.isRootAdmin ? '<button class="btn btn-outline" id="consolidate-btn">Consolidate Library</button>' : ''}
            ${this.isRootAdmin ? '<button class="btn btn-outline" id="network-settings-btn">Network</button>' : ''}
            ${this.isRootAdmin ? '<button class="btn btn-outline" id="backup-btn">Backup</button>' : ''}
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

        
        <!-- Network Settings Panel (hidden by default) -->
        </div>

        <!-- Backup Panel (hidden by default) -->
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

        <!-- Posts Panel (hidden by default) -->
        <div id="posts-panel" class="admin-panel" style="display: none;">
            <h3>Manage Posts</h3>
            <div class="row" style="display: flex; gap: 2rem; flex-wrap: wrap;">
                <div style="flex: 1; min-width: 300px;">
                    <h4>Create New Post</h4>
                    <form id="create-post-form">
                        <div class="form-group">
                            <label>Artist</label>
                            <select id="post-artist" required>
                                <option value="">Select Artist...</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Content</label>
                            <textarea id="post-content" rows="4" required placeholder="Write something..."></textarea>
                        </div>
                        <button type="submit" class="btn btn-primary">Publish Post</button>
                    </form>
                </div>
                <div style="flex: 1; min-width: 300px;">
                    <h4>Recent Posts (by selected artist)</h4>
                    <div id="posts-list" class="list-group">
                        <p class="text-secondary">Select an artist to view their posts.</p>
                    </div>
                </div>
            </div>
        </div>

        <!-- Users Panel (hidden by default) -->
        </div>

        <!-- Unified Release Editor Panel (hidden by default) -->
        <div id="release-panel" class="admin-panel" style="display: none;">
          <h3 id="release-panel-title">Create New Release</h3>
          <form id="release-form">
            <div class="editor-layout">
              <div class="editor-main">
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

                <!-- External Links -->
                <div class="form-group">
                  <label>External Links</label>
                  <div id="release-external-links" class="list-group mb-2"></div>
                  <button type="button" class="btn btn-outline btn-sm" id="add-release-link">＋ Add Link</button>
                </div>

                <!-- Tracks Section (Visible in Edit Mode) -->
                <div id="release-tracks-section" style="display: none; margin-top: 2rem;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <h4>Tracks</h4>
                    <button type="button" class="btn btn-outline btn-sm" id="release-upload-tracks-btn">Add Tracks</button>
                  </div>
                  <div id="release-tracks-list" class="list-group">
                    <!-- Tracks injected here -->
                  </div>
                </div>
              </div>

              <div class="editor-sidebar">
                <div class="form-group">
                  <label>Cover Image</label>
                  <div class="cover-editor">
                    <div id="release-cover-preview" class="cover-preview-large">
                      <span>🎵</span>
                    </div>
                    <label class="btn btn-outline btn-block mt-2">
                      Upload Cover
                      <input type="file" id="release-cover-input" accept="image/*" style="display: none;">
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div class="form-actions mt-3">
              <button type="submit" class="btn btn-primary" id="save-release-btn">Create Release</button>
              <button type="button" class="btn btn-outline" id="cancel-release">Cancel</button>
              <button type="button" class="btn btn-outline btn-danger" id="delete-release-editor-btn" style="display: none; margin-left: auto;">Delete</button>
            </div>
          </form>
        </div>

        <style>
          .editor-layout { display: flex; gap: 2.5rem; flex-wrap: wrap; }
          .editor-main { flex: 2; min-width: 300px; }
          .editor-sidebar { flex: 1; min-width: 250px; }
          .cover-preview-large { 
            width: 100%; aspect-ratio: 1; border-radius: 8px; 
            background: var(--bg-secondary); border: 2px dashed var(--border-color);
            display: flex; align-items: center; justify-content: center;
            font-size: 4rem; background-size: cover; background-position: center;
          }
          .list-group { display: flex; flex-direction: column; gap: 0.5rem; }
          .track-item { 
            display: flex; align-items: center; gap: 1rem; padding: 0.75rem;
            background: var(--bg-secondary); border-radius: 6px; border: 1px solid var(--border-color);
          }
          .track-item .track-handle { cursor: grab; color: var(--text-muted); }
          .track-item .track-title { flex: 1; font-weight: 500; }
          .mt-2 { margin-top: 1rem; }
          .mt-3 { margin-top: 1.5rem; }
          .mb-2 { margin-bottom: 1rem; }
          .btn-block { width: 100%; }
        </style>
        
        <h2 class="section-title" style="font-size: 1.25rem; margin: 2rem 0 1rem;">Manage Releases</h2>
        <div id="releases-list"></div>
        
        <h2 class="section-title" style="font-size: 1.25rem; margin: 2rem 0 1rem;">Manage Artists</h2>
        <div id="artists-list"></div>

        <h2 class="section-title" style="font-size: 1.25rem; margin: 2rem 0 1rem;">⚙️ Site Settings</h2>
        <div class="admin-panel" id="settings-panel">
          <div class="form-group">
            <label>Site Name</label>
            <input type="text" id="setting-site-name" placeholder="TuneCamp" value="${this.siteName || 'TuneCamp'}">
            <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.5rem;">This name appears in the header and browser tab.</p>
          </div>
          <div class="form-group">
            <label>Background Image</label>
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center;">
              <input type="text" id="setting-background-image" placeholder="URL or upload file below" value="" style="flex: 1; min-width: 200px;">
              <span style="color: var(--text-muted); font-size: 0.875rem;">oppure</span>
              <label class="btn btn-outline" style="margin: 0; cursor: pointer;">
                Carica file
                <input type="file" id="setting-background-file" accept="image/jpeg,image/png,image/gif,image/webp" style="display: none;">
              </label>
            </div>
            <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.5rem;">URL esterna oppure carica un'immagine (JPG, PNG, GIF, WebP). Sfondo con overlay trasparente.</p>
          </div>
          <div class="form-actions">
            <button class="btn btn-primary" id="save-settings-btn">Save Settings</button>
          </div>
        </div>
      </section>
  `;

    const list = document.getElementById('releases-list');
    list.innerHTML = releases.map(r => `
      <div class="release-row" data-release-id="${r.id}">
        <div class="release-cover-small album-cover-placeholder" data-src="${API.getAlbumCoverUrl(r.id)}">
          <div class="placeholder-icon" style="font-size: 1.5rem;"></div>
        </div>
        <div class="release-info">
          <div class="release-title">${r.title}</div>
          <div class="release-artist">${r.artist_name || 'Unknown Artist'}</div>
        </div>
        <div class="release-actions">
          ${this.isRootAdmin || (this.artistId && r.artist_id === this.artistId) ? `
            <button class="btn btn-sm btn-outline edit-release" data-id="${r.id}">Edit</button>
            <button class="btn btn-sm btn-outline upload-to-release" data-slug="${r.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}">Add Tracks</button>
            <button class="btn btn-sm btn-outline btn-danger delete-release">Delete</button>
          ` : ''}
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
          <div class="placeholder-icon" style="font-size: 1.5rem;"></div>
        </div>
        <div class="release-info">
          <div class="release-title">${a.name}</div>
          <div class="release-artist">${a.bio ? a.bio.substring(0, 50) + '...' : 'No bio'}</div>
        </div>
        <div class="release-actions">
          ${this.isRootAdmin ? '<button class="btn btn-sm btn-outline view-keys-btn" data-id="${a.id}">keys</button>' : ''}
          ${this.isRootAdmin || (this.artistId && a.id === this.artistId) ? `
            <button class="btn btn-sm btn-outline edit-artist" data-id="${a.id}">Edit</button>
          ` : ''}
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

    // View Keys handlers
    artistsList.querySelectorAll('.view-keys-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.target.dataset.id;
        this.showArtistKeysModal(id);
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

        if (confirm(`Delete "${title}" ? This will remove all files!`)) {
          try {
            await API.deleteRelease(id);
            row.remove();
          } catch (err) {
            alert('Failed to delete release');
          }
        }
      });
    });

    // Unified Release Editor Open Handlers
    list.querySelectorAll('.edit-release').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.dataset.id;
        this.openReleaseEditor(id);
      });
    });

    // Delete release handlers

    // Add tracks to release handlers
    list.querySelectorAll('.upload-to-release').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const slug = e.target.dataset.slug;
        this.showUploadToRelease(slug);
      });
    });

    // Helper to toggle panels
    const togglePanel = (targetId) => {
      document.querySelectorAll('.admin-panel').forEach(p => {
        if (p.id === targetId) {
          p.style.display = p.style.display === 'none' ? 'block' : 'none';
        } else {
          p.style.display = 'none';
        }
      });
    };

    // Upload panel toggle
    document.getElementById('upload-btn')?.addEventListener('click', () => {
      togglePanel('upload-panel');
    });

    // New Artist toggle
    document.getElementById('new-artist-btn')?.addEventListener('click', () => {
      this.showEditArtistModal();
    });

    // New Release toggle
    document.getElementById('new-release-btn')?.addEventListener('click', () => {
      this.openReleaseEditor(null);
    });

    document.getElementById('cancel-release')?.addEventListener('click', () => {
      togglePanel(null);
    });



    // Settings Save Button (for the main settings panel at bottom)
    const settingsPanel = document.getElementById('settings-panel');
    if (!this.isRootAdmin && settingsPanel) {
      settingsPanel.style.display = 'none';
      settingsPanel.previousElementSibling.style.display = 'none'; // Hide "Site Settings" H2
    }

    document.getElementById('save-settings-btn')?.addEventListener('click', async (e) => {
      const btn = e.target;
      btn.textContent = 'Saving...';
      btn.disabled = true;
      try {
        await API.updateSettings({
          siteName: document.getElementById('setting-site-name').value,
          backgroundImage: document.getElementById('setting-background-image').value
        });
        alert('Settings saved!');
        window.location.reload();
      } catch (err) {
        alert('Error: ' + err.message);
      } finally {
        btn.textContent = 'Save Settings';
        btn.disabled = false;
      }
    });

    // Background image upload (saves on server, sets URL automatically)
    document.getElementById('setting-background-file')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const result = await API.uploadBackgroundImage(file);
        const bgInput = document.getElementById('setting-background-image');
        if (bgInput) bgInput.value = result.url || '/api/settings/background';
        e.target.value = '';
        alert('Immagine caricata e salvata sul server.');
        window.location.reload();
      } catch (err) {
        alert('Errore upload: ' + err.message);
      }
    });

    document.getElementById('network-settings-btn')?.addEventListener('click', async () => {
      togglePanel('network-settings-panel');
      // Load current settings
      try {
        const settings = await API.getAdminSettings();
        document.getElementById('network-setting-public-url').value = settings.publicUrl || '';
        document.getElementById('network-setting-site-name').value = settings.siteName || '';
        document.getElementById('network-setting-site-description').value = settings.siteDescription || '';
        document.getElementById('network-setting-artist-name').value = settings.artistName || '';
        document.getElementById('network-setting-cover-image').value = settings.coverImage || '';

        // Also load site settings for the main settings panel if we are opening it via network settings or just generally ensuring they are loaded.
        // Actually, let's load them when the main settings panel saves.
        // But we need to populate the background image field in the main settings panel as well
        const bgInput = document.getElementById('setting-background-image');
        if (bgInput) bgInput.value = settings.backgroundImage || '';

      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    });

    document.getElementById('network-settings-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      const originalText = btn.textContent;
      btn.textContent = 'Saving...';
      btn.disabled = true;

      try {
        await API.updateSettings({
          publicUrl: document.getElementById('network-setting-public-url').value,
          siteName: document.getElementById('network-setting-site-name').value,
          siteDescription: document.getElementById('network-setting-site-description').value,
          artistName: document.getElementById('network-setting-artist-name').value,
          coverImage: document.getElementById('network-setting-cover-image').value
        });
        alert('Network settings saved! Server registered on community.');
        togglePanel(null); // Close panel
      } catch (err) {
        alert('Failed to save settings: ' + err.message);
      } finally {
        btn.textContent = originalText;
        btn.disabled = false;
      }
    });

    // Backup Panel Toggle
    document.getElementById('backup-btn')?.addEventListener('click', () => {
      togglePanel('backup-panel');
    });

    // Restore Form Handler
    document.getElementById('restore-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fileInput = document.getElementById('restore-file-input');
      const file = fileInput.files[0];
      if (!file) return;

      if (!confirm('DANGER: This will overwrite your current database and library. Are you absolutely sure?')) {
        return;
      }

      const btn = document.getElementById('restore-btn');
      const status = document.getElementById('restore-status');

      btn.disabled = true;
      btn.textContent = 'Restoring... (Do not close)';
      status.textContent = 'Uploading and processing... This may take a while.';
      status.style.color = 'var(--accent)';

      try {
        const formData = new FormData();
        formData.append('backup', file);

        // We use fetch directly here to handle the potentially long request better
        const response = await fetch('/api/admin/backup/restore', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + API.token
          },
          body: formData
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(errText);
        }

        const result = await response.json();
        status.textContent = '✅ ' + (result.message || 'Restore complete.');
        status.style.color = 'var(--success)';

        alert('Restore complete! The server is restarting. Page will reload in 5 seconds.');
        setTimeout(() => window.location.reload(), 5000);

      } catch (err) {
        console.error(err);
        status.textContent = '❌ Restore failed: ' + err.message;
        status.style.color = 'var(--danger)';
        btn.disabled = false;
        btn.textContent = 'Upload & Restore';
      }
    });

    // Users Panel Toggle
    document.getElementById('users-btn')?.addEventListener('click', async () => {
      togglePanel('users-panel');
      const createFormContainer = document.getElementById('create-admin-form-container');
      if (createFormContainer) {
        createFormContainer.style.display = this.isRootAdmin ? '' : 'none';
      }

      // Populate artist dropdown
      if (this.isRootAdmin) {
        const artistSelect = document.getElementById('new-user-artist');
        if (artistSelect) {
          const artists = await API.getArtists();
          artistSelect.innerHTML = '<option value="">None (General Admin)</option>' +
            artists.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
        }
      }

      await this.renderUsersList();
    });

    // Create User Form
    document.getElementById('create-user-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('new-user-name').value;
      const password = document.getElementById('new-user-pass').value;
      const artistId = document.getElementById('new-user-artist').value || null;
      try {
        await API.createAdmin(username, password, artistId);
        document.getElementById('new-user-name').value = '';
        document.getElementById('new-user-pass').value = '';
        await this.renderUsersList();
        alert('User created!');
      } catch (e) {
        alert('Error: ' + e.message);
      }
    });

    // Reset Hidden Tracks
    document.getElementById('reset-hidden-tracks').addEventListener('click', () => {
      if (confirm('Unhide all network tracks you have removed?')) {
        localStorage.removeItem('tunecamp_blocked_tracks');
        alert('Hidden tracks list cleared. Refreshing...');
        window.location.reload();
      }
    });

    // Identity Export
    document.getElementById('export-identity-btn')?.addEventListener('click', async () => {
      try {
        const keys = await API.getIdentity();
        const json = JSON.stringify(keys, null, 2);

        // Create modal
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'flex';
        modal.style.zIndex = '10005';
        modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>Server Identity Keys</h2>
                        <button class="modal-close" onclick="this.closest('.modal').remove()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p style="color: var(--color-danger); margin-bottom: 1rem;">⚠️ these keys grant full control over your server's identity. Do not share them publicly.</p>
                        <textarea style="width: 100%; height: 200px; font-family: monospace; margin-bottom: 1rem;" readonly>${json}</textarea>
                        <button class="btn btn-primary btn-block" id="copy-keys-btn">Copy to Clipboard</button>
                    </div>
                </div>
            `;
        document.body.appendChild(modal);

        document.getElementById('copy-keys-btn').onclick = () => {
          navigator.clipboard.writeText(json);
          alert('Copied to clipboard!');
        };
      } catch (e) {
        alert('Failed to get keys: ' + e.message);
      }
    });

    // Identity Import
    document.getElementById('import-identity-btn')?.addEventListener('click', () => {
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.style.display = 'flex';
      modal.style.zIndex = '10005';
      modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Import Identity Keys</h2>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">&times;</button>
                </div>
                <div class="modal-body">
                    <p style="margin-bottom: 1rem;">Paste your exported keypair JSON below.</p>
                    <textarea id="import-keys-input" style="width: 100%; height: 200px; font-family: monospace; margin-bottom: 1rem;" placeholder="{ ... }"></textarea>
                    <button class="btn btn-primary btn-block" id="confirm-import-keys">Import & Restart Identity</button>
                </div>
            </div>
        `;
      document.body.appendChild(modal);

      document.getElementById('confirm-import-keys').onclick = async () => {
        const val = document.getElementById('import-keys-input').value;
        try {
          const json = JSON.parse(val);
          if (confirm('Are you sure? This will replace your current server identity. Existing private data may become inaccessible if not backed up.')) {
            await API.importIdentity(json);
            alert('Identity imported successfully! The page will reload.');
            window.location.reload();
          }
        } catch (e) {
          alert('Import failed: ' + e.message);
        }
      };
    });
    // === Unified Release Editor Event listeners ===

    // Add Link button
    document.getElementById('add-release-link')?.addEventListener('click', () => {
      this.addLinkInputToEditor();
    });

    // Cover upload handler
    document.getElementById('release-cover-input')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      // Preview
      const reader = new FileReader();
      reader.onload = (ev) => {
        const preview = document.getElementById('release-cover-preview');
        preview.style.backgroundImage = `url(${ev.target.result})`;
        preview.innerHTML = '';
      };
      reader.readAsDataURL(file);

      // If editing existing, upload immediately? 
      // Actually let's follow the existing pattern: save metadata first, then upload cover.
    });

    // Track upload button logic
    document.getElementById('release-upload-tracks-btn')?.addEventListener('click', () => {
      if (!this.currentEditingReleaseId) return;

      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = 'audio/*';

      input.onchange = async (e) => {
        const files = e.target.files;
        if (files.length === 0) return;

        const release = await API.getAlbum(this.currentEditingReleaseId);
        await this.uploadFiles(files, { releaseSlug: release.slug });
        this.openReleaseEditor(this.currentEditingReleaseId);
      };
      input.click();
    });

    // Main Form Submit (Create or Update)
    document.getElementById('release-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const isEdit = !!this.currentEditingReleaseId;
      const btn = document.getElementById('save-release-btn');
      const originalText = btn.textContent;

      btn.disabled = true;
      btn.textContent = 'Saving...';

      const title = document.getElementById('release-title').value;
      const artistName = document.getElementById('release-artist').value;
      const date = document.getElementById('release-date').value;
      const description = document.getElementById('release-description').value;
      const genresRaw = document.getElementById('release-genres').value;
      const genres = genresRaw ? genresRaw.split(',').map(g => g.trim()).filter(g => g) : [];
      const download = document.getElementById('release-download').value;
      const coverFile = document.getElementById('release-cover-input').files[0];

      // External Links
      const externalLinks = Array.from(document.querySelectorAll('#release-external-links > div')).map(div => ({
        label: div.querySelector('.link-label').value.trim(),
        url: div.querySelector('.link-url').value.trim()
      })).filter(l => l.label && l.url);

      const data = {
        title,
        artistName: artistName || undefined,
        date: date || undefined,
        description: description || undefined,
        genres: genres.length > 0 ? genres : undefined,
        download: download || undefined,
        externalLinks
      };

      try {
        let releaseSlug;
        if (isEdit) {
          const release = await API.getAlbum(this.currentEditingReleaseId);
          releaseSlug = release.slug;
          await API.updateRelease(this.currentEditingReleaseId, data);
        } else {
          const result = await API.createRelease(data);
          releaseSlug = result.slug;
          // After create, maybe switch to edit mode? 
          // Existing behavior: alert and reload. Let's keep it simple first.
        }

        // Upload cover if provided
        if (coverFile && releaseSlug) {
          await API.uploadCover(coverFile, releaseSlug);
        }

        alert(isEdit ? 'Release updated!' : 'Release created!');
        window.location.reload();
      } catch (err) {
        alert('Error: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });

    // Delete button logic
    document.getElementById('delete-release-editor-btn')?.addEventListener('click', async () => {
      if (!this.currentEditingReleaseId) return;
      const title = document.getElementById('release-title').value;

      if (confirm(`Are you sure you want to delete "${title}" and ALL its files?`)) {
        try {
          await API.deleteRelease(this.currentEditingReleaseId);
          alert('Release deleted');
          window.location.reload();
        } catch (err) {
          alert('Failed to delete release');
        }
      }
    });

    // Upload handlers
    this.setupUploadHandlers();

    // Rescan button
    document.getElementById('rescan-btn')?.addEventListener('click', async () => {
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

    // Consolidate button
    document.getElementById('consolidate-btn')?.addEventListener('click', async () => {
      const btn = document.getElementById('consolidate-btn');
      if (!confirm('This will move and rename your music files according to the universal format. Are you sure?')) return;

      btn.disabled = true;
      btn.textContent = 'Consolidating...';
      try {
        const result = await API.consolidate();
        alert(result.message || 'Consolidation started in the background.');
        btn.textContent = '🚀 Consolidating...';
      } catch (e) {
        alert('Consolidation failed to start: ' + e.message);
        btn.disabled = false;
        btn.textContent = 'Consolidate Library';
      }
    });

    // Logout button
    document.getElementById('logout-btn').addEventListener('click', () => {
      API.logout();
      this.isAdmin = false;
      this.checkAuth();
      window.location.hash = '#/';
    });

    // Posts Panel Toggle
    document.getElementById('posts-btn').addEventListener('click', () => {
      togglePanel('posts-panel');
      // Populate artists dropdown
      const select = document.getElementById('post-artist');
      if (select.children.length <= 1) {
        API.getArtists().then(artists => {
          select.innerHTML = '<option value="">Select Artist...</option>' +
            artists.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
        });
      }
    });

    // Handle Artist Selection for Posts to load their posts
    document.getElementById('post-artist').addEventListener('change', async (e) => {
      const artistId = e.target.value;
      const postsList = document.getElementById('posts-list');
      if (!artistId) {
        postsList.innerHTML = '<p class="text-secondary">Select an artist to view their posts.</p>';
        return;
      }

      postsList.innerHTML = '<div class="loading">Loading posts...</div>';
      try {
        const posts = await API.getArtistPosts(artistId);
        if (posts.length === 0) {
          postsList.innerHTML = '<p class="text-secondary">No posts found for this artist.</p>';
        } else {
          postsList.innerHTML = posts.map(p => `
                    <div class="card mb-2" style="padding: 1rem;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                            <span class="text-muted" style="font-size: 0.8rem;">${new Date(p.created_at).toLocaleString()}</span>
                            <button class="btn btn-sm btn-danger delete-post-btn" data-id="${p.id}">Delete</button>
                        </div>
                        <div style="white-space: pre-wrap;">${App.escapeHtml(p.content)}</div>
                         <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.5rem;">
                            <a href="/#/post/${p.slug}" target="_blank">View Post</a>
                        </div>
                    </div>
                `).join('');

          // Attach delete handlers
          postsList.querySelectorAll('.delete-post-btn').forEach(btn => {
            btn.addEventListener('click', async (evt) => {
              if (confirm('Delete this post?')) {
                try {
                  await API.deletePost(evt.target.dataset.id);
                  alert('Post deleted');
                  // Refresh list
                  document.getElementById('post-artist').dispatchEvent(new Event('change'));
                } catch (err) {
                  alert('Error deleting post: ' + err.message);
                }
              }
            });
          });
        }
      } catch (err) {
        console.error(err);
        postsList.innerHTML = '<div class="error-message">Failed to load posts</div>';
      }
    });

    // Create Post Form
    document.getElementById('create-post-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const artistId = document.getElementById('post-artist').value;
      const content = document.getElementById('post-content').value;
      const btn = e.target.querySelector('button');

      if (!artistId) return alert('Please select an artist');

      btn.disabled = true;
      btn.textContent = 'Publishing...';

      try {
        await API.createPost(artistId, content);
        alert('Post published successfully!');
        document.getElementById('post-content').value = '';
        // Refresh list
        document.getElementById('post-artist').dispatchEvent(new Event('change'));
      } catch (err) {
        alert('Error publishing post: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Publish Post';
      }
    });

    // New Artist button
    document.getElementById('new-artist-btn').addEventListener('click', () => {
      this.showCreateArtistModal();
    });
  },

  async renderUsersList() {
    const list = document.getElementById('users-list-container');
    if (!list) return;

    list.innerHTML = '<div class="loading">Loading users...</div>';

    try {
      const users = await API.getAdmins();

      list.innerHTML = users.map(u => `
        <div class="card mb-2" style="padding: 1rem; display: flex; justify-content: space-between; align-items: center;">
            <div>
                <div style="font-weight: bold;">${App.escapeHtml(u.username)}</div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">
                    ID: ${u.id} • Created: ${new Date(u.created_at).toLocaleDateString('en-GB')}
                    ${u.is_root ? ' (Primary Admin)' : ''}
                    ${u.artist_name ? ` • 🎵 ${App.escapeHtml(u.artist_name)}` : ''}
                </div>
            </div>
            <div style="display: flex; gap: 0.5rem;">
                ${this.isRootAdmin && !u.isRootAdmin ? `
                    <button class="btn btn-sm btn-outline edit-user-link" data-id="${u.id}" data-artist-id="${u.artist_id || ''}">Link Artist</button>
                    <button class="btn btn-sm btn-danger delete-user" data-id="${u.id}">Delete</button>
                ` : ''}
            </div>
        </div>
      `).join('');

      // Delete handlers
      list.querySelectorAll('.delete-user').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          if (confirm('Delete this admin user?')) {
            try {
              await API.deleteAdmin(e.target.dataset.id);
              this.renderUsersList();
            } catch (err) {
              alert('Error: ' + err.message);
            }
          }
        });
      });

      // Link Artist handlers
      list.querySelectorAll('.edit-user-link').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const userId = e.target.dataset.id;
          const currentArtistId = e.target.dataset.artistId;
          this.showLinkArtistModal(userId, currentArtistId);
        });
      });

    } catch (err) {
      console.error(err);
      list.innerHTML = '<div class="error-message">Failed to load users</div>';
    }
  },

  async showLinkArtistModal(userId, currentArtistId) {
    const artists = await API.getArtists();

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.id = 'link-artist-modal';
    modal.style.zIndex = '10010';

    const options = '<option value="">None (General Admin)</option>' +
      artists.map(a => `<option value="${a.id}" ${String(a.id) === String(currentArtistId) ? 'selected' : ''}>${a.name}</option>`).join('');

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px;">
            <h3>Link Admin to Artist</h3>
            <p style="margin-bottom: 1rem;">Select an artist to restrict this admin's access.</p>
            <div class="form-group">
                <select id="link-artist-select" style="width: 100%; padding: 0.5rem; background: var(--bg-secondary); color: var(--text-color); border: 1px solid var(--border-color); border-radius: 4px;">
                    ${options}
                </select>
            </div>
            <div class="form-actions">
                <button class="btn btn-primary" id="save-link-artist">Save</button>
                <button class="btn btn-outline" id="cancel-link-artist">Cancel</button>
            </div>
        </div>
      `;
    document.body.appendChild(modal);

    document.getElementById('cancel-link-artist').onclick = () => document.getElementById('link-artist-modal').remove();

    document.getElementById('save-link-artist').onclick = async () => {
      const newArtistId = document.getElementById('link-artist-select').value || null;
      try {
        await API.updateAdmin(userId, { artistId: newArtistId });
        document.getElementById('link-artist-modal').remove();
        alert('User updated!');
        this.renderUsersList();
      } catch (err) {
        alert('Error: ' + err.message);
      }
    };
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

  // handleCreateRelease removed


  // Helpers
  async openReleaseEditor(releaseId = null) {
    this.currentEditingReleaseId = releaseId;
    const isEdit = !!releaseId;
    const panel = document.getElementById('release-panel');
    const titleEl = document.getElementById('release-panel-title');
    const submitBtn = document.getElementById('save-release-btn');
    const tracksSection = document.getElementById('release-tracks-section');
    const deleteBtn = document.getElementById('delete-release-editor-btn');

    // Reset Panel
    titleEl.textContent = isEdit ? 'Edit Release' : 'Create New Release';
    submitBtn.textContent = isEdit ? 'Save Changes' : 'Create Release';
    tracksSection.style.display = isEdit ? 'block' : 'none';
    deleteBtn.style.display = isEdit ? 'block' : 'none';
    document.getElementById('release-external-links').innerHTML = '';
    document.getElementById('release-cover-preview').style.backgroundImage = '';
    document.getElementById('release-cover-preview').innerHTML = '🎵';

    // Toggle Panel
    const togglePanel = (targetId) => {
      document.querySelectorAll('.admin-panel').forEach(p => {
        p.style.display = p.id === targetId ? 'block' : 'none';
      });
    };
    togglePanel('release-panel');

    // Load Artists
    const select = document.getElementById('release-artist');
    const artists = await API.getArtists();
    let filtered = artists;
    if (!this.isRootAdmin && this.artistId) {
      filtered = artists.filter(a => a.id === this.artistId);
    }
    select.innerHTML = (this.isRootAdmin ? '<option value="">Select Artist...</option>' : '') +
      filtered.map(a => `<option value="${a.name}">${a.name}</option>`).join('');

    if (isEdit) {
      const release = await API.getAlbum(releaseId);
      document.getElementById('release-title').value = release.title;
      document.getElementById('release-artist').value = release.artist_name || '';
      document.getElementById('release-date').value = release.date || '';
      document.getElementById('release-description').value = release.description || '';
      document.getElementById('release-genres').value = release.genre || '';
      document.getElementById('release-download').value = release.download || 'none';

      // Load Tracks
      this.renderReleaseTracks(release.tracks || []);

      // Load Cover
      if (release.cover_path) {
        const coverUrl = API.getAlbumCoverUrl(release.slug || release.id);
        document.getElementById('release-cover-preview').style.backgroundImage = `url(${coverUrl})`;
        document.getElementById('release-cover-preview').innerHTML = '';
      }

      // Load Links
      const links = release.external_links ? JSON.parse(release.external_links) : [];
      links.forEach(l => this.addLinkInputToEditor(l.label, l.url));
    } else {
      // Clear for new
      document.getElementById('release-title').value = '';
      if (!this.isRootAdmin && filtered.length > 0) {
        select.value = filtered[0].name;
      } else {
        select.value = '';
      }
      document.getElementById('release-date').value = new Date().toISOString().split('T')[0];
      document.getElementById('release-description').value = '';
      document.getElementById('release-genres').value = '';
      document.getElementById('release-download').value = 'free';
    }

    // Scroll to panel
    panel.scrollIntoView({ behavior: 'smooth' });
  },

  addLinkInputToEditor(label = '', url = '') {
    const container = document.getElementById('release-external-links');
    const div = document.createElement('div');
    div.className = 'track-item';
    div.style.padding = '0.5rem';
    div.innerHTML = `
      <input type="text" placeholder="Label" class="link-label" value="${label}" style="width: 30%;">
      <input type="text" placeholder="URL" class="link-url" value="${url}" style="flex: 1;">
      <button type="button" class="btn btn-outline btn-sm btn-danger remove-link">✕</button>
    `;
    div.querySelector('.remove-link').onclick = () => div.remove();
    container.appendChild(div);
  },

  renderReleaseTracks(tracks) {
    const list = document.getElementById('release-tracks-list');
    if (tracks.length === 0) {
      list.innerHTML = '<p class="text-secondary p-3">No tracks uploaded yet.</p>';
      return;
    }

    list.innerHTML = tracks.map(t => `
      <div class="track-item" data-id="${t.id}">
        <span class="track-handle">::</span>
        <span class="track-title">${App.escapeHtml(t.title)}</span>
        <button type="button" class="btn btn-outline btn-sm btn-danger delete-track-editor" data-id="${t.id}">Delete</button>
      </div>
    `).join('');

    // Delete Handlers
    list.querySelectorAll('.delete-track-editor').forEach(btn => {
      btn.onclick = async (e) => {
        const tid = e.target.dataset.id;
        if (confirm('Delete this track?')) {
          try {
            await API.deleteTrack(tid);
            this.openReleaseEditor(this.currentEditingReleaseId);
          } catch (err) {
            alert('Failed to delete track');
          }
        }
      };
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
            <label>Support / Social Links</label>
            <div id="artist-links-container" style="display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.5rem;">
                <!-- Links injected here -->
            </div>
            <button type="button" class="btn btn-outline btn-sm" id="add-artist-link">＋ Add Link</button>
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

    // Links Logic
    const linksContainer = document.getElementById('artist-links-container');
    let existingLinks = [];

    // Parse existing links (handle old {key:val} and new {label,url} format)
    if (artist.links && Array.isArray(artist.links)) {
      existingLinks = artist.links.map(l => {
        if (l.label && l.url) return l; // New format
        // Old format { platform: url }
        const key = Object.keys(l)[0];
        return { label: key.charAt(0).toUpperCase() + key.slice(1), url: l[key] };
      });
    }

    function addLinkInput(label = '', url = '', type = 'social') {
      const div = document.createElement('div');
      div.style.display = 'flex';
      div.style.gap = '0.5rem';
      div.innerHTML = `
      <select class="link-type" style="width: 100px;">
        <option value="social" ${type === 'social' ? 'selected' : ''}>Social</option>
        <option value="support" ${type === 'support' ? 'selected' : ''}>Support</option>
      </select>
      <input type="text" placeholder="Label (e.g. Bandcamp)" class="link-label" value="${label}" style="flex: 1;">
      <input type="text" placeholder="URL (https://...)" class="link-url" value="${url}" style="flex: 2;">
      <button type="button" class="btn btn-outline btn-sm remove-link" style="color: var(--color-danger); border-color: var(--color-danger);">✕</button>
      `;
      div.querySelector('.remove-link').onclick = () => div.remove();
      linksContainer.appendChild(div);
    }

    // Helper to auto-detect type from URL/Label if missing
    function detectType(label, url) {
      const lower = (label + url).toLowerCase();
      if (lower.includes('patreon') || lower.includes('ko-fi') || lower.includes('paypal') || lower.includes('buymeacoffee') || lower.includes('liberapay') || lower.includes('donate')) {
        return 'support';
      }
      return 'social';
    }

    // Populate existing
    existingLinks.forEach(link => {
      // If type is missing, try to detect it
      const type = link.type || detectType(link.label || '', link.url || '');
      addLinkInput(link.label, link.url, type);
    });

    document.getElementById('add-artist-link').onclick = () => addLinkInput();

    document.getElementById('edit-artist-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const bio = document.getElementById('edit-artist-bio').value;
      const avatarFile = document.getElementById('edit-artist-avatar').files[0];

      // Gather links
      const links = Array.from(document.querySelectorAll('#artist-links-container > div')).map(div => ({
        type: div.querySelector('.link-type').value,
        label: div.querySelector('.link-label').value.trim(),
        url: div.querySelector('.link-url').value.trim()
      })).filter(l => l.label && l.url);

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

  async showArtistKeysModal(artistId) {
    try {
      const keys = await API.getArtistIdentity(artistId);

      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.style.display = 'flex';
      modal.style.zIndex = '10006';
      modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>Artist Keys</h2>
                <button class="modal-close" onclick="this.closest('.modal').remove()">&times;</button>
            </div>
            <div class="modal-body">
                <p style="color: var(--color-danger); margin-bottom: 1rem;">⚠️ Private keys grant full control over this artist's identity. Do not share them.</p>
                
                <label style="font-weight:bold;">Public Key</label>
                <textarea style="width: 100%; height: 100px; font-family: monospace; margin-bottom: 1rem; color: var(--text-main); background: var(--bg-secondary); border: 1px solid var(--border);" readonly>${keys.publicKey || 'No key found'}</textarea>
                
                <label style="font-weight:bold;">Private Key</label>
                <div style="position: relative; margin-bottom: 1rem;">
                    <textarea id="private-key-area" style="width: 100%; height: 150px; font-family: monospace; filter: blur(5px); transition: filter 0.3s; color: var(--text-main); background: var(--bg-secondary); border: 1px solid var(--border);" readonly>${keys.privateKey || 'No key found'}</textarea>
                    <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: center; cursor: pointer; background: rgba(0,0,0,0.1); z-index: 10;" onclick="document.getElementById('private-key-area').style.filter='none'; this.style.display='none';">
                        <span style="background: var(--bg-primary); padding: 5px 10px; border-radius: 4px; border: 1px solid var(--border); box-shadow: 0 2px 5px rgba(0,0,0,0.2);">Click to Reveal</span>
                    </div>
                </div>

                <button class="btn btn-primary btn-block" id="copy-keys-btn">Copy Private Key to Clipboard</button>
            </div>
        </div>
      `;
      document.body.appendChild(modal);

      document.getElementById('copy-keys-btn').onclick = () => {
        navigator.clipboard.writeText(keys.privateKey || '');
        alert('Copied Private Key to clipboard!');
      };

    } catch (err) {
      alert('Failed to fetch keys: ' + err.message);
    }
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
      <div class="track-waveform">
        <canvas width="100" height="30" data-waveform="${track.waveform || ''}"></canvas>
      </div>
      <div class="track-duration">${Player.formatTime(track.duration)}</div>
      ${this.isAdmin ? `
        <button class="btn btn-sm btn-ghost add-to-playlist-btn" 
                title="Add to Playlist" 
                style="margin-left: 0.5rem; padding: 4px 8px; font-size: 0.9rem;"
                onclick="event.stopPropagation(); App.showAddToPlaylistModal(${track.id})">
          📋
        </button>` : ''}
      <button class="btn btn-sm btn-ghost add-to-queue-btn" title="Add to Queue"
        style="margin-left: 0.5rem; padding: 4px 8px; font-size: 0.9rem;"
        onclick="event.stopPropagation(); Player.addToQueue(${JSON.stringify(track).replace(/"/g, '&quot;')})">
      ➕
    </button>
      </div >
  `).join('');

    this.attachTrackListeners(tracks);
    this.drawWaveforms(container);
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
            <input type="password" id="password" placeholder="Enter password (min 6 chars)" required minlength="6" autocomplete="new-password">
          </div>
          <div class="form-group">
            <label for="password-confirm">Confirm Password</label>
            <input type="password" id="password-confirm" placeholder="Confirm password" required autocomplete="new-password">
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
            <label for="username">Username</label>
            <input type="text" id="username" placeholder="Enter username" required autocomplete="username">
          </div>
          <div class="form-group">
            <label for="password">Password</label>
            <input type="password" id="password" placeholder="Enter admin password" required autocomplete="current-password">
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

  async handleLogin(username, password) {
    const errorMsg = document.getElementById('login-error');
    const submitBtn = document.querySelector('#login-form button[type="submit"]');

    try {
      if (!password && !username) {
        // Manual fallback if needed
        password = document.getElementById('password').value;
        username = document.getElementById('username')?.value;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Logging in...';
      errorMsg.textContent = '';

      const result = await API.login(username, password);

      this.isAdmin = true;
      this.isRootAdmin = result.isRootAdmin || false;
      this.hideModal();

      // Update UI
      this.checkAuth().then(() => {
        if (this.isAdmin) window.location.hash = '#/admin';
      });

    } catch (e) {
      errorMsg.textContent = 'Login failed: ' + (e.message || 'Check your credentials');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Login';
    }
  },

  async handleSetup() {
    // We need to get values from the form manually as arguments might not be passed correctly if bound directly
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const confirm = document.getElementById('password-confirm').value;

    const errorMsg = document.getElementById('login-error');
    const submitBtn = document.querySelector('#login-form button[type="submit"]');

    if (password !== confirm) {
      errorMsg.textContent = 'Passwords do not match';
      return;
    }

    if (password.length < 6) {
      errorMsg.textContent = 'Password must be at least 6 characters';
      return;
    }

    if (username.length < 3) {
      errorMsg.textContent = 'Username must be at least 3 characters';
      return;
    }

    try {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating account...';
      errorMsg.textContent = '';

      await API.setup(username, password);
      this.isAdmin = true;
      this.isRootAdmin = true;
      this.hideModal();
      await this.checkAuth();
      window.location.hash = '#/admin';
    } catch (e) {
      errorMsg.textContent = 'Setup failed: ' + (e.message || 'Please try again.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Admin Account';
    }
  },

  async renderUsersList() {
    const container = document.getElementById('users-list-container');
    if (!container) return;

    container.innerHTML = 'Loading...';
    try {
      const users = await API.getAdmins();
      const canDelete = this.isRootAdmin;
      container.innerHTML = users.map(u => {
        const isRootAdmin = u.id === 1;
        const showDelete = canDelete && users.length > 1 && !isRootAdmin;
        return `
              <div class="list-item" style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; border-bottom: 1px solid var(--border-color);">
                  <div>
                      <strong>${this.escapeHtml(u.username)}</strong>
                      <div style="font-size: 0.8rem; color: var(--text-muted);">ID: ${u.id} • Created: ${new Date(u.created_at).toLocaleDateString()}${isRootAdmin ? ' (Primary Admin)' : ''}</div>
                  </div>
                  <div>
                      ${showDelete ? `<button class="btn btn-sm btn-danger delete-user-btn" data-id="${u.id}">Delete</button>` : isRootAdmin ? '<span style="font-size: 0.8rem; color: var(--text-muted);">(Primary Admin)</span>' : users.length <= 1 ? '<span style="font-size: 0.8rem; color: var(--text-muted);">(Last Admin)</span>' : '<span style="font-size: 0.8rem; color: var(--text-muted);">—</span>'}
                  </div>
              </div>
          `;
      }).join('');

      container.querySelectorAll('.delete-user-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          if (confirm('Delete this admin user?')) {
            try {
              await API.deleteAdmin(e.target.dataset.id);
              await this.renderUsersList();
            } catch (err) {
              alert('Failed to delete: ' + err.message);
            }
          }
        });
      });
    } catch (e) {
      container.innerHTML = '<div class="error-message">Failed to load users</div>';
    }
  },

  // Playlist Management
  currentTrackToAdd: null,

  async showAddToPlaylistModal(trackId) {
    if (!this.isAdmin) {
      alert('Please login as admin to manage playlists');
      return;
    }

    this.currentTrackToAdd = trackId;
    const modal = document.getElementById('add-to-playlist-modal');
    const playlistSelection = document.getElementById('playlist-selection');

    // Load playlists
    try {
      const playlists = await API.getPlaylists();

      if (playlists.length === 0) {
        playlistSelection.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 1rem;">No playlists yet. Create one!</p>';
      } else {
        playlistSelection.innerHTML = playlists.map(p => `
          <div class="playlist-item" data-playlist-id="${p.id}" style="padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 0.5rem; cursor: pointer; transition: all 0.2s;">
            <div style="font-weight: 500;">${this.escapeHtml(p.name)}</div>
            <div style="font-size: 0.875rem; color: var(--text-secondary);">${this.escapeHtml(p.description || '')}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">
              ${p.is_public ? '🌐 Public' : '🔒 Private'}
            </div>
          </div>
        `).join('');

        // Add click listeners
        playlistSelection.querySelectorAll('.playlist-item').forEach(item => {
          item.addEventListener('click', async () => {
            const playlistId = parseInt(item.dataset.playlistId);
            await this.addTrackToPlaylist(playlistId, this.currentTrackToAdd);
          });

          // Hover effects
          item.addEventListener('mouseenter', (e) => {
            e.target.style.backgroundColor = 'var(--bg-secondary)';
            e.target.style.borderColor = 'var(--accent)';
          });
          item.addEventListener('mouseleave', (e) => {
            e.target.style.backgroundColor = '';
            e.target.style.borderColor = 'var(--border-color)';
          });
        });
      }

      modal.classList.add('active');
    } catch (error) {
      console.error('Error loading playlists:', error);
      alert('Failed to load playlists');
    }
  },

  async addTrackToPlaylist(playlistId, trackId) {
    try {
      await API.addTrackToPlaylist(playlistId, trackId);
      alert('Track added to playlist!');
      document.getElementById('add-to-playlist-modal').classList.remove('active');
    } catch (error) {
      console.error('Error adding track:', error);
      alert('Failed to add track to playlist');
    }
  }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => App.init());
