import { StringUtils } from './stringUtils.js';

/**
 * Audio file utilities
 */

/**
 * Converts text to a URL-safe slug
 */
export function slugify(text: string): string {
  if (!text) return '';
  return StringUtils.slugify(text);
}

/**
 * Sanitizes a filename by keeping only safe characters
 */
export function sanitizeFilename(filename: string): string {
  if (!filename) return '';
  return StringUtils.sanitizeFilename(filename);
}



/**
 * Validates username format
 * Returns { valid: boolean, error?: string }
 */
export function validateUsername(username: string): { valid: boolean; error?: string } {
  if (!username) {
    return { valid: false, error: 'Username is required' };
  }
  const result = StringUtils.validateUsername(username);

  if (result.ok) {
    return { valid: true };
  } else {
    return { valid: false, error: result.error };
  }
}

/**
 * Generates a simple SVG placeholder for missing covers
 */
export function getPlaceholderSVG(text: string = 'No Cover'): string {
  const safeText = StringUtils.escapeHtml(text);

  return `
<svg width="500" height="500" viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg">
  <rect width="500" height="500" fill="#0f172a"/>
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ec4899" />
      <stop offset="100%" stop-color="#8b5cf6" />
    </linearGradient>
    <filter id="blur">
      <feGaussianBlur stdDeviation="24" />
    </filter>
  </defs>
  <circle cx="250" cy="250" r="120" fill="url(#grad)" filter="url(#blur)" opacity="0.2" />
  <g transform="translate(25, 20)">
    <path d="M200 320 V180 L320 140 V280" fill="none" stroke="url(#grad)" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="170" cy="320" r="32" fill="url(#grad)" />
    <circle cx="290" cy="280" r="32" fill="url(#grad)" />
  </g>
  <text x="250" y="440" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="24" fill="white" opacity="0.4" font-weight="600">${safeText}</text>
</svg>`.trim();
}
