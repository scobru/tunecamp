import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'tunecamp' | 'light' | 'grey' | 'nordic';

interface UIState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  sidebarOpen: boolean;
  toggleSidebar: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: 'tunecamp',
      setTheme: (theme) => {
        set({ theme });
        document.documentElement.setAttribute('data-theme', theme);
      },
      sidebarOpen: true,
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
    }),
    {
      name: 'tunecamp-ui-storage',
    }
  )
);

