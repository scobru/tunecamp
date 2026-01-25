/**
 * Embed Widget Generator for Tunecamp
 * Creates embeddable HTML widgets for releases
 */

import path from "path";
import { Catalog, Release } from "../types/index.js";
import { escapeHtml, normalizeUrl } from "../utils/audioUtils.js";

export interface EmbedOptions {
  siteUrl: string;
  basePath: string;
}

/**
 * Generates embeddable HTML widgets
 */
export class EmbedGenerator {
  private catalog: Catalog;
  private options: EmbedOptions;

  constructor(catalog: Catalog, options: EmbedOptions) {
    this.catalog = catalog;
    this.options = options;
  }

  /**
   * Get the full URL for a path
   */
  private getUrl(relativePath: string): string {
    const base = normalizeUrl(this.options.siteUrl);
    const basePath = this.options.basePath || "";
    return `${base}${basePath}/${relativePath}`.replace(/([^:]\/)\/+/g, "$1");
  }

  /**
   * Generate embed HTML for a release
   */
  generateReleaseEmbed(release: Release): string {
    const releaseUrl = this.getUrl(`releases/${release.slug}/index.html`);
    const coverUrl = release.coverPath
      ? this.getUrl(`releases/${release.slug}/${path.basename(release.coverPath)}`)
      : null;
    const artistName = this.catalog.artist?.name || "Unknown Artist";
    const trackCount = release.tracks.length;
    const firstTrackUrl = release.tracks.length > 0
      ? this.getUrl(`releases/${release.slug}/${path.basename(release.tracks[0].file)}`)
      : null;

    // Compact embed widget with inline styles
    return `<!-- Tunecamp Embed: ${release.config.title} -->
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:400px;background:#1e293b;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.3);">
  <a href="${releaseUrl}" target="_blank" style="text-decoration:none;color:inherit;display:block;">
    ${coverUrl ? `<img src="${coverUrl}" alt="${escapeHtml(release.config.title)}" style="width:100%;display:block;aspect-ratio:1;object-fit:cover;">` : `<div style="width:100%;aspect-ratio:1;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:4rem;color:rgba(255,255,255,0.3);">♪</div>`}
    <div style="padding:1rem;">
      <div style="font-size:1.1rem;font-weight:600;color:#f1f5f9;margin-bottom:0.25rem;">${escapeHtml(release.config.title)}</div>
      <div style="font-size:0.9rem;color:#94a3b8;">${escapeHtml(artistName)}</div>
      <div style="font-size:0.8rem;color:#64748b;margin-top:0.5rem;">${trackCount} track${trackCount !== 1 ? 's' : ''}</div>
    </div>
  </a>
  ${firstTrackUrl ? `<audio controls style="width:100%;height:40px;" preload="none"><source src="${firstTrackUrl}" type="audio/mpeg">Your browser does not support audio.</audio>` : ''}
  <div style="padding:0.5rem 1rem;background:#0f172a;font-size:0.7rem;color:#64748b;text-align:right;">
    Powered by <a href="https://github.com/scobru/tunecamp" target="_blank" style="color:#6366f1;text-decoration:none;">Tunecamp</a>
  </div>
</div>
<!-- End Tunecamp Embed -->`;
  }

  /**
   * Generate compact embed (smaller widget)
   */
  generateCompactEmbed(release: Release): string {
    const releaseUrl = this.getUrl(`releases/${release.slug}/index.html`);
    const coverUrl = release.coverPath
      ? this.getUrl(`releases/${release.slug}/${path.basename(release.coverPath)}`)
      : null;
    const artistName = this.catalog.artist?.name || "Unknown Artist";

    return `<!-- Tunecamp Compact Embed -->
<a href="${releaseUrl}" target="_blank" style="display:inline-flex;align-items:center;gap:0.75rem;padding:0.5rem;background:#1e293b;border-radius:8px;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:300px;">
  ${coverUrl ? `<img src="${coverUrl}" alt="${escapeHtml(release.config.title)}" style="width:48px;height:48px;border-radius:4px;object-fit:cover;">` : `<div style="width:48px;height:48px;border-radius:4px;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.5);">♪</div>`}
  <div style="min-width:0;">
    <div style="font-size:0.9rem;font-weight:500;color:#f1f5f9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(release.config.title)}</div>
    <div style="font-size:0.75rem;color:#94a3b8;">${escapeHtml(artistName)}</div>
  </div>
</a>`;
  }

  /**
   * Generate iframe embed code
   */
  generateIframeEmbed(release: Release, width: number = 400, height: number = 300): string {
    const embedUrl = this.getUrl(`releases/${release.slug}/embed.html`);
    return `<iframe src="${embedUrl}" width="${width}" height="${height}" frameborder="0" allowtransparency="true" allow="encrypted-media"></iframe>`;
  }

}
