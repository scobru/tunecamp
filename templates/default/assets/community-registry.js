/**
 * Tunecamp Community Registry
 * Auto-registers Tunecamp sites to a global public GunDB registry
 * 
 * When a visitor loads any Tunecamp site, it automatically registers
 * the site in a decentralized community directory.
 */

(function () {
  'use strict';

  // Public GunDB peers for the community registry
  const REGISTRY_PEERS = [
    'https://gun.defucc.me/gun',
    'https://gun.o8.is/gun',
    'https://shogun-relay.scobrudot.dev/gun',
    'https://relay.peer.ooo/gun',
  ];

  const REGISTRY_ROOT = 'shogun';
  const REGISTRY_NAMESPACE = 'tunecamp-community';
  const REGISTRY_VERSION = '1.0';

  /**
   * TunecampCommunityRegistry
   * Handles auto-registration and discovery of Tunecamp sites
   */
  class TunecampCommunityRegistry {
    constructor() {
      this.gun = null;
      this.initialized = false;
      this.siteData = null;
    }

    /**
     * Initialize GunDB connection
     */
    async init() {
      if (typeof Gun === 'undefined') {
        console.warn('GunDB not loaded. Community registry disabled.');
        return false;
      }

      this.gun = Gun({
        peers: REGISTRY_PEERS,
        localStorage: true,
      });

      this.initialized = true;
      console.log('🌐 Tunecamp Community Registry initialized');
      return true;
    }

    /**
     * Generate a unique site ID from title + artist (content-based, not URL-based)
     * This prevents duplicates when the same site is deployed to multiple URLs (e.g., Vercel previews)
     */
    generateSiteId(siteInfo) {
      // Use title + artist as the unique identifier
      // This way the same site deployed to different URLs won't create duplicates
      const identifier = `${(siteInfo.title || 'untitled').toLowerCase().trim()}::${(siteInfo.artistName || 'unknown').toLowerCase().trim()}`;

      // Create a simple hash
      let hash = 0;
      for (let i = 0; i < identifier.length; i++) {
        const char = identifier.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return Math.abs(hash).toString(36);
    }

    /**
     * Register current site in the community registry
     * @param {Object} siteInfo - Site information
     * @param {string} siteInfo.url - Site URL
     * @param {string} siteInfo.title - Catalog/Artist title
     * @param {string} siteInfo.description - Site description
     * @param {string} siteInfo.artistName - Artist name (optional)
     * @param {string} siteInfo.coverImage - Cover image URL (optional)
     */
    async registerSite(siteInfo) {
      if (!this.initialized || !this.gun) {
        console.warn('Registry not initialized');
        return false;
      }

      const siteId = this.generateSiteId(siteInfo);
      const now = Date.now();

      // Check if already registered recently (within 24h)
      const lastRegistration = localStorage.getItem('tunecamp_registered');
      if (lastRegistration) {
        const lastTime = parseInt(lastRegistration, 10);
        if (now - lastTime < 24 * 60 * 60 * 1000) {
          // Already registered recently, just update lastSeen and currentPage
          const siteRef = this.gun
            .get(REGISTRY_ROOT)
            .get(REGISTRY_NAMESPACE)
            .get('sites')
            .get(siteId);

          siteRef.get('lastSeen').put(now);
          // Always update currentPage (even if null, to clear it when on homepage)
          siteRef.get('currentPage').put(siteInfo.currentPage || null);
          return true;
        }
      }

      const siteRecord = {
        id: siteId,
        url: siteInfo.url, // Always the homepage/base URL
        title: siteInfo.title || 'Untitled',
        description: siteInfo.description || '',
        artistName: siteInfo.artistName || '',
        coverImage: siteInfo.coverImage || '',
        registeredAt: now,
        lastSeen: now,
        version: REGISTRY_VERSION,
        // Optional: current page for "now playing" feature
        currentPage: siteInfo.currentPage || null,
      };

      return new Promise((resolve) => {
        this.gun
          .get(REGISTRY_ROOT)
          .get(REGISTRY_NAMESPACE)
          .get('sites')
          .get(siteId)
          .put(siteRecord, (ack) => {
            if (ack.err) {
              console.warn('Failed to register site:', ack.err);
              resolve(false);
            } else {
              localStorage.setItem('tunecamp_registered', now.toString());
              console.log('✅ Site registered in Tunecamp Community');
              resolve(true);
            }
          });

        // Timeout fallback
        setTimeout(() => resolve(true), 3000);
      });
    }

    /**
     * Get all registered sites
     * @param {function} callback - Called with array of sites
     */
    async getAllSites(callback) {
      if (!this.initialized || !this.gun) {
        callback([]);
        return;
      }

      const sites = [];
      const seenIds = new Set();

      this.gun
        .get(REGISTRY_ROOT)
        .get(REGISTRY_NAMESPACE)
        .get('sites')
        .map()
        .once((data, key) => {
          if (data && data.url && !seenIds.has(key)) {
            seenIds.add(key);
            sites.push({
              id: key,
              url: data.url,
              title: data.title || 'Untitled',
              description: data.description || '',
              artistName: data.artistName || '',
              coverImage: data.coverImage || '',
              registeredAt: data.registeredAt,
              lastSeen: data.lastSeen,
              currentPage: data.currentPage || null, // For "now playing" feature
            });
          }
        });

      // Give time to collect all sites
      setTimeout(() => {
        // Sort by lastSeen (most recent first)
        sites.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
        callback(sites);
      }, 2000);
    }

    /**
     * Subscribe to new sites (real-time)
     * @param {function} callback - Called when a new site is added
     */
    subscribeToSites(callback) {
      if (!this.initialized || !this.gun) {
        return () => { };
      }

      const ref = this.gun
        .get(REGISTRY_ROOT)
        .get(REGISTRY_NAMESPACE)
        .get('sites')
        .map()
        .on((data, key) => {
          if (data && data.url) {
            callback({
              id: key,
              url: data.url,
              title: data.title || 'Untitled',
              description: data.description || '',
              artistName: data.artistName || '',
              coverImage: data.coverImage || '',
              registeredAt: data.registeredAt,
              lastSeen: data.lastSeen,
              currentPage: data.currentPage || null, // For "now playing" feature
            });
          }
        });

      return () => ref.off();
    }

    /**
     * Format timestamp for display
     */
    formatDate(timestamp) {
      if (!timestamp) return 'Unknown';
      const date = new Date(timestamp);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    }

    /**
     * Get site count
     */
    async getSiteCount() {
      return new Promise((resolve) => {
        let count = 0;

        this.gun
          .get(REGISTRY_ROOT)
          .get(REGISTRY_NAMESPACE)
          .get('sites')
          .map()
          .once((data) => {
            if (data && data.url) count++;
          });

        setTimeout(() => resolve(count), 2000);
      });
    }

    /**
     * Register tracks for the centralized community player
     * @param {Object} siteInfo - Site information
     * @param {Array} tracks - Array of track objects from window.tracks
     * @param {string} releaseTitle - Title of the release/album
     * @param {string} coverUrl - Cover image URL for the release
     */
    async registerTracks(siteInfo, tracks, releaseTitle, coverUrl) {
      if (!this.initialized || !this.gun || !tracks || tracks.length === 0) {
        return false;
      }

      const siteId = this.generateSiteId(siteInfo);
      const baseUrl = siteInfo.url || window.location.origin;
      // Use current page URL as base for resolving relative track URLs
      // This ensures tracks/file.wav resolves to /releases/album/tracks/file.wav
      const currentPageUrl = window.location.href;
      const now = Date.now();

      // Build absolute URLs for tracks
      const tracksRef = this.gun
        .get(REGISTRY_ROOT)
        .get(REGISTRY_NAMESPACE)
        .get('sites')
        .get(siteId)
        .get('tracks');

      // Register each track
      for (const track of tracks) {
        // Generate track ID from title + release to avoid collisions
        const trackSlug = (releaseTitle + '-' + (track.title || 'untitled'))
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');

        // Make audio URL absolute using current page URL as base
        let audioUrl = track.url;
        if (audioUrl && !audioUrl.startsWith('http')) {
          // Use currentPageUrl as base so relative paths resolve correctly
          audioUrl = new URL(audioUrl, currentPageUrl).href;
        }

        // Make cover URL absolute using current page URL as base
        let absoluteCoverUrl = coverUrl;
        if (absoluteCoverUrl && !absoluteCoverUrl.startsWith('http')) {
          absoluteCoverUrl = new URL(absoluteCoverUrl, currentPageUrl).href;
        }

        const trackData = {
          title: track.title || 'Untitled',
          audioUrl: audioUrl,
          duration: track.duration || 0,
          releaseTitle: releaseTitle || 'Unknown Release',
          artistName: siteInfo.artistName || track.artist || '',
          coverUrl: absoluteCoverUrl || '',
          siteUrl: baseUrl,
          addedAt: now,
        };

        tracksRef.get(trackSlug).put(trackData);
      }

      console.log(`🎵 Registered ${tracks.length} tracks to community player`);
      return true;
    }

    /**
     * Get all tracks from all registered sites
     * @param {function} callback - Called with array of tracks
     */
    async getAllTracks(callback) {
      if (!this.initialized || !this.gun) {
        callback([]);
        return;
      }

      const allTracks = [];
      const seenTracks = new Set();

      // Get all sites first
      this.gun
        .get(REGISTRY_ROOT)
        .get(REGISTRY_NAMESPACE)
        .get('sites')
        .map()
        .once((siteData, siteId) => {
          if (siteData && siteData.url) {
            // For each site, get its tracks
            this.gun
              .get(REGISTRY_ROOT)
              .get(REGISTRY_NAMESPACE)
              .get('sites')
              .get(siteId)
              .get('tracks')
              .map()
              .once((trackData, trackId) => {
                if (trackData && trackData.audioUrl) {
                  const uniqueKey = `${siteId}:${trackId}`;
                  if (!seenTracks.has(uniqueKey)) {
                    seenTracks.add(uniqueKey);
                    allTracks.push({
                      id: trackId,
                      siteId: siteId,
                      ...trackData,
                    });
                  }
                }
              });
          }
        });

      // Give time to collect all tracks
      setTimeout(() => {
        // Sort by addedAt (most recent first)
        allTracks.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
        callback(allTracks);
      }, 3000);
    }

    /**
     * Subscribe to all tracks (real-time updates)
     * @param {function} callback - Called when tracks are updated
     */
    subscribeToTracks(callback) {
      if (!this.initialized || !this.gun) {
        return () => { };
      }

      const tracksMap = new Map();

      // Subscribe to all sites and their tracks
      this.gun
        .get(REGISTRY_ROOT)
        .get(REGISTRY_NAMESPACE)
        .get('sites')
        .map()
        .on((siteData, siteId) => {
          if (siteData && siteData.url) {
            this.gun
              .get(REGISTRY_ROOT)
              .get(REGISTRY_NAMESPACE)
              .get('sites')
              .get(siteId)
              .get('tracks')
              .map()
              .on((trackData, trackId) => {
                if (trackData && trackData.audioUrl) {
                  const uniqueKey = `${siteId}:${trackId}`;
                  tracksMap.set(uniqueKey, {
                    id: trackId,
                    siteId: siteId,
                    ...trackData,
                  });

                  // Convert to array and call callback
                  const allTracks = Array.from(tracksMap.values());
                  allTracks.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
                  callback(allTracks);
                }
              });
          }
        });

      return () => { };
    }
  }

  // Expose globally
  window.TunecampCommunityRegistry = TunecampCommunityRegistry;

  // Auto-register on page load if site data is available
  document.addEventListener('DOMContentLoaded', async function () {
    // Check if this is a Tunecamp site (has site metadata)
    const siteTitle = document.querySelector('meta[name="tunecamp-title"]')?.content ||
      document.querySelector('.site-title a')?.textContent ||
      document.title;

    const siteDescription = document.querySelector('meta[name="description"]')?.content || '';
    const artistName = document.querySelector('meta[name="tunecamp-artist"]')?.content ||
      document.querySelector('.release-artist')?.textContent?.replace('by ', '') || '';

    // Get cover image if available
    const coverImage = document.querySelector('meta[property="og:image"]')?.content ||
      document.querySelector('.release-cover-large img')?.src ||
      document.querySelector('.header-image')?.src || '';

    // Only register if we have a valid URL and it looks like a Tunecamp site
    const isTunecampSite = document.querySelector('.site-footer a[href*="tunecamp"]') ||
      document.querySelector('meta[name="generator"][content*="Tunecamp"]');

    if (isTunecampSite || window.TUNECAMP_SITE) {
      const registry = new TunecampCommunityRegistry();
      const initialized = await registry.init();

      if (initialized) {
        // Always use the homepage/base URL for the site registration
        const baseUrl = window.location.origin;

        // Only register sites served over HTTPS (production sites)
        // Skip local file:// and http:// URLs to avoid polluting the registry with dev/local sites
        if (!baseUrl.startsWith('https://')) {
          console.log('📍 Skipping community registration (not HTTPS - local/dev mode)');
          return;
        }

        // Check if this is an unlisted release (should not appear in registry)
        const isUnlisted = document.querySelector('meta[name="tunecamp-release-unlisted"]')?.content === 'true';

        // Get current page path for "now playing" feature (optional)
        // But skip if this is an unlisted release
        const currentPage = !isUnlisted && window.location.pathname !== '/' && window.location.pathname !== '/index.html'
          ? window.location.pathname
          : null;

        const siteInfo = {
          url: baseUrl, // Always homepage
          title: siteTitle,
          description: siteDescription,
          artistName: artistName,
          coverImage: coverImage,
          currentPage: currentPage, // Current page for "now playing" (null if unlisted)
        };

        await registry.registerSite(siteInfo);

        // If this is a release page with tracks, also register tracks for the community player
        // BUT: Skip if this release is unlisted (should not appear in community registry)
        const isUnlisted = document.querySelector('meta[name="tunecamp-release-unlisted"]')?.content === 'true';
        
        if (!isUnlisted && window.tracks && Array.isArray(window.tracks) && window.tracks.length > 0) {
          // Get release title from the page
          const releaseTitle = document.querySelector('.release-metadata h1')?.textContent ||
            document.querySelector('h1')?.textContent ||
            'Unknown Release';

          // Get release cover
          const releaseCover = document.querySelector('.release-cover-large img')?.src || coverImage;

          // Register tracks for the centralized player
          await registry.registerTracks(siteInfo, window.tracks, releaseTitle, releaseCover);
        } else if (isUnlisted) {
          console.log('📍 Skipping track registration - release is unlisted');
        }
      }

      // Make registry available globally
      window.tunecampRegistry = registry;
    }
  });
})();

