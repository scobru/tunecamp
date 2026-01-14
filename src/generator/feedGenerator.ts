/**
 * RSS and Atom Feed Generator for Tunecamp
 * Generates feed.xml (RSS 2.0) and atom.xml feeds
 */

import path from "path";
import { Catalog, Release } from "../types/index.js";

export interface FeedOptions {
    siteUrl: string;
    basePath: string;
}

/**
 * Generates RSS 2.0 and Atom feeds from catalog
 */
export class FeedGenerator {
    private catalog: Catalog;
    private options: FeedOptions;

    constructor(catalog: Catalog, options: FeedOptions) {
        this.catalog = catalog;
        this.options = options;
    }

    /**
     * Get the full URL for a path
     */
    private getUrl(relativePath: string): string {
        const base = this.options.siteUrl.replace(/\/$/, "");
        const basePath = this.options.basePath || "";
        return `${base}${basePath}/${relativePath}`.replace(/([^:]\/)\/+/g, "$1");
    }

    /**
     * Format date for RSS (RFC 822)
     */
    private formatRssDate(dateStr: string): string {
        const date = new Date(dateStr);
        return date.toUTCString();
    }

    /**
     * Format date for Atom (ISO 8601)
     */
    private formatAtomDate(dateStr: string): string {
        const date = new Date(dateStr);
        return date.toISOString();
    }

    /**
     * Escape XML special characters
     */
    private escapeXml(str: string): string {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&apos;");
    }

    /**
     * Generate RSS 2.0 feed
     */
    generateRssFeed(): string {
        const title = this.escapeXml(this.catalog.config.title);
        const description = this.escapeXml(this.catalog.config.description || "Music releases");
        const link = this.getUrl("");
        const language = this.catalog.config.language || "en";
        const artistName = this.catalog.artist?.name || "Unknown Artist";
        const now = new Date().toUTCString();

        // Sort releases by date (newest first)
        const sortedReleases = [...this.catalog.releases].sort(
            (a, b) => new Date(b.config.date).getTime() - new Date(a.config.date).getTime()
        );

        const items = sortedReleases
            .filter((release) => !(release.config as any).unlisted)
            .map((release) => this.generateRssItem(release))
            .join("\n");

        return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>${title}</title>
    <link>${link}</link>
    <description>${description}</description>
    <language>${language}</language>
    <lastBuildDate>${now}</lastBuildDate>
    <generator>Tunecamp</generator>
    <atom:link href="${this.getUrl("feed.xml")}" rel="self" type="application/rss+xml"/>
    <itunes:author>${this.escapeXml(artistName)}</itunes:author>
    <itunes:category text="Music"/>
${items}
  </channel>
</rss>`;
    }

    /**
     * Generate a single RSS item for a release
     */
    private generateRssItem(release: Release): string {
        const title = this.escapeXml(release.config.title);
        const description = this.escapeXml(release.config.description || `New release: ${release.config.title}`);
        const link = this.getUrl(`releases/${release.slug}/index.html`);
        const pubDate = this.formatRssDate(release.config.date);
        const guid = this.getUrl(`releases/${release.slug}/`);

        let coverEnclosure = "";
        if (release.coverPath) {
            const coverUrl = this.getUrl(`releases/${release.slug}/${path.basename(release.coverPath)}`);
            coverEnclosure = `    <enclosure url="${coverUrl}" type="image/jpeg"/>`;
        }

        const trackCount = release.tracks.length;
        const genres = release.config.genres?.map((g) => this.escapeXml(g)).join(", ") || "";

        return `    <item>
      <title>${title}</title>
      <link>${link}</link>
      <description><![CDATA[${description}${trackCount > 0 ? ` (${trackCount} tracks)` : ""}${genres ? ` - ${genres}` : ""}]]></description>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="true">${guid}</guid>
${coverEnclosure}
    </item>`;
    }

    /**
     * Generate Atom feed
     */
    generateAtomFeed(): string {
        const title = this.escapeXml(this.catalog.config.title);
        const subtitle = this.escapeXml(this.catalog.config.description || "Music releases");
        const link = this.getUrl("");
        const feedUrl = this.getUrl("atom.xml");
        const artistName = this.catalog.artist?.name || "Unknown Artist";
        const now = this.formatAtomDate(new Date().toISOString());

        // Sort releases by date (newest first)
        const sortedReleases = [...this.catalog.releases].sort(
            (a, b) => new Date(b.config.date).getTime() - new Date(a.config.date).getTime()
        );

        const entries = sortedReleases
            .filter((release) => !(release.config as any).unlisted)
            .map((release) => this.generateAtomEntry(release))
            .join("\n");

        return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${title}</title>
  <subtitle>${subtitle}</subtitle>
  <link href="${link}" rel="alternate" type="text/html"/>
  <link href="${feedUrl}" rel="self" type="application/atom+xml"/>
  <id>${link}</id>
  <updated>${now}</updated>
  <generator uri="https://github.com/scobru/tunecamp" version="1.0.0">Tunecamp</generator>
  <author>
    <name>${this.escapeXml(artistName)}</name>
  </author>
${entries}
</feed>`;
    }

    /**
     * Generate a single Atom entry for a release
     */
    private generateAtomEntry(release: Release): string {
        const title = this.escapeXml(release.config.title);
        const summary = this.escapeXml(release.config.description || `New release: ${release.config.title}`);
        const link = this.getUrl(`releases/${release.slug}/index.html`);
        const id = this.getUrl(`releases/${release.slug}/`);
        const updated = this.formatAtomDate(release.config.date);
        const published = this.formatAtomDate(release.config.date);

        const trackCount = release.tracks.length;
        const genres = release.config.genres?.join(", ") || "";

        let content = `<p>${summary}</p>`;
        if (trackCount > 0) {
            content += `<p>Tracks: ${trackCount}</p>`;
        }
        if (genres) {
            content += `<p>Genres: ${genres}</p>`;
        }

        return `  <entry>
    <title>${title}</title>
    <link href="${link}" rel="alternate" type="text/html"/>
    <id>${id}</id>
    <updated>${updated}</updated>
    <published>${published}</published>
    <summary>${summary}</summary>
    <content type="html"><![CDATA[${content}]]></content>
  </entry>`;
    }
}
