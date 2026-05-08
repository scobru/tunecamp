import { create } from 'zustand';
import API from '../services/api';

interface HealthStatus {
  soulseek: { connected: boolean; username: string | null; error?: string };
  itunes: { online: boolean };
  musicbrainz: { online: boolean };
  discogs: { configured: boolean };
  telegram: { active: boolean };
  openrouter: { configured: boolean; model: string };
  stripe: { configured: boolean; webhookConfigured: boolean };
  moonpay: { configured: boolean };
}

interface ConfigStore {
  status: HealthStatus | null;
  isLoading: boolean;
  fetchStatus: () => Promise<void>;
  isConfigured: (service: keyof HealthStatus) => boolean;
}

export const useConfigStore = create<ConfigStore>((set, get) => ({
  status: null,
  isLoading: false,
  fetchStatus: async () => {
    set({ isLoading: true });
    try {
      const data = await API.getAPIHealth();
      set({ status: data });
    } catch (e) {
      console.error("Failed to fetch health status", e);
    } finally {
      set({ isLoading: false });
    }
  },
  isConfigured: (service: keyof HealthStatus) => {
    const status = get().status;
    if (!status) return false;
    const s = status[service] as any;
    return !!(s.configured || s.active || s.connected || s.online);
  }
}));
