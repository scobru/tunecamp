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

    async login(password) {
        const result = await this.post('/auth/login', { password });
        this.setToken(result.token);
        return result;
    },

    async setup(password) {
        const result = await this.post('/auth/setup', { password });
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

    getStreamUrl(id) {
        return '/api/tracks/' + id + '/stream';
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
    }
};
