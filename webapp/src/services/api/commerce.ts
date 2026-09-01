import { api, handleResponse } from './client';
import type {
    UnlockCode,
    Report
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

    // --- Release Reporting ---
    reportRelease: (releaseId: number | string, reason: string, details: string | null, name?: string | null, email?: string | null) =>
        handleResponse(api.post<{ success: boolean, reportId: number }>(`releases/${releaseId}/report`, { reason, details, name, email })),
    getReports: () => handleResponse<Report[]>(api.get('admin/reports')),
    deleteReport: (id: number) => handleResponse<{ success: boolean }>(api.delete(`admin/reports/${id}`)),
};
