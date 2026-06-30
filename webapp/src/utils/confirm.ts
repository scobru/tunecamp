import { useConfirmStore } from '../stores/useConfirmStore';

export interface ConfirmOptions {
  title?: string;
  confirmText?: string;
  cancelText?: string;
}

/**
 * Triggers a custom styled confirmation modal and returns a promise that
 * resolves to a boolean representing the user's choice (true for Accept, false for Cancel).
 */
export const confirm = (message: string, options?: ConfirmOptions): Promise<boolean> => {
  return useConfirmStore.getState().confirm(message, options);
};
