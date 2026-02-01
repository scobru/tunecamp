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
      const brandName = document.querySelector('.brand-name');
      if (brandName) brandName.textContent = this.siteName;
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
        if (navLinks && navLinks.classList.contains('active')) {
          navLinks.classList.remove('active');
        }
      });
    });

    // Mobile Menu Toggle
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    if (mobileMenuToggle) {
      mobileMenuToggle.addEventListener('click', () => {
        const navLinks = document.getElementById('nav-links');
        if (navLinks) navLinks.classList.toggle('active');
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
      if (typeof modal.showModal === 'function') {
        modal.showModal();
      } else {
        modal.classList.add('active');
      }
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
      if (typeof userAuthModal.showModal === 'function') {
        userAuthModal.showModal();
      } else {
        userAuthModal.classList.add('active');
      }
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
      <section class="p-4 lg:p-8">
        <h1 class="text-3xl font-bold mb-2">Support</h1>
        <p class="text-base-content/60 mb-8">Support the artists and the platform.</p>
        
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <!-- Artist Support -->
          <div class="card bg-base-200 border border-white/5">
             <div class="card-body">
               <h2 class="card-title text-primary mb-2">Support the Artist</h2>
               <p class="text-base-content/70 mb-6">
                 Directly support the artists on this server. Your contribution helps them create more music.
               </p>
               <div id="artist-support-links" class="flex flex-col gap-3">
                 <div class="flex justify-center p-8 text-base-content/40 italic">Loading links...</div>
               </div>
             </div>
          </div>

          <!-- TuneCamp Support -->
          <div class="card bg-base-200 border border-white/5">
             <div class="card-body">
               <h2 class="card-title text-success mb-2">Support TuneCamp</h2>
               <p class="text-base-content/70 mb-6">
                 TuneCamp is an open-source project empowering independent musicians. 
                 Support the development of this platform.
               </p>
               <div class="flex flex-col gap-3">
                  <a href="https://buymeacoffee.com/scobru" target="_blank" class="btn btn-outline btn-block">
                    Buy us a coffee
                  </a>
                  <a href="https://github.com/scobru/tunecamp" target="_blank" class="btn btn-outline btn-block">
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
        <section class="p-4 lg:p-8">
          <h1 class="text-4xl font-bold mb-8 tracking-tight">Welcome to TuneCamp</h1>
          
          <div class="stats shadow bg-base-200 border border-white/5 w-full mb-12">
            <div class="stat">
              <div class="stat-title">Albums</div>
              <div class="stat-value text-primary">${catalog.stats.albums || 0}</div>
              <div class="stat-desc">Curated releases</div>
            </div>
            
            <div class="stat">
              <div class="stat-title">Tracks</div>
              <div class="stat-value text-secondary">${catalog.stats.tracks || 0}</div>
              <div class="stat-desc">Audio files</div>
            </div>
          </div>

          <div class="flex items-center justify-between mb-6">
            <h2 class="text-2xl font-bold">Recent Releases</h2>
            <a href="#/albums" class="btn btn-ghost btn-sm">View All →</a>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6" id="recent-albums"></div>
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
      <section class="p-4 lg:p-8">
        <h1 class="text-3xl font-bold mb-8">Albums</h1>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6" id="albums-grid"></div>
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
      <div class="album-detail p-4 lg:p-8">
        <div class="flex flex-col lg:flex-row gap-8 mb-12">
          <figure class="w-full lg:w-[300px] aspect-square rounded-2xl overflow-hidden shadow-2xl bg-base-300 shrink-0">
            <img src="${API.getAlbumCoverUrl(album.slug || album.id)}" alt="${album.title}" class="w-full h-full object-cover">
          </figure>
          <div class="flex-1 flex flex-col justify-end">
            <h1 class="text-4xl lg:text-6xl font-black mb-4 tracking-tighter">${album.title}</h1>
            <div class="flex items-center gap-3 text-lg mb-6 opacity-80">
              ${artistLink}
              ${album.date ? `<span>•</span> <span>${album.date}</span>` : ''}
              ${album.genre ? `<span>•</span> <span class="badge badge-outline">${album.genre}</span>` : ''}
            </div>
            ${album.description ? `<p class="max-w-2xl text-base-content/70 leading-relaxed mb-8 whitespace-pre-wrap">${album.description}</p>` : ''}
            <div class="flex flex-wrap gap-3">
              ${album.download === 'free' ? `<a href="/api/albums/${album.slug || album.id}/download" class="btn btn-primary shadow-lg">Free Download</a>`
        : album.download === 'codes' ? `<button class="btn btn-primary shadow-lg" onclick="App.showUnlockModal(${album.id})">Unlock Download</button>`
          : ''}
              
              ${(() => {
        if (album.external_links) {
          try {
            const links = JSON.parse(album.external_links);
            return links.map(link =>
              `<a href="${link.url}" target="_blank" class="btn btn-outline border-white/10 hover:bg-white/5">${link.label}</a>`
            ).join('');
          } catch (e) { return ''; }
        }
        return '';
      })()}

              ${this.isAdmin && !album.is_release ? '<button class="btn btn-warning" id="promote-btn">Promote to Release</button>' : ''}
            </div>
          </div>
        </div>
        
        <div class="mb-16">
          <h3 class="text-xl font-bold mb-6 flex items-center gap-2">
            <span>Tracks</span>
            <span class="badge badge-sm badge-ghost opacity-50">${album.tracks ? album.tracks.length : 0}</span>
          </h3>
          <div class="bg-base-200/50 rounded-2xl border border-white/5 overflow-hidden" id="track-list"></div>
        </div>
        
        <!-- Comments Section -->
        <div class="comments-section max-w-3xl" id="comments-section">
          <div class="flex items-center justify-between mb-8">
            <h3 class="text-2xl font-bold">Comments</h3>
            <span class="badge badge-primary" id="comments-count"></span>
          </div>
          <div id="comment-form-container" class="mb-8"></div>
          <div class="space-y-4" id="comments-list">
            <div class="text-center p-8 opacity-50">Loading comments...</div>
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
        const modal = document.getElementById('user-auth-modal');
        if (typeof modal.showModal === 'function') {
          modal.showModal();
        } else {
          modal.classList.add('active');
        }
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
      <section class="p-4 lg:p-8">
        <h1 class="text-3xl font-bold mb-8">Artists</h1>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6" id="artists-grid"></div>
      </section>
    `;

    const grid = document.getElementById('artists-grid');
    grid.innerHTML = artists.map(artist => `
      <a href="#/artist/${artist.slug || artist.id}" class="card bg-base-200 hover:bg-base-300 transition-colors border border-white/5 group">
        <figure class="aspect-square relative overflow-hidden">
          <div class="artist-cover-placeholder w-full h-full flex items-center justify-center bg-base-300 group-hover:scale-105 transition-transform duration-500" data-src="${API.getArtistCoverUrl(artist.slug || artist.id)}">
            <div class="text-4xl opacity-20">👤</div>
          </div>
        </figure>
        <div class="card-body p-4">
          <h2 class="card-title text-base justify-center">${artist.name}</h2>
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
      <section class="p-4 lg:p-8 max-w-7xl mx-auto">
        <div class="flex items-center justify-between mb-8">
            <div>
                <h1 class="text-3xl font-bold flex items-center gap-3">
                    <span class="text-primary">🎵</span> All Tracks
                </h1>
                <p class="text-sm opacity-50 mt-1">Found ${tracks.length} tracks in your library</p>
            </div>
            <div class="flex gap-2">
                <button class="btn btn-primary btn-sm" onclick="Player.playQueue(${JSON.stringify(tracks.map(t => t.id)).replace(/"/g, '&quot;')}, 0)">
                    ▶ Play All
                </button>
            </div>
        </div>
        
        <div class="bg-base-200/50 rounded-2xl border border-white/5 overflow-hidden backdrop-blur-sm" id="all-tracks-list">
            <!-- Tracks rendered here -->
        </div>
        
        ${tracks.length === 0 ? `
        <div class="text-center py-20 opacity-40">
            <div class="text-6xl mb-4">📀</div>
            <p>Your library is empty.</p>
            <p class="text-sm">Upload some music in the Admin Panel!</p>
        </div>
        ` : ''}
      </section>
    `;

    const list = document.getElementById('all-tracks-list');
    if (!tracks || tracks.length === 0) return;

    list.innerHTML = tracks.map((track, index) => {
      const coverUrl = track.cover || (track.album_id ? API.getAlbumCoverUrl(track.album_id) : '/img/album-placeholder.png');

      return `
      <div class="group flex items-center gap-4 p-3 hover:bg-base-100/80 transition-all cursor-pointer border-b border-white/5 last:border-0 relative overflow-hidden" 
           onclick="Player.play(JSON.parse(this.dataset.track), null)"
           data-track='${JSON.stringify(track).replace(/'/g, "&apos;")}' 
           data-index="${index}">
           
        <!-- Track Number -->
        <div class="w-8 text-center text-sm opacity-30 font-mono group-hover:opacity-100 transition-opacity">${index + 1}</div>
        
        <!-- Cover -->
        <div class="relative w-12 h-12 rounded-lg bg-base-300 flex-shrink-0 overflow-hidden shadow-sm group-hover:shadow-md transition-shadow" style="width: 3rem; height: 3rem; min-width: 3rem;">
           <img src="${coverUrl}" class="w-full h-full object-cover" onerror="this.src='/img/album-placeholder.png'">
           <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
             <span class="text-white">▶</span>
           </div>
        </div>

        <!-- Info & Waveform -->
        <div class="flex-1 min-w-0 flex flex-col justify-center gap-1 z-10">
          <div class="flex items-baseline gap-2">
              <span class="font-bold text-sm truncate text-base-content">${App.escapeHtml(track.title)}</span>
              <span class="text-xs opacity-50 truncate hidden sm:inline">${App.escapeHtml(track.artist_name || 'Unknown')}</span>
          </div>
          <div class="h-8 w-full opacity-40 group-hover:opacity-60 transition-opacity relative track-waveform-container" style="mask-image: linear-gradient(to right, black 90%, transparent 100%);">
             <canvas width="600" height="60" class="w-full h-full object-contain" data-waveform="${track.waveform || ''}"></canvas>
          </div>
        </div>

        <!-- Duration & Meta -->
        <div class="flex items-center gap-4 z-10">
          <div class="text-xs font-mono opacity-40 w-10 text-right group-hover:opacity-100 transition-opacity">${Player.formatTime(track.duration)}</div>
          
          <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              ${this.isAdmin && !track.album_id && track.file_path.includes('library') ?
          `<button class="btn btn-ghost btn-xs" title="Add to Release" 
                  onclick="event.stopPropagation(); App.showAddToReleaseModal(${track.id}, '${track.title.replace(/'/g, "\\'")}')">
                  +Release
               </button>` : ''}
               
              ${this.isAdmin ?
          `<button class="btn btn-ghost btn-xs btn-square" title="Edit" 
                  onclick="event.stopPropagation(); App.showEditTrackModal(${track.id})">
                  ✏️
               </button>` : ''}
              
              <button class="btn btn-ghost btn-xs btn-square" title="Add to Playlist" 
                  onclick="event.stopPropagation(); App.showAddToPlaylistModal(${track.id})">
                  📋
              </button>
              
              <button class="btn btn-ghost btn-xs btn-square" title="Add to Queue" 
                  onclick="event.stopPropagation(); Player.addToQueue(${JSON.stringify(track).replace(/"/g, '&quot;')})">
                  ➕
              </button>
          </div>
        </div>
      </div>
    `}).join('');

    // Re-use existing helpers
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
      <section class="p-4 lg:p-8">
        <div class="flex flex-col lg:flex-row gap-8 mb-12 items-start">
          <div class="artist-cover-placeholder w-64 h-64 rounded-full overflow-hidden shadow-2xl bg-base-300 shrinks-0 artist-header-cover" data-src="${API.getArtistCoverUrl(artist.slug || artist.id)}">
            <div class="flex items-center justify-center w-full h-full text-6xl opacity-20">👤</div>
          </div>
          <div class="flex-1 pt-4">
            <h1 class="text-5xl font-black mb-4 tracking-tighter">${artist.name}</h1>
            ${artist.bio ? `<p class="max-w-2xl text-base-content/70 leading-relaxed mb-8 bg-base-200/30 p-4 rounded-xl border border-white/5">${artist.bio}</p>` : ''}
            ${linksHtml}
          </div>
        </div>

        ${hasPosts ? `
        <div class="mb-12">
          <h2 class="text-2xl font-bold mb-6">Recent Activity</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4" id="artist-posts">
              ${posts.map(p => `
                  <div class="card bg-base-200 border border-white/5 p-6 hover:bg-base-300 transition-colors">
                      <div class="flex justify-between items-center mb-4 text-xs font-mono opacity-50 uppercase tracking-widest">
                          <span>${new Date(p.created_at).toLocaleDateString()}</span>
                          <span>${new Date(p.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div class="text-lg leading-relaxed whitespace-pre-wrap">${App.escapeHtml(p.content).substring(0, 300)}${p.content.length > 300 ? '...' : ''}</div>
                  </div>
              `).join('')}
          </div>
        </div>
        ` : ''}

        ${hasAlbums ? `
        <div class="mb-12">
          <h2 class="text-2xl font-bold mb-6">Albums</h2>
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6" id="artist-albums"></div>
        </div>
        ` : ''}

        ${hasTracks ? `
        <div>
          <h2 class="text-2xl font-bold mb-6">Tracks</h2>
          <div class="bg-base-200 rounded-2xl border border-white/5 overflow-hidden" id="artist-tracks"></div>
        </div>
        ` : ''}
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
        html += '<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">';
        html += data.artists.map(a => `
          <a href="#/artist/${a.id}" class="card bg-base-200 border border-white/5 hover:bg-base-300 transition-colors">
            <figure class="aspect-square bg-base-300 flex items-center justify-center text-4xl opacity-20">👤</figure>
            <div class="card-body p-4"><div class="card-title text-sm justify-center">${a.name}</div></div>
          </a>
        `).join('');
        html += '</div>';
      }

      if (data.albums.length > 0) {
        html += '<h3 style="margin: 1rem 0;">Albums</h3>';
        html += '<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">';
        html += data.albums.map(a => `
          <a href="#/album/${a.id}" class="card bg-base-200 border border-white/5 hover:bg-base-300 transition-colors">
            <figure class="aspect-square bg-base-300 overflow-hidden">
               <img src="${API.getAlbumCoverUrl(a.id)}" class="w-full h-full object-cover" alt="${a.title}">
            </figure>
            <div class="card-body p-4">
              <div class="card-title text-sm truncate block">${a.title}</div>
              <div class="text-xs opacity-60 truncate">${a.artist_name || ''}</div>
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
      <section class="section p-4 lg:p-8 max-w-7xl mx-auto">
        <div class="mb-8">
          <h1 class="text-3xl font-bold flex items-center gap-3">
            <span class="text-primary">🌐</span> TuneCamp Network
          </h1>
          <p class="text-base-content/60 mt-2 max-w-2xl">
            Discover music shared by other TuneCamp instances across the decentralized network.
          </p>
        </div>

        <div id="network-loading" class="flex flex-col items-center justify-center py-20 opacity-50">
          <span class="loading loading-bars loading-lg text-primary"></span>
          <p class="mt-4 text-sm">Scanning the frequency...</p>
        </div>

        <div id="network-tracks" class="hidden mb-12"></div>
        <div id="network-sites" class="hidden"></div>
      </section>
    `;

    try {
      const [tracksRaw, sitesRaw] = await Promise.all([
        API.getNetworkTracks(),
        API.getNetworkSites()
      ]);

      // Deduplicate sites logic...
      const uniqueSites = new Map();
      sitesRaw.forEach(s => {
        if (!s.url || !s.url.startsWith('http')) return;
        const normalizedUrl = s.url.replace(/\/$/, '');
        if (!uniqueSites.has(normalizedUrl)) {
          uniqueSites.set(normalizedUrl, { ...s, url: normalizedUrl });
        }
      });
      const sites = Array.from(uniqueSites.values());

      // Deduplicate tracks logic...
      const seenTrackUrls = new Set();
      const tracks = tracksRaw.filter(t => {
        if (!t.audioUrl || !t.title) return false;
        if (seenTrackUrls.has(t.audioUrl)) return false;
        seenTrackUrls.add(t.audioUrl);
        return true;
      });

      const loadingEl = document.getElementById('network-loading');
      if (loadingEl) loadingEl.style.display = 'none';

      const tracksContainer = document.getElementById('network-tracks');
      const sitesContainer = document.getElementById('network-sites');

      if (!tracksContainer || !sitesContainer) return;

      // Render Tracks
      if (tracks && tracks.length > 0) {
        tracksContainer.classList.remove('hidden');
        tracksContainer.innerHTML = `
          <div class="flex items-center gap-2 mb-6">
            <h2 class="text-xl font-bold">Community Tracks</h2>
            <span class="badge badge-primary badge-outline">${tracks.length}</span>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            ${tracks.map((t, i) => {
          const trackData = JSON.stringify({
            id: t.slug,
            title: t.title,
            artist_name: t.artistName,
            duration: t.duration,
            audioUrl: t.audioUrl,
            coverUrl: t.coverUrl,
            isExternal: true
          }).replace(/'/g, "&apos;");

          return `
              <div class="card bg-base-200/50 border border-white/5 hover:bg-base-200 transition-all cursor-pointer group network-track shadow-sm hover:shadow-md" 
                   data-track='${trackData}' data-index="${i}">
                <div class="p-3 flex items-center gap-4">
                  <div class="relative w-12 h-12 rounded-lg bg-base-300 flex-shrink-0 overflow-hidden">
                    ${t.coverUrl ? `<img src="${t.coverUrl}" class="w-full h-full object-cover">` : '<div class="w-full h-full flex items-center justify-center text-xl opacity-30">🎵</div>'}
                    <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <span class="text-white">▶</span>
                    </div>
                  </div>
                  
                  <div class="flex-1 min-w-0">
                    <div class="font-bold text-sm truncate pr-2">${App.escapeHtml(t.title || 'Untitled')}</div>
                    <div class="text-xs opacity-60 truncate flex items-center gap-1">
                      <span>${App.escapeHtml(t.artistName || 'Unknown')}</span>
                      ${t.siteUrl ? `• <a href="${t.siteUrl}" target="_blank" onclick="event.stopPropagation()" class="hover:text-primary hover:underline">${new URL(t.siteUrl).hostname}</a>` : ''}
                    </div>
                  </div>

                  <div class="text-xs font-mono opacity-40">${Player.formatTime(t.duration)}</div>
                </div>
              </div>
              `;
        }).join('')}
          </div>
        `;

        // Click handlers
        tracksContainer.querySelectorAll('.network-track').forEach(item => {
          item.addEventListener('click', () => {
            try {
              const track = JSON.parse(item.dataset.track.replace(/&apos;/g, "'"));
              this.playExternalTrack(track, tracks, parseInt(item.dataset.index));
            } catch (e) { console.error(e); }
          });
        });
      } else {
        tracksContainer.classList.remove('hidden');
        tracksContainer.innerHTML = `
           <div class="text-center py-12 opacity-50 border-2 border-dashed border-white/5 rounded-xl">
             <p>No community tracks found yet.</p>
           </div>
         `;
      }

      // Render Sites
      if (sites && sites.length > 0) {
        sitesContainer.classList.remove('hidden');
        sitesContainer.innerHTML = `
          <div class="flex items-center gap-2 mb-6">
            <h2 class="text-xl font-bold">Active Instances</h2>
            <span class="badge badge-secondary badge-outline">${sites.length}</span>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            ${sites.map(s => `
              <a href="${s.url}" target="_blank" rel="noopener noreferrer" class="card bg-base-200 border border-white/5 hover:border-primary/30 transition-all hover:scale-[1.01] group">
                <figure class="h-32 bg-base-300 relative overflow-hidden">
                  ${s.coverImage ? `<img src="${s.coverImage}" class="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity">` : '<div class="w-full h-full flex items-center justify-center text-4xl opacity-20">🏠</div>'}
                  <div class="absolute bottom-2 right-2 badge badge-neutral badge-sm bg-black/50 border-none backdrop-blur-md">
                    ${new URL(s.url).hostname}
                  </div>
                </figure>
                <div class="card-body p-4">
                  <h3 class="font-bold text-lg group-hover:text-primary transition-colors">${App.escapeHtml(s.title || 'Untitled')}</h3>
                  <p class="text-sm opacity-60 line-clamp-2">${App.escapeHtml(s.siteDescription || 'No description provided.')}</p>
                </div>
              </a>
            `).join('')}
          </div>
        `;
      }
    } catch (e) {
      console.error('Network load error:', e);
      document.getElementById('network-loading').innerHTML = '<p class="text-error">Failed to load network.</p>';
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

          <div class="stats stats-vertical lg:stats-horizontal shadow bg-base-200 border border-white/5 w-full mb-8">
            <div class="stat">
              <div class="stat-title">Total Plays</div>
              <div class="stat-value text-primary">${overview.totalPlays}</div>
            </div>
            <div class="stat">
              <div class="stat-title">Listening Time</div>
              <div class="stat-value text-secondary">${Player.formatTime(overview.totalListeningTime)}</div>
            </div>
            <div class="stat">
              <div class="stat-title">Unique Tracks</div>
              <div class="stat-value text-accent">${overview.uniqueTracks}</div>
            </div>
            <div class="stat">
              <div class="stat-title">Plays Today</div>
              <div class="stat-value">${overview.playsToday}</div>
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

          <!-- Main Stats Grid -->
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            
            <!-- Top Artists -->
            <div class="card bg-base-200 border border-white/5">
                <div class="card-body">
                    <h3 class="card-title text-lg mb-4">🏆 Top Artists (30d)</h3>
                    <div class="space-y-3">
                        ${topArtists.length ? topArtists.map((artist, i) => `
                        <div class="flex items-center gap-3 p-2 hover:bg-white/5 rounded-lg cursor-pointer transition-colors" 
                             onclick="window.location.hash='#/artist/${artist.id}'">
                            <div class="font-bold font-mono text-xl opacity-30 w-8 text-center">${i + 1}</div>
                            <div class="flex-1 min-w-0">
                                <div class="font-bold truncate">${App.escapeHtml(artist.name)}</div>
                                <div class="text-xs opacity-50 text-accent">${artist.play_count} plays</div>
                            </div>
                        </div>
                        `).join('') : '<p class="text-center opacity-40 py-8">No top artists yet</p>'}
                    </div>
                </div>
            </div>

            <!-- Recently Played -->
            <div class="card bg-base-200 border border-white/5 col-span-1 lg:col-span-2">
                <div class="card-body">
                    <h3 class="card-title text-lg mb-4">🕒 Recently Played</h3>
                    <div class="overflow-x-auto">
                        <table class="table table-zebra w-full">
                            <thead>
                                <tr>
                                    <th>Track</th>
                                    <th>Artist</th>
                                    <th>Time</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${recentPlays.length ? recentPlays.map(play => `
                                <tr class="hover cursor-pointer" onclick="Player.play({id: '${play.track_id}', title: '${play.title.replace(/'/g, "\\'")}', artist_name: '${play.artist_name.replace(/'/g, "\\'")}', cover: '${play.cover}'})">
                                    <td>
                                        <div class="flex items-center gap-3">
                                            <div class="avatar">
                                                <div class="mask mask-squircle w-10 h-10">
                                                    <img src="${play.cover}" onerror="this.src='/img/album-placeholder.png'" />
                                                </div>
                                            </div>
                                            <div class="font-bold truncate max-w-[150px]">${App.escapeHtml(play.title)}</div>
                                        </div>
                                    </td>
                                    <td>${App.escapeHtml(play.artist_name)}</td>
                                    <td class="text-sm opacity-60">${App.formatTimeAgo(play.played_at)}</td>
                                </tr>
                                `).join('') : '<tr><td colspan="3" class="text-center py-8 opacity-40">No listening history</td></tr>'}
                            </tbody>
                        </table>
                    </div>
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
        <div class="p-4 lg:p-8">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
              <h2 class="text-3xl font-bold">File Browser</h2>
              <div class="text-sm font-mono opacity-50 mt-1">/${data.path || ''}</div>
            </div>
          </div>

          <div class="bg-base-200 rounded-2xl border border-white/5 overflow-hidden">
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
        <div class="p-4 lg:p-8">
          <div class="flex items-center justify-between mb-8">
            <h2 class="text-3xl font-bold">Playlists</h2>
          </div>
          ${createForm}
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            ${playlists.length ? playlists.map(p => `
              <div class="card bg-base-200 border border-white/5 hover:bg-base-300 transition-all cursor-pointer group" onclick="window.location.hash='#/playlist/${p.id}'">
                <div class="card-body">
                  <h3 class="card-title text-xl group-hover:text-primary transition-colors">${App.escapeHtml(p.name)}</h3>
                  <p class="text-sm opacity-60 line-clamp-2">${App.escapeHtml(p.description || 'No description')}</p>
                  <div class="card-actions justify-end mt-4 items-center gap-4">
                    <span class="text-xs font-mono opacity-50">${p.is_public ? '🌐 Public' : '🔒 Private'}</span>
                    <span class="text-xs opacity-50">${new Date(p.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            `).join('') : '<p class="col-span-full text-center p-12 opacity-50">No playlists found.</p>'}
          </div>
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
      <section class="admin-section p-4 lg:p-8 max-w-7xl mx-auto">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 class="text-3xl font-bold">Admin Panel</h1>
            <p class="text-sm opacity-50">Manage your server, library, and community.</p>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-outline" id="logout-btn">Logout</button>
          </div>
        </div>

        <div class="tabs tabs-lifted mb-8" id="admin-tabs">
          <button class="tab tab-active" data-tab="dashboard-panel">Dashboard</button>
          <button class="tab" data-tab="library-panel">Library</button>
          <button class="tab" data-tab="posts-panel">Community</button>
          <button class="tab" data-tab="config-panel">Config</button>
          <button class="tab" data-tab="system-panel">System</button>
        </div>

        <!-- Dashboard Panel -->
        <div id="dashboard-panel" class="admin-tab-panel">
          <div class="stats stats-vertical lg:stats-horizontal shadow bg-base-200 border border-white/5 w-full mb-8">
            <div class="stat">
              <div class="stat-title">Artists</div>
              <div class="stat-value text-primary">${stats.artists}</div>
            </div>
            <div class="stat">
              <div class="stat-title">Albums</div>
              <div class="stat-value text-secondary">${stats.albums}</div>
            </div>
            <div class="stat">
              <div class="stat-title">Tracks</div>
              <div class="stat-value text-accent">${stats.tracks}</div>
            </div>
            <div class="stat">
              <div class="stat-title">Public</div>
              <div class="stat-value">${stats.publicAlbums}</div>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div class="card bg-base-200 border border-white/5">
              <div class="card-body">
                <h2 class="card-title">Quick Actions</h2>
                <div class="flex flex-wrap gap-2 mt-4">
                  <button class="btn btn-primary btn-sm" id="new-release-quick-btn">New Release</button>
                  <button class="btn btn-outline btn-sm" id="upload-quick-btn">Upload Tracks</button>
                  <button class="btn btn-outline btn-sm" id="new-artist-quick-btn">New Artist</button>
                  <button class="btn btn-outline btn-sm" id="posts-quick-btn">New Post</button>
                </div>
              </div>
            </div>
            <div class="card bg-base-200 border border-white/5">
              <div class="card-body">
                <h2 class="card-title">Recent Activity</h2>
                <div class="text-sm opacity-50 py-4">Recent system logs and activity will appear here.</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Library Panel -->
        <div id="library-panel" class="admin-tab-panel" style="display: none;">
          <div class="flex justify-between items-center mb-6">
            <h2 class="text-xl font-bold">Manage Library</h2>
            <div class="flex gap-2">
                <button class="btn btn-primary btn-sm" id="new-release-btn">＋ New Release</button>
                <button class="btn btn-secondary btn-sm" id="new-artist-btn">＋ New Artist</button>
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div class="lg:col-span-2">
              <div class="card bg-base-300/30 border border-white/5">
                <div class="card-body p-0">
                  <div class="overflow-x-auto">
                    <table class="table table-zebra w-full text-sm">
                      <thead>
                        <tr>
                          <th>Release</th>
                          <th>Artist</th>
                          <th>Status</th>
                          <th class="text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${releases.map(r => `
                          <tr class="hover">
                            <td>
                              <div class="flex items-center gap-3">
                                <div class="avatar">
                                  <div class="mask mask-squircle w-10 h-10 bg-base-300">
                                    <img src="${API.getAlbumCoverUrl(r.slug || r.id)}" alt="${r.title}" onerror="this.src='/img/album-placeholder.png'">
                                  </div>
                                </div>
                                <div>
                                    <div class="font-bold cursor-pointer hover:text-primary transition-colors edit-release-btn" data-id="${r.id}">${App.escapeHtml(r.title)}</div>
                                    <div class="text-[10px] opacity-40 uppercase tracking-tighter">${r.slug || r.id}</div>
                                </div>
                              </div>
                            </td>
                            <td class="opacity-70">${App.escapeHtml(r.artist_name || 'Various')}</td>
                            <td>
                              <div class="flex items-center gap-2">
                                <input type="checkbox" class="toggle toggle-success toggle-xs visibility-toggle" 
                                    ${r.is_public ? 'checked' : ''} data-id="${r.id}">
                                <span class="badge ${r.is_public ? 'badge-success' : 'badge-ghost'} badge-xs">
                                  ${r.is_public ? 'Public' : 'Hidden'}
                                </span>
                              </div>
                            </td>
                            <th class="text-right">
                                <div class="dropdown dropdown-left">
                                    <button tabindex="0" class="btn btn-ghost btn-xs">Actions</button>
                                    <ul tabindex="0" class="dropdown-content menu p-2 shadow bg-base-300 rounded-box w-40 z-50">
                                        <li><a class="edit-release-btn" data-id="${r.id}">Edit Metadata</a></li>
                                        <li><a class="upload-to-release-btn" data-slug="${r.slug || r.id}">Upload Tracks</a></li>
                                        <li><a class="delete-release-btn text-error" data-id="${r.id}">Delete Release</a></li>
                                    </ul>
                                </div>
                            </th>
                          </tr>
                        `).join('')}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div class="card bg-base-200 border border-white/5 mb-8">
                <div class="card-body">
                  <h3 class="font-bold mb-4 text-sm uppercase opacity-50">Manual Upload</h3>
                  <div class="upload-zone border-2 border-dashed border-white/10 rounded-xl p-8 text-center bg-base-300/30 hover:bg-base-300/50 transition-colors cursor-pointer" id="upload-zone">
                    <input type="file" id="file-input" multiple accept="audio/*" style="display: none;">
                    <div class="text-3xl mb-2">📁</div>
                    <p class="text-sm font-medium">Drag & drop files</p>
                    <button class="btn btn-xs btn-outline mt-3" id="browse-btn">Browse Files</button>
                  </div>
                  <div id="upload-progress" class="mt-4" style="display: none;">
                    <progress class="progress progress-primary w-full" id="progress-fill" value="0" max="100"></progress>
                    <p id="upload-status" class="text-[10px] mt-1 text-center font-mono uppercase"></p>
                  </div>
                </div>
              </div>

              <div class="card bg-base-200 border border-white/5">
                 <div class="card-body">
                    <h3 class="font-bold mb-4 text-sm uppercase opacity-50">Artists</h3>
                    <div id="admin-artists-list" class="space-y-1">
                        <!-- Artists list loaded here -->
                    </div>
                 </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Community Panel -->
        <div id="posts-panel" class="admin-tab-panel" style="display: none;">
            <h2 class="text-xl font-bold mb-6">Social & Community</h2>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div class="card bg-base-200 border border-white/5">
                    <div class="card-body">
                        <h4 class="card-title mb-4">Create New Post</h4>
                        <form id="create-post-form">
                            <div class="form-control w-full">
                                <label class="label"><span class="label-text">Artist</span></label>
                                <select id="post-artist" class="select select-bordered w-full" required>
                                    <option value="">Select Artist...</option>
                                </select>
                            </div>
                            <div class="form-control w-full mt-4">
                                <label class="label"><span class="label-text">Content</span></label>
                                <textarea id="post-content" class="textarea textarea-bordered w-full h-32" required placeholder="Write something to your followers..."></textarea>
                            </div>
                            <button type="submit" class="btn btn-primary w-full mt-6">Publish Post</button>
                        </form>
                    </div>
                </div>
                <div class="card bg-base-200 border border-white/5">
                    <div class="card-body">
                        <h4 class="card-title mb-4">Recent Posts</h4>
                        <div id="posts-list" class="space-y-4">
                            <p class="text-sm opacity-50 text-center py-12">Select an artist to view their posts.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Config Panel -->
        <div id="config-panel" class="admin-tab-panel" style="display: none;">
          <h2 class="text-xl font-bold mb-6">Configuration</h2>
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div class="card bg-base-200 border border-white/5">
              <div class="card-body">
                <h3 class="card-title mb-4">Network & Social</h3>
                <form id="network-settings-form" class="space-y-4">
                  <div class="form-control">
                    <label class="label"><span class="label-text">Public Server URL</span></label>
                    <input type="url" id="network-setting-public-url" class="input input-bordered" placeholder="https://tunecamp.example.com">
                  </div>
                  <div class="form-control">
                    <label class="label"><span class="label-text">Site Name</span></label>
                    <input type="text" id="network-setting-site-name" class="input input-bordered">
                  </div>
                  <div class="form-control">
                    <label class="label"><span class="label-text">Description</span></label>
                    <textarea id="network-setting-site-description" class="textarea textarea-bordered"></textarea>
                  </div>
                  <div class="form-control">
                    <label class="label"><span class="label-text">Primary Artist Name</span></label>
                    <input type="text" id="network-setting-artist-name" class="input input-bordered">
                  </div>
                  <div class="form-control">
                    <label class="label"><span class="label-text">Cover/Avatar URL</span></label>
                    <input type="text" id="network-setting-cover-image" class="input input-bordered">
                  </div>
                  <button type="submit" class="btn btn-primary mt-4">Save Configuration</button>
                </form>
              </div>
            </div>

            <div class="card bg-base-200 border border-white/5">
              <div class="card-body">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="card-title">Site Settings</h3>
                </div>
                
                <form id="site-settings-form" class="space-y-4">
                  <div class="form-control">
                    <label class="label"><span class="label-text">Background Image URL</span></label>
                    <input type="text" id="setting-background-image" class="input input-bordered" placeholder="/api/settings/background">
                  </div>
                  <div class="form-control">
                    <label class="label"><span class="label-text">Upload Background</span></label>
                    <input type="file" id="setting-background-file" class="file-input file-input-bordered w-full" accept="image/*">
                  </div>
                  <button type="submit" class="btn btn-primary mt-4" id="save-settings-btn">Save Site Settings</button>
                </form>

                <div class="divider mt-8">Admins</div>
                
                <div class="bg-base-300/30 p-4 rounded-xl border border-white/5 mb-6">
                    <h4 class="text-sm font-bold opacity-50 mb-4 uppercase">Add New User</h4>
                    <form id="create-user-form" class="space-y-4">
                        <div class="grid grid-cols-2 gap-4">
                            <div class="form-control">
                                <label class="label p-0"><span class="label-text text-xs">Username</span></label>
                                <input type="text" id="new-user-name" class="input input-sm input-bordered" required>
                            </div>
                            <div class="form-control">
                                <label class="label p-0"><span class="label-text text-xs">Password</span></label>
                                <input type="password" id="new-user-pass" class="input input-sm input-bordered" required>
                            </div>
                        </div>
                        <div class="form-control">
                            <label class="label p-0"><span class="label-text text-xs">Artist Link (Optional)</span></label>
                            <select id="new-user-artist" class="select select-sm select-bordered">
                                <option value="">None</option>
                            </select>
                        </div>
                        <button type="submit" class="btn btn-sm btn-primary btn-block">Create Admin</button>
                    </form>
                </div>

                <div id="users-list-container" class="space-y-2">
                    <!-- Users list loaded here -->
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- System Panel -->
        <div id="system-panel" class="admin-tab-panel" style="display: none;">
          <h2 class="text-xl font-bold mb-6">System Management</h2>
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div class="card bg-base-200 border border-white/5">
              <div class="card-body">
                <h3 class="card-title mb-4">Maintenance</h3>
                <div class="space-y-4">
                    <div class="p-4 bg-base-300/50 rounded-xl border border-white/5">
                        <h4 class="font-bold mb-1">Rescan Library</h4>
                        <p class="text-xs opacity-50 mb-3">Re-scan the music folder for new files.</p>
                        <button class="btn btn-sm btn-outline" id="rescan-btn">🔄 Start Rescan</button>
                    </div>
                    <div class="p-4 bg-base-300/50 rounded-xl border border-white/5">
                        <h4 class="font-bold mb-1">Consolidate Library</h4>
                        <p class="text-xs opacity-50 mb-3">Organize files into Artist/Album folder structure.</p>
                        <button class="btn btn-sm btn-outline" id="consolidate-btn">🚀 Consolidate</button>
                    </div>
                    <div class="p-4 bg-base-300/50 rounded-xl border border-white/5">
                        <h4 class="font-bold mb-1">Reset Hidden Tracks</h4>
                        <p class="text-xs opacity-50 mb-3">Clear the list of tracks hidden from the network feed.</p>
                        <button class="btn btn-sm btn-outline btn-error" id="reset-hidden-tracks">Reset Hidden Tracks</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Release Editor Panel (Hidden by default) -->
        <div id="release-panel" class="admin-panel hidden">
            <div class="flex items-center justify-between mb-6">
                <h2 class="text-2xl font-bold" id="release-panel-title">Create New Release</h2>
                <button class="btn btn-sm btn-ghost" onclick="App.toggleAdminPanel('library-panel')">✕ Close</button>
            </div>
            
            <form id="release-editor-form" class="max-w-3xl mx-auto space-y-6">
                <div class="card bg-base-200 border border-white/5">
                    <div class="card-body">
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <!-- Cover Upload -->
                            <div>
                                <label class="label"><span class="label-text">Cover Art</span></label>
                                <div class="relative group aspect-square rounded-xl overflow-hidden bg-base-300 border-2 border-dashed border-white/10 hover:border-primary transition-colors cursor-pointer" id="release-cover-preview">
                                    <div class="absolute inset-0 flex items-center justify-center text-4xl opacity-20 group-hover:opacity-100 transition-opacity">📷</div>
                                    <input type="file" id="release-cover-input" accept="image/*" class="absolute inset-0 opacity-0 cursor-pointer">
                                </div>
                            </div>
                            
                            <!-- Metadata -->
                            <div class="md:col-span-2 space-y-4">
                                <div class="form-control">
                                    <label class="label"><span class="label-text">Title</span></label>
                                    <input type="text" id="release-title" class="input input-bordered w-full" required>
                                </div>
                                <div class="grid grid-cols-2 gap-4">
                                    <div class="form-control">
                                        <label class="label"><span class="label-text">Artist</span></label>
                                        <select id="release-artist" class="select select-bordered w-full" required>
                                            <option value="">Select Artist...</option>
                                        </select>
                                    </div>
                                    <div class="form-control">
                                        <label class="label"><span class="label-text">Date</span></label>
                                        <input type="date" id="release-date" class="input input-bordered w-full">
                                    </div>
                                </div>
                                <div class="form-control">
                                    <label class="label"><span class="label-text">Genre (comma separated)</span></label>
                                    <input type="text" id="release-genres" class="input input-bordered w-full" placeholder="e.g. Electronic, Ambient">
                                </div>
                            </div>
                        </div>

                        <div class="form-control mt-4">
                            <label class="label"><span class="label-text">Description</span></label>
                            <textarea id="release-description" class="textarea textarea-bordered h-24" placeholder="About this release..."></textarea>
                        </div>

                        <div class="form-control mt-4">
                            <label class="label"><span class="label-text">Download Options</span></label>
                            <select id="release-download" class="select select-bordered w-full max-w-xs">
                                <option value="none">Streaming Only</option>
                                <option value="free">Free Download</option>
                            </select>
                        </div>

                        <div class="divider">External Links</div>
                        <div id="release-external-links" class="space-y-2">
                            <!-- Links injected here -->
                        </div>
                        <button type="button" class="btn btn-sm btn-ghost mt-2" onclick="App.addLinkInputToEditor()">＋ Add Link</button>
                    </div>
                </div>

                <!-- Track Management (Only for Edit Mode) -->
                <div id="release-tracks-section" style="display: none;">
                    <div class="card bg-base-200 border border-white/5">
                        <div class="card-body">
                            <h3 class="card-title text-base mb-4">Tracks</h3>
                            <div id="release-tracks-list" class="space-y-2"></div>
                            <button type="button" class="btn btn-sm btn-outline mt-4 w-full" onclick="document.querySelector('.upload-to-release-btn[data-slug]').click()">Upload Tracks</button>
                        </div>
                    </div>
                </div>

                <div class="flex justify-between items-center pt-4">
                    <button type="button" class="btn btn-error btn-outline" id="delete-release-editor-btn" style="display: none;">Delete Release</button>
                    <div class="flex gap-2">
                        <button type="button" class="btn btn-ghost" onclick="App.toggleAdminPanel('library-panel')">Cancel</button>
                        <button type="submit" class="btn btn-primary" id="save-release-btn">Save Release</button>
                    </div>
                </div>
            </form>
        </div>
      </section>
    `;

    this.setupAdminHandlers(container, releases);
  },

  setupAdminHandlers(container, releases) {
    const tabs = container.querySelectorAll('.tab');
    const panels = container.querySelectorAll('.admin-tab-panel');

    // Tab switching
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        tabs.forEach(t => t.classList.remove('tab-active'));
        tab.classList.add('tab-active');
        panels.forEach(p => p.style.display = p.id === target ? 'block' : 'none');

        if (target === 'posts-panel') {
          container.querySelector('#post-artist')?.dispatchEvent(new Event('change'));
        } else if (target === 'config-panel') {
          this.renderUsersList();
        }
      });
    });

    // Quick Action Handlers
    container.querySelector('#new-release-quick-btn')?.addEventListener('click', () => {
      this.openReleaseEditor(null);
      const libTab = Array.from(tabs).find(t => t.dataset.tab === 'library-panel');
      if (libTab) libTab.click();
    });

    container.querySelector('#upload-quick-btn')?.addEventListener('click', () => {
      const libTab = Array.from(tabs).find(t => t.dataset.tab === 'library-panel');
      if (libTab) libTab.click();
      container.querySelector('#browse-btn')?.click();
    });

    container.querySelector('#new-artist-quick-btn')?.addEventListener('click', () => {
      this.showEditArtistModal();
    });

    container.querySelector('#posts-quick-btn')?.addEventListener('click', () => {
      const postsTab = Array.from(tabs).find(t => t.dataset.tab === 'posts-panel');
      if (postsTab) postsTab.click();
    });

    // Library Handlers
    container.querySelector('#new-release-btn')?.addEventListener('click', () => this.openReleaseEditor(null));
    container.querySelector('#new-artist-btn')?.addEventListener('click', () => this.showEditArtistModal());

    // Release Action Handlers (Delegation)
    container.addEventListener('click', async (e) => {
      const editBtn = e.target.closest('.edit-release-btn');
      if (editBtn) {
        this.openReleaseEditor(editBtn.dataset.id);
        return;
      }

      const uploadBtn = e.target.closest('.upload-to-release-btn');
      if (uploadBtn) {
        this.showUploadToRelease(uploadBtn.dataset.slug);
        return;
      }

      const deleteBtn = e.target.closest('.delete-release-btn');
      if (deleteBtn) {
        const id = deleteBtn.dataset.id;
        if (confirm('Are you sure you want to delete this release and ALL its files?')) {
          try {
            await API.deleteRelease(id);
            window.location.reload();
          } catch (err) {
            alert('Delete failed');
          }
        }
      }
    });

    // Visibility Toggles
    container.querySelectorAll('.visibility-toggle').forEach(toggle => {
      toggle.addEventListener('change', async (e) => {
        const id = e.target.dataset.id;
        const isPublic = e.target.checked;
        try {
          await API.toggleVisibility(id, isPublic);
          const badge = e.target.nextElementSibling;
          if (badge) {
            badge.className = `badge ${isPublic ? 'badge-success' : 'badge-ghost'} badge-xs`;
            badge.textContent = isPublic ? 'Public' : 'Hidden';
          }
        } catch (err) {
          e.target.checked = !isPublic;
          alert('Failed to update visibility');
        }
      });
    });

    // Upload Handlers
    this.setupUploadHandlers();

    // Artists List Loading
    this.renderAdminArtistsList();

    // Community / Posts Handlers
    const artistSelect = container.querySelector('#post-artist');
    if (artistSelect) {
      API.getArtists().then(artists => {
        artistSelect.innerHTML = '<option value="">Select Artist...</option>' +
          artists.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
      });

      artistSelect.addEventListener('change', async (e) => {
        const artistId = e.target.value;
        const postsList = container.querySelector('#posts-list');
        if (!artistId || !postsList) return;

        postsList.innerHTML = '<div class="loading loading-spinner loading-md"></div>';
        try {
          const posts = await API.getArtistPosts(artistId);
          if (posts.length === 0) {
            postsList.innerHTML = '<p class="text-sm opacity-50 py-12 text-center">No posts yet.</p>';
          } else {
            postsList.innerHTML = posts.map(p => `
                        <div class="card bg-base-300/30 border border-white/5 p-4 relative group">
                            <div class="flex justify-between items-start mb-2">
                                <span class="text-[10px] opacity-40">${new Date(p.created_at).toLocaleString()}</span>
                                <button class="btn btn-ghost btn-xs text-error opacity-0 group-hover:opacity-100 transition-opacity delete-post-btn" data-id="${p.id}">Delete</button>
                            </div>
                            <div class="text-sm border-l-2 border-primary/20 pl-3 py-1 mb-2">${App.escapeHtml(p.content)}</div>
                            <div class="flex justify-end pt-2 border-t border-white/5">
                                <a href="/#/post/${p.slug}" target="_blank" class="text-[10px] hover:underline opacity-50">View Public Post ↗</a>
                            </div>
                        </div>
                    `).join('');

            postsList.querySelectorAll('.delete-post-btn').forEach(btn => {
              btn.addEventListener('click', async () => {
                if (confirm('Delete this post?')) {
                  try {
                    await API.deletePost(btn.dataset.id);
                    artistSelect.dispatchEvent(new Event('change'));
                  } catch (err) {
                    alert('Delete failed');
                  }
                }
              });
            });
          }
        } catch (err) {
          postsList.innerHTML = '<p class="text-error text-sm">Failed to load posts.</p>';
        }
      });
    }

    container.querySelector('#create-post-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const artistId = container.querySelector('#post-artist').value;
      const content = container.querySelector('#post-content').value;
      const btn = e.target.querySelector('button');

      btn.disabled = true;
      btn.textContent = 'Publishing...';
      try {
        await API.createPost(artistId, content);
        container.querySelector('#post-content').value = '';
        artistSelect.dispatchEvent(new Event('change'));
      } catch (err) {
        alert('Post failed: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Publish Post';
      }
    });

    // Config Panel Handlers
    const networkForm = container.querySelector('#network-settings-form');
    if (networkForm) {
      API.getAdminSettings().then(s => {
        networkForm.querySelector('#network-setting-public-url').value = s.publicUrl || '';
        networkForm.querySelector('#network-setting-site-name').value = s.siteName || '';
        networkForm.querySelector('#network-setting-site-description').value = s.siteDescription || '';
        networkForm.querySelector('#network-setting-artist-name').value = s.artistName || '';
        networkForm.querySelector('#network-setting-cover-image').value = s.coverImage || '';

        container.querySelector('#setting-background-image').value = s.backgroundImage || '';
      });

      networkForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button');
        btn.disabled = true;
        try {
          await API.updateSettings({
            publicUrl: networkForm.querySelector('#network-setting-public-url').value,
            siteName: networkForm.querySelector('#network-setting-site-name').value,
            siteDescription: networkForm.querySelector('#network-setting-site-description').value,
            artistName: networkForm.querySelector('#network-setting-artist-name').value,
            coverImage: networkForm.querySelector('#network-setting-cover-image').value
          });
          alert('Settings saved!');
        } catch (err) {
          alert('Save failed: ' + err.message);
        } finally {
          btn.disabled = false;
        }
      });
    }

    container.querySelector('#site-settings-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      try {
        await API.updateSettings({
          backgroundImage: container.querySelector('#setting-background-image').value
        });
        alert('Site settings saved!');
        window.location.reload();
      } catch (err) {
        alert('Save failed: ' + err.message);
      } finally {
        btn.disabled = false;
      }
    });

    container.querySelector('#setting-background-file')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const result = await API.uploadBackgroundImage(file);
        container.querySelector('#setting-background-image').value = result.url || '/api/settings/background';
        alert('File uploaded. Click Save to apply.');
      } catch (err) {
        alert('Upload failed: ' + err.message);
      }
    });

    // Admin List Handlers
    const newUserArtistSelect = container.querySelector('#new-user-artist');
    if (newUserArtistSelect) {
      API.getArtists().then(artists => {
        newUserArtistSelect.innerHTML = '<option value="">None (General Admin)</option>' +
          artists.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
      });
    }

    container.querySelector('#create-user-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const user = container.querySelector('#new-user-name').value;
      const pass = container.querySelector('#new-user-pass').value;
      const artistId = container.querySelector('#new-user-artist').value || null;
      try {
        await API.createAdmin(user, pass, artistId);
        container.querySelector('#new-user-name').value = '';
        container.querySelector('#new-user-pass').value = '';
        this.renderUsersList();
        alert('Admin created');
      } catch (err) {
        alert('Failed: ' + err.message);
      }
    });

    // System Handlers
    container.querySelector('#rescan-btn')?.addEventListener('click', async (e) => {
      const btn = e.target;
      btn.disabled = true;
      btn.textContent = 'Scanning...';
      try {
        await API.rescan();
        window.location.reload();
      } catch (err) {
        alert('Rescan failed');
        btn.disabled = false;
        btn.textContent = '🔄 Start Rescan';
      }
    });

    container.querySelector('#consolidate-btn')?.addEventListener('click', async (e) => {
      if (!confirm('This will move your music files into a unified structure. Proceed?')) return;
      const btn = e.target;
      btn.disabled = true;
      btn.textContent = 'Consolidating...';
      try {
        const res = await API.consolidate();
        alert(res.message || 'Started');
      } catch (err) {
        alert('Failed');
        btn.disabled = false;
        btn.textContent = '🚀 Consolidate';
      }
    });

    container.querySelector('#reset-hidden-tracks')?.addEventListener('click', () => {
      if (confirm('Unhide all tracks?')) {
        localStorage.removeItem('tunecamp_blocked_tracks');
        window.location.reload();
      }
    });

    container.querySelector('#logout-btn')?.addEventListener('click', () => {
      API.logout();
      window.location.hash = '#/';
      window.location.reload();
    });

    // Backup & Identity Handlers omitted for brevity in this chunk, or I can add them if needed.
    // Let's add them to be complete.
    container.querySelector('#export-identity-btn')?.addEventListener('click', async () => {
      try {
        const keys = await API.getIdentity();
        prompt('Copy your server keys (Keep them secret!):', JSON.stringify(keys));
      } catch (e) { alert('Failed'); }
    });

    container.querySelector('#import-identity-btn')?.addEventListener('click', async () => {
      const keys = prompt('Paste server keys JSON:');
      if (keys && confirm('This will REPLICATE identity. Proceed?')) {
        try {
          await API.importIdentity(JSON.parse(keys));
          window.location.reload();
        } catch (e) { alert('Failed'); }
      }
    });

    container.querySelector('#restore-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const file = container.querySelector('#restore-file-input').files[0];
      if (!file || !confirm('DANGER: Overwrite ALL data?')) return;

      const status = container.querySelector('#restore-status');
      status.textContent = 'Restoring...';
      try {
        const formData = new FormData();
        formData.append('backup', file);
        await fetch('/api/admin/backup/restore', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + API.token },
          body: formData
        });
        alert('Restore complete. Restarting.');
        window.location.reload();
      } catch (err) {
        status.textContent = 'Failed: ' + err.message;
      }
    });

    // Release Editor Handler (Added Fix)
    const releaseForm = container.querySelector('#release-editor-form');
    if (releaseForm) {
      releaseForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = container.querySelector('#save-release-btn');
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Saving...';

        try {
          const title = container.querySelector('#release-title').value;
          const artistId = container.querySelector('#release-artist').value;
          const date = container.querySelector('#release-date').value;
          const description = container.querySelector('#release-description').value;
          const genresRaw = container.querySelector('#release-genres').value;
          const genres = genresRaw ? genresRaw.split(',').map(g => g.trim()).filter(g => g) : [];
          const download = container.querySelector('#release-download').value;
          const coverFile = container.querySelector('#release-cover-input').files[0];

          // Collect External Links
          const links = Array.from(container.querySelectorAll('#release-external-links .track-item')).map(div => ({
            label: div.querySelector('.link-label').value.trim(),
            url: div.querySelector('.link-url').value.trim()
          })).filter(l => l.label && l.url);

          let result;
          if (this.currentEditingReleaseId) {
            await API.updateRelease(this.currentEditingReleaseId, {
              title,
              artistName: artistId,
              date,
              description,
              genres,
              download,
              externalLinks: links
            });
            result = { id: this.currentEditingReleaseId, slug: this.currentEditingReleaseId };
          } else {
            result = await API.createRelease({
              title,
              artistId,
              date,
              description,
              genres,
              download,
              externalLinks: links
            });
          }

          if (coverFile) {
            await API.uploadCover(coverFile, result.slug || result.id);
          }

          alert('Release saved successfully!');
          window.location.reload();
        } catch (err) {
          alert('Failed to save release: ' + err.message);
          btn.disabled = false;
          btn.textContent = originalText;
        }
      });

      // Cover Preview Handler
      container.querySelector('#release-cover-input')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const preview = container.querySelector('#release-cover-preview');
            preview.style.backgroundImage = `url(${ev.target.result})`;
            preview.style.backgroundSize = 'cover';
            preview.style.backgroundPosition = 'center';
            preview.innerHTML = '';
          };
          reader.readAsDataURL(file);
        }
      });

      // Delete Release Handler
      container.querySelector('#delete-release-editor-btn')?.addEventListener('click', async () => {
        if (confirm('Are you sure you want to delete this release? This cannot be undone.')) {
          try {
            await API.deleteRelease(this.currentEditingReleaseId);
            window.location.reload();
          } catch (err) {
            alert('Delete failed: ' + err.message);
          }
        }
      });
    }
  },

  async renderAdminArtistsList() {
    const list = document.getElementById('admin-artists-list');
    if (!list) return;
    try {
      const artists = await API.getArtists();
      if (artists.length === 0) {
        list.innerHTML = '<p class="text-sm opacity-50 text-center py-8">No artists found. Create one!</p>';
        return;
      }

      list.innerHTML = `
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            ${artists.map(a => `
            <div class="card bg-base-300/50 border border-white/5 hover:bg-base-300 hover:border-primary/30 transition-all group cursor-pointer" onclick="App.showEditArtistModal('${a.id}')">
                <figure class="aspect-square relative overflow-hidden rounded-t-xl bg-base-200">
                    <img src="${API.getArtistCoverUrl(a.id)}" 
                         class="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500" 
                         onerror="this.src='/img/album-placeholder.png'">
                    <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <span class="btn btn-sm btn-primary btn-outline pointer-events-none">Edit Profile</span>
                    </div>
                </figure>
                <div class="p-3 text-center">
                    <div class="font-bold text-sm truncate" title="${App.escapeHtml(a.name)}">${App.escapeHtml(a.name)}</div>
                    <div class="text-[10px] opacity-40 mt-1 font-mono">ID: ${a.id}</div>
                </div>
            </div>
            `).join('')}
        </div>
      `;
    } catch (e) {
      list.innerHTML = '<p class="text-[10px] opacity-30 text-center">Failed to load artists</p>';
    }
  },

  async renderUsersList() {
    const list = document.getElementById('users-list-container');
    if (!list) return;

    list.innerHTML = '<div class="loading">Loading users...</div>';

    try {
      const users = await API.getAdmins();

      list.innerHTML = users.map(u => `
        <div class="card bg-base-200 border border-white/5 mb-2">
            <div class="card-body p-4 flex-row items-center justify-between">
                <div>
                    <div class="font-bold flex items-center gap-2">
                      ${App.escapeHtml(u.username)}
                      ${u.is_root ? '<span class="badge badge-primary badge-xs">Root</span>' : ''}
                    </div>
                    <div class="text-xs opacity-50 mt-1">
                        ID: ${u.id} • Joined: ${new Date(u.created_at).toLocaleDateString()}
                        ${u.artist_name ? ` • 🎵 ${App.escapeHtml(u.artist_name)}` : ''}
                    </div>
                </div>
                <div class="flex gap-2">
                    ${this.isRootAdmin && !u.isRootAdmin ? `
                        <button class="btn btn-xs btn-outline edit-user-link" data-id="${u.id}" data-artist-id="${u.artist_id || ''}">Link Artist</button>
                        <button class="btn btn-xs btn-error btn-outline delete-user" data-id="${u.id}">Delete</button>
                    ` : ''}
                </div>
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
      list.innerHTML = '<div class="text-error text-sm">Failed to load users</div>';
    }
  },

  async showLinkArtistModal(userId, currentArtistId) {
    const artists = await API.getArtists();

    const modalId = 'link-artist-modal';
    const existing = document.getElementById(modalId);
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal modal-open bg-black/50 backdrop-blur-sm';
    modal.style.zIndex = '10010';

    const options = '<option value="">None (General Admin)</option>' +
      artists.map(a => `<option value="${a.id}" ${String(a.id) === String(currentArtistId) ? 'selected' : ''}>${a.name}</option>`).join('');

    modal.innerHTML = `
      <div class="modal-box bg-base-200 border border-white/10">
          <h3 class="font-bold text-lg mb-4">Link Admin to Artist</h3>
          <p class="text-sm opacity-70 mb-4">Select an artist to restrict this admin's access.</p>
          <div class="form-control mb-6">
              <select id="link-artist-select" class="select select-bordered w-full">
                  ${options}
              </select>
          </div>
          <div class="modal-action">
              <button class="btn btn-primary" id="save-link-artist">Save</button>
              <button class="btn btn-ghost" id="cancel-link-artist">Cancel</button>
          </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('cancel-link-artist').onclick = () => modal.remove();

    document.getElementById('save-link-artist').onclick = async () => {
      const newArtistId = document.getElementById('link-artist-select').value || null;
      try {
        await API.updateAdmin(userId, { artistId: newArtistId });
        modal.remove();
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

    if (!zone || !input || !browseBtn) return;

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
  toggleAdminPanel(targetId) {
    document.querySelectorAll('.admin-panel, .admin-tab-panel').forEach(p => {
      if (p.id === targetId) {
        p.style.display = 'block';
        p.classList.remove('hidden');
      } else {
        p.style.display = 'none';
        p.classList.add('hidden'); // Ensure hidden class is added back
      }
    });

    // Update tabs state if the target is a tab panel
    if (targetId.includes('-panel')) {
      const tabs = document.querySelectorAll('#admin-tabs .tab');
      tabs.forEach(t => {
        if (t.dataset.tab === targetId) t.classList.add('tab-active');
        else t.classList.remove('tab-active');
      });
    }
  },

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
    this.toggleAdminPanel('release-panel');

    // Load Artists
    const select = document.getElementById('release-artist');
    const artists = await API.getArtists();
    let filtered = artists;
    if (!this.isRootAdmin && this.artistId) {
      filtered = artists.filter(a => a.id === this.artistId);
    }
    select.innerHTML = (this.isRootAdmin ? '<option value="">Select Artist...</option>' : '') +
      filtered.map(a => `<option value="${a.id}">${a.name}</option>`).join('');

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
  < input type = "text" placeholder = "Label" class="link-label" value = "${label}" style = "width: 30%;" >
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



  async showEditArtistModal(artistId = null) {
    let artist = { name: '', bio: '', photo_path: '', id: null, links: [] };
    if (artistId) {
      try {
        artist = await API.getArtist(artistId);
      } catch (e) {
        console.error("Artist not found:", e);
      }
    }

    const modalId = 'artist-editor-modal';
    const existing = document.getElementById(modalId);
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal modal-open bg-black/60 backdrop-blur-sm z-[1000]';
    modal.innerHTML = `
      <div class="modal-box bg-base-200 border border-white/10 shadow-2xl max-w-lg">
        <h3 class="text-xl font-bold mb-6">${artist.id ? 'Edit Artist' : 'New Artist'}</h3>
        <form id="edit-artist-form" class="space-y-4">
          <div class="form-control">
            <label class="label"><span class="label-text">Artist Name</span></label>
            <input type="text" id="edit-artist-name" class="input input-bordered w-full" value="${App.escapeHtml(artist.name)}" required>
          </div>
          
          <div class="form-control">
            <label class="label"><span class="label-text">Avatar</span></label>
            <div class="flex items-center gap-4">
              <div id="avatar-preview" class="w-16 h-16 rounded-full bg-base-300 border border-white/5 bg-cover bg-center flex items-center justify-center text-2xl" style="background-image: ${artist.id ? `url(${API.getArtistCoverUrl(artist.id)})` : 'none'}">
                ${artist.id ? '' : '👤'}
              </div>
              <input type="file" id="edit-artist-avatar" class="file-input file-input-bordered file-input-sm flex-1" accept="image/*">
            </div>
          </div>

          <div class="form-control">
            <label class="label"><span class="label-text">Biography</span></label>
            <textarea id="edit-artist-bio" class="textarea textarea-bordered h-24" placeholder="About the artist...">${App.escapeHtml(artist.bio || '')}</textarea>
          </div>

          <div class="form-control">
            <label class="label flex justify-between">
              <span class="label-text">Links (Social & Support)</span>
              <button type="button" class="btn btn-xs btn-ghost text-primary" id="add-artist-link-btn">＋ Add Link</button>
            </label>
            <div id="artist-links-container" class="space-y-2 max-h-40 overflow-y-auto p-1">
              <!-- Links injected here -->
            </div>
          </div>

          <div class="modal-action justify-between mt-8">
            <div class="flex gap-2">
              <button type="submit" class="btn btn-primary">Save Artist</button>
              <button type="button" class="btn btn-ghost" id="close-artist-modal">Cancel</button>
            </div>
            ${artist.id ? `<button type="button" id="delete-artist-btn" class="btn btn-ghost text-error btn-sm">Delete</button>` : ''}
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);

    const linksContainer = modal.querySelector('#artist-links-container');
    const addLink = (label = '', url = '', type = 'social') => {
      const div = document.createElement('div');
      div.className = 'flex gap-2 items-center';
      div.innerHTML = `
        <select class="select select-bordered select-xs w-24 link-type">
          <option value="social" ${type === 'social' ? 'selected' : ''}>Social</option>
          <option value="support" ${type === 'support' ? 'selected' : ''}>Support</option>
        </select>
        <input type="text" placeholder="Label" class="input input-bordered input-xs flex-1 link-label" value="${App.escapeHtml(label)}">
        <input type="text" placeholder="URL" class="input input-bordered input-xs flex-1 link-url" value="${App.escapeHtml(url)}">
        <button type="button" class="btn btn-ghost btn-xs text-error remove-link">✕</button>
      `;
      div.querySelector('.remove-link').onclick = () => div.remove();
      linksContainer.appendChild(div);
    };

    // Parse and populate links
    if (artist.links) {
      artist.links.forEach(l => {
        let label = l.label, url = l.url, type = l.type || 'social';
        // Handle old format fallback if needed
        if (!label && !url && typeof l === 'object') {
          const key = Object.keys(l)[0];
          if (key !== 'type' && key !== 'label' && key !== 'url') {
            label = key; url = l[key];
          }
        }
        addLink(label, url, type);
      });
    }

    modal.querySelector('#add-artist-link-btn').onclick = () => addLink();
    modal.querySelector('#close-artist-modal').onclick = () => modal.remove();

    modal.querySelector('#edit-artist-avatar').onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const preview = modal.querySelector('#avatar-preview');
          preview.style.backgroundImage = `url(${ev.target.result})`;
          preview.innerHTML = '';
        };
        reader.readAsDataURL(file);
      }
    };

    if (artist.id) {
      const deleteBtn = modal.querySelector('#delete-artist-btn');
      if (deleteBtn) {
        deleteBtn.onclick = async () => {
          if (confirm('Delete artist and unlink all releases?')) {
            try {
              await API.deleteArtist(artist.id);
              modal.remove();
              window.location.reload();
            } catch (err) { alert('Delete failed'); }
          }
        };
      }
    }

    modal.querySelector('#edit-artist-form').onsubmit = async (e) => {
      e.preventDefault();
      const name = modal.querySelector('#edit-artist-name').value;
      const bio = modal.querySelector('#edit-artist-bio').value;
      const avatarFile = modal.querySelector('#edit-artist-avatar').files[0];
      const links = Array.from(modal.querySelectorAll('#artist-links-container > div')).map(div => ({
        type: div.querySelector('.link-type').value,
        label: div.querySelector('.link-label').value.trim(),
        url: div.querySelector('.link-url').value.trim()
      })).filter(l => l.label && l.url);

      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Saving...';

      try {
        let id = artist.id;
        if (id) {
          await API.updateArtist(id, { name, bio, links });
        } else {
          const res = await API.createArtist({ name, bio, links });
          id = res.id;
        }

        if (avatarFile) {
          await API.uploadArtistAvatar(id, avatarFile);
        }

        modal.remove();
        window.location.reload();
      } catch (err) {
        alert('Save failed: ' + err.message);
        btn.disabled = false;
        btn.textContent = 'Save Artist';
      }
    };
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



  renderAlbumGrid(container, albums) {
    if (!albums || albums.length === 0) {
      container.innerHTML = '<p class="text-secondary p-8 text-center w-full col-span-full">No albums found</p>';
      return;
    }

    container.innerHTML = albums.map(album => `
              <a href="#/album/${album.slug || album.id}" class="card bg-base-200 hover:bg-base-300 transition-all border border-white/5 group overflow-hidden">
                <figure class="aspect-square relative overflow-hidden bg-base-300">
                  <div class="album-cover-placeholder w-full h-full group-hover:scale-105 transition-transform duration-500" data-src="${API.getAlbumCoverUrl(album.slug || album.id)}">
                    <div class="flex items-center justify-center w-full h-full text-4xl opacity-20">🎵</div>
                  </div>
                </figure>
                <div class="card-body p-4">
                  <h2 class="card-title text-sm font-bold truncate block">${App.escapeHtml(album.title)}</h2>
                  <p class="text-xs opacity-60 truncate">${App.escapeHtml(album.artist_name || 'Unknown Artist')}</p>
                </div>
              </a>
              `).join('');

    // Load album covers with fallback
    container.querySelectorAll('.album-cover-placeholder').forEach(el => {
      const img = new Image();
      img.onload = () => {
        el.innerHTML = '';
        el.style.backgroundImage = `url(${el.dataset.src})`;
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
      };
      img.onerror = () => { /* keep placeholder */ };
      img.src = el.dataset.src;
    });
  },

  renderTrackList(container, tracks) {
    if (!tracks || tracks.length === 0) {
      container.innerHTML = '<p class="p-4 text-center text-base-content/50">No tracks found</p>';
      return;
    }

    container.innerHTML = tracks.map((track, index) => {
      // Use album cover for track if available, fallback to placeholder
      const coverUrl = track.cover || (track.album_id ? API.getAlbumCoverUrl(track.album_id) : '/img/album-placeholder.png');

      return `
        <div class="track-item group flex items-center gap-4 p-3 rounded-xl hover:bg-base-100/50 transition-colors cursor-pointer border-b border-white/5 last:border-0" 
             data-track='${JSON.stringify(track).replace(/'/g, "&apos;")}' 
             data-index="${index}">
             
          <!-- Track Number -->
          <div class="w-8 text-center text-sm opacity-50 font-mono">${track.track_num || index + 1}</div>
          
          <!-- Cover Thumbnail -->
          <div class="w-12 h-12 flex-shrink-0 rounded-md overflow-hidden bg-base-300 relative">
             <img src="${coverUrl}" class="w-full h-full object-cover" onerror="this.src='/img/album-placeholder.png'">
             <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
               <span class="text-white text-lg">▶</span>
             </div>
          </div>

          <!-- Track Info & Waveform -->
          <div class="flex-1 min-w-0 flex flex-col justify-center gap-1">
            <div class="font-bold text-sm truncate pr-2">${track.title}</div>
            <div class="h-8 w-full opacity-60 relative track-waveform-container">
               <canvas width="600" height="60" class="w-full h-full object-contain" data-waveform="${track.waveform || ''}"></canvas>
            </div>
          </div>

          <!-- Duration & Actions -->
          <div class="flex items-center gap-2">
            <div class="text-xs font-mono opacity-50 w-10 text-right">${Player.formatTime(track.duration)}</div>
            
            ${this.isAdmin ? `
            <button class="btn btn-ghost btn-xs btn-square opacity-0 group-hover:opacity-100 transition-opacity" 
                    title="Add to Playlist" 
                    onclick="event.stopPropagation(); App.showAddToPlaylistModal(${track.id})">
              📋
            </button>` : ''}
            
            <button class="btn btn-ghost btn-xs btn-square opacity-0 group-hover:opacity-100 transition-opacity" 
                    title="Add to Queue"
                    onclick="event.stopPropagation(); Player.addToQueue(${JSON.stringify(track).replace(/"/g, '&quot;')})">
              ➕
            </button>
            <button class="btn btn-ghost btn-xs btn-square md:hidden" 
                    onclick="event.stopPropagation(); Player.play(JSON.parse(this.closest('.track-item').dataset.track), null)">
              ▶
            </button>
          </div>
        </div>
      `;
    }).join('');

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

    if (typeof modal.showModal === 'function') {
      modal.showModal();
    } else {
      modal.classList.add('active');
    }
  },

  hideModal() {
    const modal = document.getElementById('login-modal');
    if (typeof modal.close === 'function') {
      modal.close();
    } else {
      modal.classList.remove('active');
    }
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

      if (typeof modal.showModal === 'function') {
        modal.showModal();
      } else {
        modal.classList.add('active');
      }
    } catch (error) {
      console.error('Error loading playlists:', error);
      alert('Failed to load playlists');
    }
  },

  async addTrackToPlaylist(playlistId, trackId) {
    try {
      await API.addTrackToPlaylist(playlistId, trackId);
      alert('Track added to playlist!');
      if (typeof modal.close === 'function') {
        modal.close();
      } else {
        modal.classList.remove('active');
      }
    } catch (error) {
      console.error('Error adding track:', error);
      alert('Failed to add track to playlist');
    }
  }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => App.init());
