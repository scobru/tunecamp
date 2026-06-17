import { create } from 'zustand';
import API from '../services/api';

export type ModuleFlag = 'hideLive' | 'hideStore' | 'hideSocial' | 'hideNetwork' | 'hideDig';

interface SiteSettingsStore {
  /** null until the first fetch resolves; route guards show a spinner meanwhile. */
  flags: Record<ModuleFlag, boolean> | null;
  isLoading: boolean;
  fetchFlags: () => Promise<void>;
  isModuleHidden: (flag: ModuleFlag) => boolean;
}

const truthy = (v: unknown) => v === true || v === 'true';

/**
 * Caches the public "Customize Modules" toggles so route guards can decide
 * whether a section is reachable. Hiding a module must not depend only on the
 * sidebar omitting its link — otherwise typing the URL still loads the page.
 */
export const useSiteSettingsStore = create<SiteSettingsStore>((set, get) => ({
  flags: null,
  isLoading: false,
  fetchFlags: async () => {
    if (get().isLoading) return;
    set({ isLoading: true });
    try {
      const s = await API.getSiteSettings();
      set({
        flags: {
          hideLive: truthy(s.hideLive),
          hideStore: truthy(s.hideStore),
          hideSocial: truthy(s.hideSocial),
          hideNetwork: truthy(s.hideNetwork),
          hideDig: truthy(s.hideDig),
        },
      });
    } catch (e) {
      console.error('Failed to fetch site settings', e);
    } finally {
      set({ isLoading: false });
    }
  },
  isModuleHidden: (flag) => {
    const f = get().flags;
    return f ? f[flag] : false;
  },
}));
