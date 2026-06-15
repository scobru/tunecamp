import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'tunecamp' | 'light' | 'grey' | 'nordic' | 'nordic-dark';

interface UIState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  sidebarCollapsed: boolean;
  toggleSidebarCollapsed: () => void;
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
      sidebarCollapsed: false,
      toggleSidebarCollapsed: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
    }),
    {
      name: 'tunecamp-ui-storage',
    }
  )
);

