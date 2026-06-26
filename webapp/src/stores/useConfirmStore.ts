import { create } from 'zustand';

export interface ConfirmOptions {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
}

interface ConfirmState {
  isOpen: boolean;
  message: string;
  options: ConfirmOptions;
  resolve: ((value: boolean) => void) | null;
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
  accept: () => void;
  cancel: () => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  isOpen: false,
  message: '',
  options: {},
  resolve: null,
  confirm: (message, options = {}) => {
    return new Promise((resolve) => {
      set({
        isOpen: true,
        message,
        options,
        resolve,
      });
    });
  },
  accept: () => {
    const { resolve } = get();
    if (resolve) resolve(true);
    set({ isOpen: false, resolve: null });
  },
  cancel: () => {
    const { resolve } = get();
    if (resolve) resolve(false);
    set({ isOpen: false, resolve: null });
  },
}));
