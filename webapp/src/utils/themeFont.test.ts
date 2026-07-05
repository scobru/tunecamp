import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { applyThemeFont } from './themeFont';

describe('applyThemeFont', () => {
    beforeEach(() => {
        // Clear DOM and styles before each test
        document.documentElement.style.cssText = '';
        document.head.innerHTML = '';
    });

    afterEach(() => {
        // Cleanup
        document.documentElement.style.cssText = '';
        document.head.innerHTML = '';
    });

    it('removes --font-family and uses fallback Outfit for null/undefined font', () => {
        // Set an initial value to verify it gets removed
        document.documentElement.style.setProperty('--font-family', 'OldFont');

        applyThemeFont(null);

        // Verify --font-family was removed
        expect(document.documentElement.style.getPropertyValue('--font-family')).toBe('');
        // Verify fallback font is set for --font-sans
        expect(document.documentElement.style.getPropertyValue('--font-sans')).toBe('"Outfit", sans-serif');

        // Outfit is a static font, so no link element should be added
        const linkElement = document.getElementById('dynamic-google-font');
        expect(linkElement).toBeNull();
    });

    it('sets variables but does not create a link tag for static fonts', () => {
        applyThemeFont('JetBrains Mono');

        // Verify custom properties
        expect(document.documentElement.style.getPropertyValue('--font-family')).toBe('JetBrains Mono');
        expect(document.documentElement.style.getPropertyValue('--font-sans')).toBe('"JetBrains Mono", sans-serif');

        // Verify no link tag created
        const linkElement = document.getElementById('dynamic-google-font');
        expect(linkElement).toBeNull();
    });

    it('creates a link tag and formats URL correctly for dynamic fonts with spaces', () => {
        applyThemeFont('Playfair Display');

        // Verify custom properties
        expect(document.documentElement.style.getPropertyValue('--font-family')).toBe('Playfair Display');
        expect(document.documentElement.style.getPropertyValue('--font-sans')).toBe('"Playfair Display", sans-serif');

        // Verify link tag creation and href formatting
        const linkElement = document.getElementById('dynamic-google-font') as HTMLLinkElement;
        expect(linkElement).not.toBeNull();
        expect(linkElement.tagName).toBe('LINK');
        expect(linkElement.rel).toBe('stylesheet');

        // Spaces should be replaced by +
        expect(linkElement.href).toContain('family=Playfair+Display:wght@400;500;600;700&display=swap');
    });

    it('reuses existing link tag for subsequent dynamic font calls', () => {
        applyThemeFont('Montserrat');

        const firstCallLinks = document.querySelectorAll('#dynamic-google-font');
        expect(firstCallLinks.length).toBe(1);

        applyThemeFont('Roboto');

        const secondCallLinks = document.querySelectorAll('#dynamic-google-font');
        // Still only 1 link element
        expect(secondCallLinks.length).toBe(1);

        const linkElement = document.getElementById('dynamic-google-font') as HTMLLinkElement;
        // The href should be updated to the new font
        expect(linkElement.href).toContain('family=Roboto:wght@400;500;600;700&display=swap');
    });

    it('handles undefined by removing --font-family', () => {
        document.documentElement.style.setProperty('--font-family', 'OldFont');
        applyThemeFont(undefined);
        expect(document.documentElement.style.getPropertyValue('--font-family')).toBe('');
    });

    it('handles empty string by removing --font-family', () => {
        document.documentElement.style.setProperty('--font-family', 'OldFont');
        applyThemeFont('');
        expect(document.documentElement.style.getPropertyValue('--font-family')).toBe('');
    });
});
