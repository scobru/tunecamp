import { describe, test, expect, beforeEach } from 'vitest';
import { useUIStore } from '../useUIStore';

describe('useUIStore', () => {
    beforeEach(() => {
        // Reset the store state before each test
        useUIStore.setState({
            theme: 'tunecamp',
            sidebarOpen: true
        });
    });

    test('has correct default values', () => {
        const state = useUIStore.getState();
        expect(state.theme).toBe('tunecamp');
        expect(state.sidebarOpen).toBe(true);
    });

    test('sets the theme and updates the document attribute', () => {
        const state = useUIStore.getState();
        state.setTheme('nordic');

        expect(useUIStore.getState().theme).toBe('nordic');
        expect(document.documentElement.getAttribute('data-theme')).toBe('nordic');
    });

    test('toggles the sidebar', () => {
        const state = useUIStore.getState();
        state.toggleSidebar();

        expect(useUIStore.getState().sidebarOpen).toBe(false);

        useUIStore.getState().toggleSidebar();
        expect(useUIStore.getState().sidebarOpen).toBe(true);
    });
});
