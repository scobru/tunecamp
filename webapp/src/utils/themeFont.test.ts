import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { applyThemeFont } from './themeFont.ts';

describe('applyThemeFont', () => {
    beforeEach(() => {
        // Clear out head and inline styles before each test
        document.head.innerHTML = '';
        document.documentElement.style.cssText = '';
    });

    afterEach(() => {
        document.head.innerHTML = '';
        document.documentElement.style.cssText = '';
    });

    it('should fallback to "Outfit" when font is null, undefined, or empty', () => {
        applyThemeFont(null);
        expect(document.documentElement.style.getPropertyValue('--font-family')).toBe('');
        expect(document.documentElement.style.getPropertyValue('--font-sans')).toBe('"Outfit", sans-serif');

        applyThemeFont(undefined);
        expect(document.documentElement.style.getPropertyValue('--font-family')).toBe('');
        expect(document.documentElement.style.getPropertyValue('--font-sans')).toBe('"Outfit", sans-serif');

        applyThemeFont('');
        expect(document.documentElement.style.getPropertyValue('--font-family')).toBe('');
        expect(document.documentElement.style.getPropertyValue('--font-sans')).toBe('"Outfit", sans-serif');

        // Ensure no link tag was added since Outfit is a STATIC_FONT
        expect(document.getElementById('dynamic-google-font')).toBeNull();
    });

    it('should set font but not create link for static fonts', () => {
        applyThemeFont('JetBrains Mono');

        expect(document.documentElement.style.getPropertyValue('--font-family')).toBe('JetBrains Mono');
        expect(document.documentElement.style.getPropertyValue('--font-sans')).toBe('"JetBrains Mono", sans-serif');
        expect(document.getElementById('dynamic-google-font')).toBeNull();
    });

    it('should create link tag with correct URL for dynamic fonts', () => {
        applyThemeFont('Roboto');

        expect(document.documentElement.style.getPropertyValue('--font-family')).toBe('Roboto');
        expect(document.documentElement.style.getPropertyValue('--font-sans')).toBe('"Roboto", sans-serif');

        const linkTag = document.getElementById('dynamic-google-font') as HTMLLinkElement;
        expect(linkTag).not.toBeNull();
        expect(linkTag.tagName).toBe('LINK');
        expect(linkTag.rel).toBe('stylesheet');
        expect(linkTag.href).toBe('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;600;700&display=swap');
    });

    it('should correctly format dynamic fonts with spaces in the query string', () => {
        applyThemeFont('Open Sans');

        expect(document.documentElement.style.getPropertyValue('--font-family')).toBe('Open Sans');
        expect(document.documentElement.style.getPropertyValue('--font-sans')).toBe('"Open Sans", sans-serif');

        const linkTag = document.getElementById('dynamic-google-font') as HTMLLinkElement;
        expect(linkTag).not.toBeNull();
        expect(linkTag.href).toBe('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700&display=swap');
    });

    it('should reuse existing link tag for subsequent dynamic fonts', () => {
        applyThemeFont('Roboto');
        applyThemeFont('Open Sans');

        const linkTags = document.head.querySelectorAll('#dynamic-google-font');
        expect(linkTags.length).toBe(1); // Only one tag should exist

        const linkTag = linkTags[0] as HTMLLinkElement;
        expect(linkTag.href).toBe('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700&display=swap');
    });
});
