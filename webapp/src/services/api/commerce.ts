import { api, handleResponse } from './client';
import type {
    UnlockCode, DigStrategy, DigSearchResult, DigResult,
    DigSession, DigCrateItem, DigCrateInput, DigHistoryItem,
    LabAppRecord, Report
} from '../../types';



export const commerceApi = {
    // --- Unlock Codes / Purchases ---
    getPurchases: () => handleResponse(api.get<{ purchases: any[] }>('payments/purchases')),
    validateUnlockCode: (code: string) => handleResponse(api.post('unlock/validate', { code })),
    redeemUnlockCode: (code: string) => handleResponse(api.post('unlock/redeem', { code })),
    createUnlockCodes: (releaseId: string, count: number) => handleResponse(api.post<UnlockCode[]>('unlock/admin/create', { releaseId, count })),
    getUnlockCodes: (releaseId?: string) => {
        const query = releaseId ? `?releaseId=${releaseId}` : '';
        return handleResponse(api.get<UnlockCode[]>(`unlock/admin/list${query}`));
    },

    // --- Generic Download Provider ---
    searchProvider: (providerId: string, query: string) => handleResponse(api.get<any[]>(`search/content/provider/${providerId}?q=${encodeURIComponent(query)}`)),
    downloadFromProvider: (providerId: string, result: any) => handleResponse(api.post(`search/content/provider/${providerId}/download`, { result })),

    // --- Dig (crate-digging) ---
    digSearch: (q: string, source = 'bandcamp') =>
        handleResponse(api.get<DigSearchResult[]>(`dig/search?q=${encodeURIComponent(q)}&source=${source}`)),
    digRun: (releaseUrl: string, strategy: DigStrategy = 'balanced') =>
        handleResponse(api.post<DigResult>('dig/run', { releaseUrl, strategy })),
    digGetSessions: () => handleResponse(api.get<DigSession[]>('dig/sessions')),
    digCreateSession: (name: string) => handleResponse(api.post<DigSession>('dig/sessions', { name })),
    digDeleteSession: (id: number) => handleResponse(api.delete(`dig/sessions/${id}`)),
    digGetCrate: (sessionId: number) => handleResponse(api.get<DigCrateItem[]>(`dig/sessions/${sessionId}/crate`)),
    digAddToCrate: (sessionId: number, item: DigCrateInput) =>
        handleResponse(api.post<DigCrateItem>(`dig/sessions/${sessionId}/crate`, item)),
    digRemoveFromCrate: (sessionId: number, itemId: number) =>
        handleResponse(api.delete(`dig/sessions/${sessionId}/crate/${itemId}`)),
    digGetHistory: () => handleResponse(api.get<DigHistoryItem[]>('dig/history')),

    // --- Lab Apps ---
    getLabApps: () => handleResponse(api.get<LabAppRecord[]>('lab-apps')),
    getAdminLabApps: () => handleResponse(api.get<LabAppRecord[]>('admin/lab-apps/all')),
    createLabApp: (data: Partial<LabAppRecord>) => handleResponse(api.post<LabAppRecord>('admin/lab-apps', data)),
    updateLabApp: (id: number, data: Partial<LabAppRecord>) => handleResponse(api.put<LabAppRecord>(`admin/lab-apps/${id}`, data)),
    deleteLabApp: (id: number) => handleResponse(api.delete<{ success: boolean }>(`admin/lab-apps/${id}`)),
    // --- Release Reporting ---
    reportRelease: (releaseId: number | string, reason: string, details: string | null, name?: string | null, email?: string | null) =>
        handleResponse(api.post<{ success: boolean, reportId: number }>(`releases/${releaseId}/report`, { reason, details, name, email })),
    getReports: () => handleResponse<Report[]>(api.get('admin/reports')),
    deleteReport: (id: number) => handleResponse<{ success: boolean }>(api.delete(`admin/reports/${id}`)),
};
