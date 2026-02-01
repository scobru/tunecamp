// TuneCamp API Client

const API = {
    token: localStorage.getItem('tunecamp_token'),

    setToken(token) {
        this.token = token;
        if (token) {
            localStorage.setItem('tunecamp_token', token);
        } else {
            localStorage.removeItem('tunecamp_token');
        }
    },

    getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        if (this.token) {
            headers['Authorization'] = 'Bearer ' + this.token;
        }
        return headers;
    },

    async get(endpoint) {
        const res = await fetch('/api' + endpoint, {
            headers: this.getHeaders()
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },

    async post(endpoint, data) {
        const res = await fetch('/api' + endpoint, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },

    async put(endpoint, data) {
        const res = await fetch('/api' + endpoint, {
            method: 'PUT',
            headers: this.getHeaders(),
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },

    async delete(endpoint) {
        const res = await fetch('/api' + endpoint, {
            method: 'DELETE',
            headers: this.getHeaders()
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },

    // Auth
    async getAuthStatus() {
        return this.get('/auth/status');
    },

    async login(username, password) {
        // Handle legacy call login(password)
        if (!password && username) {
            password = username;
            username = 'admin';
        }
        const result = await this.post('/auth/login', { username, password });
        this.setToken(result.token);
        return result;
    },

    async setup(username, password) {
        const result = await this.post('/auth/setup', { username, password });
        this.setToken(result.token);
        return result;
    },

    async logout() {
        this.setToken(null);
    },

    // Catalog
    async getCatalog() {
        return this.get('/catalog');
    },

    async search(query) {
        return this.get('/catalog/search?q=' + encodeURIComponent(query));
    },

    async getSiteSettings() {
        return this.get('/catalog/settings');
    },

    async updateSettings(data) {
        return this.put('/admin/settings', data);
    },

    async getAdminSettings() {
        return this.get('/admin/settings');
    },

    // Albums (Library)
    async getAlbums() {
        return this.get('/albums');
    },

    async getAlbum(id) {
        return this.get('/albums/' + id);
    },

    getAlbumCoverUrl(id) {
        return '/api/albums/' + id + '/cover';
    },

    // Releases (Published)
    async getReleases() {
        return this.get('/albums/releases');
    },

    async promoteToRelease(id) {
        return this.post('/albums/' + id + '/promote', {});
    },

    // Artists
    async getArtists() {
        return this.get('/artists');
    },

    async createArtist(data) {
        return this.post('/artists', data);
    },

    async updateArtist(id, data) {
        return this.put('/artists/' + id, data);
    },

    async uploadArtistAvatar(artistId, file) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('artistId', artistId);
        const response = await fetch('/api/admin/upload/avatar', {
            method: 'POST',
            headers: this.token ? { 'Authorization': 'Bearer ' + this.token } : {},
            body: formData
        });
        if (!response.ok) throw new Error(await response.text());
        return response.json();
    },

    async getArtist(idOrSlug) {
        return this.get('/artists/' + idOrSlug);
    },

    getArtistCoverUrl(idOrSlug) {
        return '/api/artists/' + idOrSlug + '/cover';
    },

    // Tracks
    async getTracks() {
        return this.get('/tracks');
    },

    async getTrack(id) {
        return this.get('/tracks/' + id);
    },

    getStreamUrl(id, format) {
        let url = '/api/tracks/' + id + '/stream';
        if (format) url += '?format=' + format;
        return url;
    },

    async updateTrack(id, data) {
        return this.put('/tracks/' + id, data);
    },

    // Admin
    async getAdminReleases() {
        return this.get('/admin/releases');
    },

    async toggleVisibility(id, isPublic) {
        return this.put('/admin/releases/' + id + '/visibility', { isPublic });
    },

    async rescan() {
        return this.post('/admin/scan', {});
    },

    async consolidate() {
        return this.post('/admin/consolidate', {});
    },

    async getAdminStats() {
        return this.get('/admin/stats');
    },

    // Release Management
    async createRelease(data) {
        return this.post('/admin/releases', data);
    },

    async updateRelease(id, data) {
        return this.put('/admin/releases/' + id, data);
    },

    async deleteRelease(id, keepFiles = false) {
        return this.delete('/admin/releases/' + id + (keepFiles ? '?keepFiles=true' : ''));
    },

    async deleteTrack(id, deleteFile = false) {
        return this.delete('/tracks/' + id + (deleteFile ? '?deleteFile=true' : ''));
    },

    async deleteArtist(id) {
        return this.delete('/artists/' + id);
    },

    async getReleaseFolder(id) {
        return this.get('/admin/releases/' + id + '/folder');
    },

    async addTrackToRelease(releaseId, trackId) {
        return this.post('/admin/releases/' + releaseId + '/tracks/add', { trackId });
    },

    // Upload
    async uploadTracks(files, options = {}) {
        const formData = new FormData();
        if (options.releaseSlug) {
            formData.append('releaseSlug', options.releaseSlug);
            formData.append('type', 'release');
        }
        for (const file of files) {
            formData.append('files', file);
        }

        const res = await fetch('/api/admin/upload/tracks', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + this.token
            },
            body: formData
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },

    async uploadCover(file, releaseSlug) {
        const formData = new FormData();
        if (releaseSlug) {
            formData.append('releaseSlug', releaseSlug);
            formData.append('type', 'release');
        }
        formData.append('file', file);

        const res = await fetch('/api/admin/upload/cover', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + this.token
            },
            body: formData
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },

    async uploadBackgroundImage(file) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/admin/upload/background', {
            method: 'POST',
            headers: this.token ? { 'Authorization': 'Bearer ' + this.token } : {},
            body: formData
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },

    // Network / Community
    async getNetworkSites() {
        return this.get('/stats/network/sites');
    },

    async getNetworkTracks() {
        return this.get('/stats/network/tracks');
    },

    // Identity Management
    async getIdentity() {
        return this.get('/admin/system/identity');
    },

    async getArtistIdentity(artistId) {
        return this.get('/admin/artists/' + artistId + '/identity');
    },

    async importIdentity(pair) {
        return this.post('/admin/system/identity', pair);
    },

    // User Management
    async getCurrentAdmin() {
        return this.get('/admin/system/me');
    },

    async getAdmins() {
        return this.get('/admin/system/users');
    },

    async createAdmin(username, password, artistId = null) {
        return this.post('/admin/system/users', { username, password, artistId });
    },

    async updateAdmin(id, data) {
        return this.put('/admin/system/users/' + id, data);
    },

    async deleteAdmin(id) {
        return this.delete('/admin/system/users/' + id);
    },

    async resetAdminPassword(id, password) {
        return this.put('/admin/system/users/' + id + '/password', { password });
    },

    // Library Statistics
    async recordPlay(trackId) {
        return this.post('/stats/library/play/' + trackId, {});
    },

    async getRecentPlays(limit = 50) {
        return this.get('/stats/library/recent?limit=' + limit);
    },

    async getTopTracks(limit = 20, days = 30) {
        return this.get('/stats/library/top-tracks?limit=' + limit + '&days=' + days);
    },

    async getTopArtists(limit = 10, days = 30) {
        return this.get('/stats/library/top-artists?limit=' + limit + '&days=' + days);
    },

    async getListeningStats() {
        return this.get('/stats/library/overview');
    },

    // Browser
    async getBrowser(path = '') {
        return this.get('/browser?path=' + encodeURIComponent(path));
    },

    // Lyrics
    async getLyrics(trackId) {
        return this.get('/tracks/' + trackId + '/lyrics');
    },

    // Metadata
    async searchMetadata(query) {
        return this.get('/metadata/search?q=' + encodeURIComponent(query));
    },

    async updatePlaylist(id, data) {
        return this.put('/playlists/' + id, data);
    },

    async getPlaylists() {
        return this.get('/playlists');
    },

    async createPlaylist(name, description) {
        return this.post('/playlists', { name, description });
    },

    async getPlaylist(id) {
        return this.get('/playlists/' + id);
    },

    async deletePlaylist(id) {
        return this.delete('/playlists/' + id);
    },

    async addTrackToPlaylist(playlistId, trackId) {
        return this.post(`/playlists/${playlistId}/tracks`, { trackId });
    },

    async removeTrackFromPlaylist(playlistId, trackId) {
        return this.delete(`/playlists/${playlistId}/tracks/${trackId}`);
    },

    // Unlock Codes
    async validateUnlockCode(code) {
        return this.post('/unlock/validate', { code });
    },

    async redeemUnlockCode(code) {
        return this.post('/unlock/redeem', { code });
    },

    async createUnlockCodes(releaseId, count) {
        return this.post('/unlock/admin/create', { releaseId, count });
    },

    async getUnlockCodes(releaseId) {
        return this.get('/unlock/admin/list' + (releaseId ? '?releaseId=' + releaseId : ''));
    },

    // Posts (ActivityPub)
    async getArtistPosts(idOrSlug) {
        return this.get('/artists/' + idOrSlug + '/posts');
    },

    async getPostBySlug(slug) {
        return this.get('/posts/' + slug);
    },

    async createPost(artistId, content) {
        return this.post('/admin/posts', { artistId, content });
    },

    async deletePost(id) {
        return this.delete('/admin/posts/' + id);
    }
};
