/**
 * Tunecamp Unlock Codes - GunDB Client
 * Decentralized unlock code validation using GunDB public peers
 * 
 * Usage for beginners:
 * 1. Include GunDB: <script src="https://cdn.jsdelivr.net/npm/gun/gun.js"></script>
 * 2. Include this script
 * 3. Initialize: const unlockCodes = new TunecampUnlockCodes();
 * 4. Validate: unlockCodes.validateCode(releaseSlug, userCode).then(valid => {...})
 * 
 * For private space (with keypair):
 * const unlockCodes = new TunecampUnlockCodes({ 
 *   publicKey: 'artist-public-key-here' 
 * });
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
   * TunecampUnlockCodes class
   * Handles code validation and redemption via GunDB
   */
  class TunecampUnlockCodes {
    /**
     * Initialize the unlock codes system
     * @param {Object} options - Configuration options
     * @param {Array} options.peers - GunDB peer URLs (default: public peers)
     * @param {string} options.namespace - GunDB namespace (default: 'tunecamp')
     * @param {string} options.publicKey - Artist's public key (for reading from private space)
     */
    constructor(options = {}) {
      this.peers = options.peers || DEFAULT_PEERS;
      this.namespace = options.namespace || 'tunecamp';
      this.publicKey = options.publicKey || null; // Artist's public key for private space
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
        console.warn('GunDB not loaded. Please include gun.js before unlock-codes.js');
        return;
      }

      // Initialize Gun with peers
      this.gun = Gun({
        peers: this.peers,
        localStorage: true, // Use localStorage for offline caching
      });

      this.initialized = true;
      const spaceType = this.publicKey ? 'private (artist space)' : 'public';
      console.log(`🔐 Tunecamp Unlock Codes initialized (${spaceType})`);
    }

    /**
     * Get the root node for code storage
     * If publicKey is set, reads from artist's user space
     * Otherwise reads from public space
     */
    getCodesRoot() {
      if (this.publicKey) {
        // Read from artist's private/user space using their public key
        return this.gun.user(this.publicKey).get(this.namespace);
      }
      // Read from public space
      return this.gun.get(this.namespace);
    }

    /**
     * Wait for Gun to be ready
     */
    async waitForInit() {
      if (this.initialized) return;
      
      return new Promise((resolve) => {
        const check = () => {
          if (this.initialized) {
            resolve();
          } else {
            setTimeout(check, 100);
          }
        };
        check();
      });
    }

    /**
     * Hash a code for secure storage
     * @param {string} code - The unlock code
     * @returns {string} Hashed code
     */
    async hashCode(code) {
      const encoder = new TextEncoder();
      const data = encoder.encode(code.toLowerCase().trim());
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Validate an unlock code
     * @param {string} releaseSlug - The release identifier
     * @param {string} code - The unlock code entered by user
     * @returns {Promise<Object>} Validation result
     */
    async validateCode(releaseSlug, code) {
      await this.waitForInit();

      if (!this.gun) {
        return { valid: false, error: 'GunDB not initialized' };
      }

      const codeHash = await this.hashCode(code);

      return new Promise((resolve) => {
        this.getCodesRoot()
          .get('releases')
          .get(releaseSlug)
          .get('codes')
          .get(codeHash)
          .once((data) => {
            if (!data) {
              resolve({ valid: false, error: 'Invalid code' });
              return;
            }

            if (data.used) {
              resolve({ valid: false, error: 'Code already used' });
              return;
            }

            resolve({ 
              valid: true, 
              data: {
                maxDownloads: data.maxDownloads || 1,
                currentDownloads: data.downloads || 0,
                expiresAt: data.expiresAt,
              }
            });
          });
      });
    }

    /**
     * Redeem a code (mark as used)
     * @param {string} releaseSlug - The release identifier
     * @param {string} code - The unlock code
     * @returns {Promise<Object>} Redemption result
     */
    async redeemCode(releaseSlug, code) {
      await this.waitForInit();

      if (!this.gun) {
        return { success: false, error: 'GunDB not initialized' };
      }

      const codeHash = await this.hashCode(code);

      return new Promise((resolve) => {
        const codeRef = this.getCodesRoot()
          .get('releases')
          .get(releaseSlug)
          .get('codes')
          .get(codeHash);

        codeRef.once((data) => {
          if (!data) {
            resolve({ success: false, error: 'Invalid code' });
            return;
          }

          if (data.used) {
            resolve({ success: false, error: 'Code already used' });
            return;
          }

          // Check max downloads
          const downloads = (data.downloads || 0) + 1;
          const maxDownloads = data.maxDownloads || 1;
          const used = downloads >= maxDownloads;

          // Update the code (note: this only works if codes are in public space
          // or if artist has write access - for private space, updates won't persist)
          codeRef.put({
            ...data,
            downloads,
            used,
            lastUsedAt: Date.now(),
          });

          resolve({ 
            success: true, 
            downloadsRemaining: maxDownloads - downloads 
          });
        });
      });
    }

    /**
     * Get release info (for artists to check their codes)
     * @param {string} releaseSlug - The release identifier
     */
    async getReleaseInfo(releaseSlug) {
      await this.waitForInit();

      return new Promise((resolve) => {
        const codes = [];
        
        this.getCodesRoot()
          .get('releases')
          .get(releaseSlug)
          .get('codes')
          .map()
          .once((data, key) => {
            if (data) {
              codes.push({ hash: key, ...data });
            }
          });

        // Give it some time to collect all codes
        setTimeout(() => {
          resolve(codes);
        }, 1000);
      });
    }

    /**
     * Check if using private space (artist's user space)
     * @returns {boolean} True if using private space
     */
    isPrivateSpace() {
      return !!this.publicKey;
    }
  }

  // Expose globally
  window.TunecampUnlockCodes = TunecampUnlockCodes;
})();
