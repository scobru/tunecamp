import { api, handleResponse, API_URL, downloadTokenCache, setDownloadTokenCache } from './client';
import type {
    Sample, SamplePack, CollabProject, CollabVersion, CollabStem, LiveSession
} from '../../types';
import API from './index';



export const mediaApi = {
    // --- Assets ---
    getPublicAssets: () => handleResponse(api.get<any[]>('assets')),
    getAdminAssets: () => handleResponse(api.get<any[]>('admin/assets')),
    getAssetBySlug: (slug: string) => handleResponse(api.get<any>(`assets/${slug}`)),
    createAsset: (formData: FormData) => handleResponse(api.post('admin/assets', formData, { headers: { 'Content-Type': 'multipart/form-data' } })),
    updateAsset: (id: number, formData: FormData) => handleResponse(api.put(`admin/assets/${id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })),
    uploadAssetCover: (id: number, formData: FormData) => handleResponse(api.post(`admin/assets/${id}/cover`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })),
    deleteAsset: (id: number) => handleResponse(api.delete(`admin/assets/${id}`)),
    /**
     * Returns the asset download URL with a short-lived download-only token
     * (`dt`) instead of the session JWT: leaked URLs expire in minutes and
     * grant nothing beyond downloads. The token is cached until shortly
     * before expiry. Anonymous users get a bare URL (free assets only).
     */
    getAssetDownloadUrl: async (id: string | number, inline = false) => {
        const url = `/api/payments/download/asset/${id}`;
        const params = new URLSearchParams();
        const dt = await API.getDownloadToken();
        if (dt) params.set('dt', dt);
        if (inline) params.set('inline', 'true');
        const queryString = params.toString();
        return queryString ? `${url}?${queryString}` : url;
    },
    getDownloadToken: async (): Promise<string | null> => {
        if (!API.getToken()) return null;
        const cached = downloadTokenCache;
        if (cached && cached.expiresAt - Date.now() > 30_000) return cached.token;
        try {
            const data = await handleResponse(api.post<{ token: string, expiresIn: number }>('payments/download-token'));
            setDownloadTokenCache({ token: data.token, expiresAt: Date.now() + data.expiresIn * 1000 });
            return data.token;
        } catch {
            return null;
        }
    },

    // --- Samples ---
    getSamples: (options: { mine?: boolean, q?: string } = {}) => {
        const params = new URLSearchParams();
        if (options.mine) params.set('mine', 'true');
        if (options.q) params.set('q', options.q);
        const qs = params.toString();
        return handleResponse(api.get<Sample[]>(`samples${qs ? `?${qs}` : ''}`));
    },
    getSample: (id: number) => handleResponse(api.get<Sample>(`samples/${id}`)),
    getPendingSamples: () => handleResponse(api.get<Sample[]>('samples/moderation/pending')),
    uploadSample: (file: File, fields: { title: string, description?: string, bpm?: string, musicalKey?: string, license?: string, attributionName?: string, tags?: string }) => {
        const formData = new FormData();
        formData.append('file', file);
        Object.entries(fields).forEach(([k, v]) => { if (v) formData.append(k, v); });
        return handleResponse(api.post<Sample>('samples', formData, { headers: { 'Content-Type': 'multipart/form-data' } }));
    },
    updateSample: (id: number, fields: Partial<{ title: string, description: string, bpm: string, musicalKey: string, license: string, attributionName: string, tags: string }>) =>
        handleResponse(api.put<Sample>(`samples/${id}`, fields)),
    deleteSample: (id: number) => handleResponse(api.delete(`samples/${id}`)),
    approveSample: (id: number, notes?: string) => handleResponse(api.post<Sample>(`samples/${id}/approve`, { notes })),
    rejectSample: (id: number, notes?: string) => handleResponse(api.post<Sample>(`samples/${id}/reject`, { notes })),
    getSampleDownloadUrl: (id: number) => {
        const url = `${API_URL}/samples/${id}/download`;
        const token = API.getToken();
        return token ? `${url}?token=${token}` : url;
    },
    getSampleWaveformUrl: (id: number) => `${API_URL}/samples/${id}/waveform`,

    // --- Sample Packs ---
    getSamplePacks: (options: { mine?: boolean, q?: string } = {}) => {
        const params = new URLSearchParams();
        if (options.mine) params.set('mine', 'true');
        if (options.q) params.set('q', options.q);
        const qs = params.toString();
        return handleResponse(api.get<SamplePack[]>(`sample-packs${qs ? `?${qs}` : ''}`));
    },
    getSamplePack: (id: number) => handleResponse(api.get<SamplePack>(`sample-packs/${id}`)),
    getPendingSamplePacks: () => handleResponse(api.get<SamplePack[]>('sample-packs/moderation/pending')),
    uploadSamplePack: (files: File[], fields: { title: string, description?: string, license?: string, attributionName?: string }) => {
        const formData = new FormData();
        files.forEach(f => formData.append('files', f));
        Object.entries(fields).forEach(([k, v]) => { if (v) formData.append(k, v); });
        return handleResponse(api.post<SamplePack>('sample-packs', formData, { headers: { 'Content-Type': 'multipart/form-data' } }));
    },
    updateSamplePack: (id: number, fields: Partial<{ title: string, description: string, license: string }>) =>
        handleResponse(api.put<SamplePack>(`sample-packs/${id}`, fields)),
    deleteSamplePack: (id: number) => handleResponse(api.delete(`sample-packs/${id}`)),
    getSamplePackCoverUrl: (id: number) => `${API_URL}/sample-packs/${id}/cover`,
    uploadSamplePackCover: (id: number, file: File) => {
        const formData = new FormData();
        formData.append('cover', file);
        return handleResponse(api.post<SamplePack>(`sample-packs/${id}/cover`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }));
    },
    approveSamplePack: (id: number, notes?: string) => handleResponse(api.post<SamplePack>(`sample-packs/${id}/approve`, { notes })),

    // --- Collab ---
    getCollabProjects: (options: { mine?: boolean } = {}) => {
        const params = new URLSearchParams();
        if (options.mine) params.set('mine', 'true');
        const qs = params.toString();
        return handleResponse(api.get<CollabProject[]>(`collab${qs ? `?${qs}` : ''}`));
    },
    getCollabProject: (id: number) => handleResponse(api.get<CollabProject>(`collab/${id}`)),
    createCollabProject: (fields: { title: string, description?: string }) =>
        handleResponse(api.post<CollabProject>('collab', fields)),
    deleteCollabProject: (id: number) => handleResponse(api.delete(`collab/${id}`)),
    saveCollabVersion: (id: number, state: string, note?: string) =>
        handleResponse(api.post<CollabVersion>(`collab/${id}/versions`, { state, note })),
    uploadCollabStem: (id: number, file: File, name?: string) => {
        const formData = new FormData();
        formData.append('file', file);
        if (name) formData.append('name', name);
        return handleResponse(api.post<CollabStem>(`collab/${id}/stems`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }));
    },
    deleteCollabStem: (projectId: number, stemId: number) => handleResponse(api.delete(`collab/${projectId}/stems/${stemId}`)),
    getCollabStemUrl: (projectId: number, stemId: number) => {
        const url = `${API_URL}/collab/${projectId}/stems/${stemId}/download`;
        const token = API.getToken();
        return token ? `${url}?token=${token}` : url;
    },
    rejectSamplePack: (id: number, notes?: string) => handleResponse(api.post<SamplePack>(`sample-packs/${id}/reject`, { notes })),

    // --- Live (P2P audio streaming) ---
    getLiveSessions: () => handleResponse(api.get<{ enabled: boolean, sessions: LiveSession[] }>('live/sessions')),
    startLive: (title: string, record = false) => handleResponse(api.post<LiveSession & { recording?: boolean }>('live/start', { title, record })),
    stopLive: (roomId?: string) => handleResponse(api.post<{ success: boolean }>('live/stop', { roomId })),
    ingestLive: (roomId: string, chunk: Blob) =>
        handleResponse(api.post<{ success: boolean }>(`live/${roomId}/ingest`, chunk, {
            headers: { 'Content-Type': 'application/octet-stream' }
        })),
    getLiveStreamUrl: (roomId: string) => `${API_URL}/live/${roomId}/hls/live.m3u8`,

    // --- Radio ---
    getRadioStatus: () => handleResponse(api.get<any>('radio')),
    startRadio: (config: { name: string; playlistId?: number; trackIds?: number[]; sources?: string[]; shuffle?: boolean }) =>
        handleResponse(api.post<any>('radio/start', config)),
    stopRadio: () => handleResponse(api.post<any>('radio/stop', {})),

};
