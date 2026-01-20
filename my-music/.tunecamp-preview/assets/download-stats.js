/**
 * Tunecamp Download Stats - GunDB Client
 * Decentralized download counter using GunDB public peers
 * 
 * Uses a public GunDB space to track and display download counts.
 * No authentication required - anyone can read/increment counts.
 */

(function() {
  'use strict';

  // Default public GunDB peers
  const DEFAULT_PEERS = [
    'https://gun.defucc.me/gun',
    'https://gun.o8.is/gun',
    'https://shogun-relay.scobrudot.dev/gun',
    'https://relay.peer.ooo/gun',
  ];

  /**
   * TunecampDownloadStats class
   * Tracks download counts via GunDB
   */
  class TunecampDownloadStats {
    /**
     * Initialize the download stats system
     * @param {Object} options - Configuration options
     * @param {Array} options.peers - GunDB peer URLs (default: public peers)
     * @param {string} options.namespace - GunDB namespace (default: 'tunecamp-stats')
     */
    constructor(options = {}) {
      this.peers = options.peers || DEFAULT_PEERS;
      this.root = options.root || 'shogun';
      this.namespace = options.namespace || 'tunecamp-stats';
      this.gun = null;
      this.initialized = false;
      
      // Initialize GunDB when script loads
      this.init();
    }

    /**
     * Initialize GunDB connection
     */
    async init() {
      // Check if Gun is available
      if (typeof Gun === 'undefined') {
        console.warn('GunDB not loaded. Download stats disabled.');
        return;
      }

      // Initialize Gun with peers
      this.gun = Gun({
        peers: this.peers,
        localStorage: true,
      });

      this.initialized = true;
      console.log('📊 Tunecamp Download Stats initialized');
    }

    /**
     * Wait for Gun to be ready
     */
    async waitForInit() {
      if (this.initialized) return;
      
      return new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds max
        
        const check = () => {
          if (this.initialized) {
            resolve();
          } else if (attempts >= maxAttempts) {
            reject(new Error('GunDB initialization timeout'));
          } else {
            attempts++;
            setTimeout(check, 100);
          }
        };
        check();
      });
    }

    /**
     * Get download count for a release
     * @param {string} releaseSlug - The release identifier
     * @returns {Promise<number>} Download count
     */
    async getDownloadCount(releaseSlug) {
      try {
        await this.waitForInit();
      } catch (e) {
        return 0;
      }

      if (!this.gun) return 0;

      return new Promise((resolve) => {
        this.gun
          .get(this.root).get(this.namespace)
          .get('releases')
          .get(releaseSlug)
          .get('downloads')
          .once((data) => {
            resolve(data ? parseInt(data, 10) || 0 : 0);
          });

        // Timeout fallback
        setTimeout(() => resolve(0), 3000);
      });
    }

    /**
     * Get download count for a specific track
     * @param {string} releaseSlug - The release identifier
     * @param {string} trackId - The track identifier (filename or index)
     * @returns {Promise<number>} Download count
     */
    async getTrackDownloadCount(releaseSlug, trackId) {
      try {
        await this.waitForInit();
      } catch (e) {
        return 0;
      }

      if (!this.gun) return 0;

      return new Promise((resolve) => {
        this.gun
          .get(this.root).get(this.namespace)
          .get('releases')
          .get(releaseSlug)
          .get('tracks')
          .get(trackId)
          .get('downloads')
          .once((data) => {
            resolve(data ? parseInt(data, 10) || 0 : 0);
          });

        // Timeout fallback
        setTimeout(() => resolve(0), 3000);
      });
    }

    /**
     * Increment download count for a release
     * @param {string} releaseSlug - The release identifier
     * @returns {Promise<number>} New download count
     */
    async incrementDownloadCount(releaseSlug) {
      try {
        await this.waitForInit();
      } catch (e) {
        return 0;
      }

      if (!this.gun) return 0;

      const currentCount = await this.getDownloadCount(releaseSlug);
      const newCount = currentCount + 1;

      return new Promise((resolve) => {
        this.gun
          .get(this.root).get(this.namespace)
          .get('releases')
          .get(releaseSlug)
          .get('downloads')
          .put(newCount, (ack) => {
            if (ack.err) {
              console.error('Error incrementing download count:', ack.err);
              resolve(currentCount);
            } else {
              resolve(newCount);
            }
          });

        // Timeout fallback
        setTimeout(() => resolve(newCount), 2000);
      });
    }

    /**
     * Increment download count for a specific track
     * @param {string} releaseSlug - The release identifier
     * @param {string} trackId - The track identifier
     * @returns {Promise<number>} New download count
     */
    async incrementTrackDownloadCount(releaseSlug, trackId) {
      try {
        await this.waitForInit();
      } catch (e) {
        return 0;
      }

      if (!this.gun) return 0;

      const currentCount = await this.getTrackDownloadCount(releaseSlug, trackId);
      const newCount = currentCount + 1;

      return new Promise((resolve) => {
        this.gun
          .get(this.root).get(this.namespace)
          .get('releases')
          .get(releaseSlug)
          .get('tracks')
          .get(trackId)
          .get('downloads')
          .put(newCount, (ack) => {
            if (ack.err) {
              console.error('Error incrementing track download count:', ack.err);
              resolve(currentCount);
            } else {
              resolve(newCount);
            }
          });

        // Timeout fallback
        setTimeout(() => resolve(newCount), 2000);
      });
    }

    /**
     * Subscribe to download count changes (real-time updates)
     * @param {string} releaseSlug - The release identifier
     * @param {function} callback - Called with new count on each update
     */
    subscribeToDownloadCount(releaseSlug, callback) {
      if (!this.gun) {
        callback(0);
        return () => {};
      }

      const ref = this.gun
        .get(this.root).get(this.namespace)
        .get('releases')
        .get(releaseSlug)
        .get('downloads');

      ref.on((data) => {
        callback(data ? parseInt(data, 10) || 0 : 0);
      });

      // Return unsubscribe function
      return () => ref.off();
    }

    /**
     * Format download count for display
     * @param {number} count - Download count
     * @returns {string} Formatted string (e.g., "1.2K", "3.5M")
     */
    formatCount(count) {
      if (count < 1000) return count.toString();
      if (count < 1000000) return (count / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
      return (count / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    }
  }

  // Expose globally
  window.TunecampDownloadStats = TunecampDownloadStats;
})();
