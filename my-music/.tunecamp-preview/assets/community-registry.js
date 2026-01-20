/**
 * Tunecamp Community Registry
 * Auto-registers Tunecamp sites to a global public GunDB registry
 * 
 * When a visitor loads any Tunecamp site, it automatically registers
 * the site in a decentralized community directory.
 */

(function() {
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
          // Already registered recently, just update lastSeen
          this.gun
            .get(REGISTRY_ROOT)
            .get(REGISTRY_NAMESPACE)
            .get('sites')
            .get(siteId)
            .get('lastSeen')
            .put(now);
          return true;
        }
      }

      const siteRecord = {
        id: siteId,
        url: siteInfo.url,
        title: siteInfo.title || 'Untitled',
        description: siteInfo.description || '',
        artistName: siteInfo.artistName || '',
        coverImage: siteInfo.coverImage || '',
        registeredAt: now,
        lastSeen: now,
        version: REGISTRY_VERSION,
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
        return () => {};
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
  }

  // Expose globally
  window.TunecampCommunityRegistry = TunecampCommunityRegistry;

  // Auto-register on page load if site data is available
  document.addEventListener('DOMContentLoaded', async function() {
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
        await registry.registerSite({
          url: window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '/'),
          title: siteTitle,
          description: siteDescription,
          artistName: artistName,
          coverImage: coverImage,
        });
      }
      
      // Make registry available globally
      window.tunecampRegistry = registry;
    }
  });
})();
