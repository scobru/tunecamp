/**
 * TuneCamp User Authentication Module
 * Uses GunDB's built-in user authentication system (username/password)
 */

const UserAuth = {
    gun: null,
    user: null,
    isReady: false,

    // GunDB peers for sync
    PEERS: [
        'https://shogun-relay.scobrudot.dev/gun',
        'https://gun.defucc.me/gun',
        'https://gun.o8.is/gun',
        'https://tunecamp.scobrudot.dev/gun'
    ],

    /**
     * Initialize GunDB and restore session
     */
    async init() {
        // Load Gun and SEA
        if (typeof Gun === 'undefined') {
            // Load Gun dynamically if not present
            await this.loadScript('https://cdn.jsdelivr.net/npm/gun/gun.js');
            await this.loadScript('https://cdn.jsdelivr.net/npm/gun/sea.js');
        }

        // Initialize Gun instance
        this.gun = Gun({
            peers: this.PEERS,
            localStorage: false,
            radisk: false
        });

        this.user = this.gun.user();

        // Recall session from localStorage
        this.user.recall({ sessionStorage: true });

        // Wait a bit for session recall
        await new Promise(resolve => setTimeout(resolve, 500));

        this.isReady = true;

        // Check if we have a restored session
        if (this.isLoggedIn()) {
            console.log('👤 Session restored:', this.getUsername());
            window.dispatchEvent(new CustomEvent('userauth:restored', {
                detail: this.getProfile()
            }));
        }

        return this.isLoggedIn();
    },

    /**
     * Load external script
     */
    loadScript(src) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    },

    /**
     * Check if user is logged in
     */
    isLoggedIn() {
        return this.user && this.user.is && this.user.is.pub;
    },

    /**
     * Get current user's public key
     */
    getPubKey() {
        return this.user?.is?.pub || null;
    },

    /**
     * Get current user's profile
     */
    getProfile() {
        if (!this.isLoggedIn()) return null;
        return {
            pubKey: this.user.is.pub,
            username: this.user.is.alias,
            epub: this.user.is.epub
        };
    },

    /**
     * Get username
     */
    getUsername() {
        return this.user?.is?.alias || 'Guest';
    },

    /**
     * Register a new user with username and password
     */
    register(username, password) {
        return new Promise((resolve, reject) => {
            if (!username || username.length < 3) {
                reject(new Error('Username must be at least 3 characters'));
                return;
            }
            if (!password || password.length < 6) {
                reject(new Error('Password must be at least 6 characters'));
                return;
            }

            this.user.create(username, password, (ack) => {
                if (ack.err) {
                    reject(new Error(ack.err));
                    return;
                }

                console.log('✅ User registered:', username);

                // Auto-login after registration
                this.login(username, password)
                    .then(resolve)
                    .catch(reject);
            });
        });
    },

    /**
     * Login with username and password
     */
    login(username, password) {
        return new Promise((resolve, reject) => {
            if (!username || !password) {
                reject(new Error('Username and password required'));
                return;
            }

            this.user.auth(username, password, (ack) => {
                if (ack.err) {
                    reject(new Error(ack.err));
                    return;
                }

                console.log('✅ Logged in as:', username);
                resolve(this.getProfile());
            });
        });
    },

    /**
     * Logout
     */
    logout() {
        this.user.leave();
        console.log('👋 User logged out');
    },

    // ==================
    // Comment Methods
    // ==================

    /**
     * Post a comment on a track
     */
    async postComment(trackId, text) {
        if (!this.isLoggedIn()) {
            throw new Error('Must be logged in to comment');
        }

        if (!text || text.trim().length === 0) {
            throw new Error('Comment cannot be empty');
        }

        const res = await fetch(`/api/comments/track/${trackId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pubKey: this.getPubKey(),
                username: this.getUsername(),
                text: text.trim()
            })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to post comment');
        }

        return res.json();
    },

    /**
     * Get comments for a track
     */
    async getComments(trackId) {
        const res = await fetch(`/api/comments/track/${trackId}`);
        if (!res.ok) {
            return [];
        }
        return res.json();
    },

    /**
     * Delete a comment (must be owner)
     */
    async deleteComment(commentId) {
        if (!this.isLoggedIn()) {
            throw new Error('Must be logged in');
        }

        const res = await fetch(`/api/comments/${commentId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pubKey: this.getPubKey()
            })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to delete comment');
        }

        return res.json();
    }
};

// Auto-initialize on load
document.addEventListener('DOMContentLoaded', () => {
    UserAuth.init().catch(err => {
        console.warn('UserAuth init error:', err);
    });
});
