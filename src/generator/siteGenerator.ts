import path from "path";
import fs from "fs-extra";
import { fileURLToPath } from "url";
import { Catalog, BuildOptions, Release, ArtistConfig } from "../types/index.js";
import { TemplateEngine } from "./templateEngine.js";
import { FeedGenerator } from "./feedGenerator.js";
import { EmbedGenerator } from "./embedGenerator.js";
import { PodcastFeedGenerator } from "./podcastFeedGenerator.js";
import { ProceduralCoverGenerator } from "./proceduralCoverGenerator.js";
import {
  copyFile,
  ensureDir,
  writeFile,
  getRelativePath,
} from "../utils/fileUtils.js";

/**
 * Generates static HTML site from catalog
 */
export class SiteGenerator {
  private catalog: Catalog;
  private options: BuildOptions;
  private templateEngine: TemplateEngine;
  private templateDir: string;

  constructor(catalog: Catalog, options: BuildOptions) {
    this.catalog = catalog;
    this.options = options;
    this.templateEngine = new TemplateEngine();

    // Use custom theme or default
    const themeName = options.theme || this.catalog.config.theme || "default";
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    this.templateDir = path.join(__dirname, "../../templates", themeName);
  }

  async generate(): Promise<void> {
    console.log("🏗️  Generating site...");

    // Clean output directory
    await fs.emptyDir(this.options.outputDir);

    // Load templates
    await this.loadTemplates();

    // Copy static assets
    await this.copyAssets();

    // Generate pages
    await this.generateIndexPage();
    await this.generateReleasesPages();

    // Generate artist pages if label mode
    if (this.catalog.config.labelMode && this.catalog.artists) {
      await this.generateArtistPages();
    }

    // Generate embed pages for each release
    await this.generateEmbedPages();

    // Generate feeds (RSS/Atom)
    await this.generateFeeds();

    // Generate podcast feed if enabled
    if (this.catalog.config.podcast?.enabled) {
      await this.generatePodcastFeed();
    }

    // Generate M3U playlists
    await this.generateM3uPlaylists();

    // Generate procedural covers for releases without cover art
    await this.generateProceduralCovers();

    // Copy media files
    await this.copyMediaFiles();

    console.log("✅ Site generated successfully!");
    console.log(`📂 Output: ${this.options.outputDir}`);
  }

  private async loadTemplates(): Promise<void> {
    const templates = ["layout", "index", "release"];

    for (const templateName of templates) {
      const templatePath = path.join(this.templateDir, `${templateName}.hbs`);

      if (await fs.pathExists(templatePath)) {
        await this.templateEngine.loadTemplate(templatePath, templateName);
      } else {
        console.warn(
          `⚠️  Template ${templateName}.hbs not found, using default`
        );
      }
    }
  }

  private async copyAssets(): Promise<void> {
    const assetsDir = path.join(this.templateDir, "assets");

    if (await fs.pathExists(assetsDir)) {
      const destAssetsDir = path.join(this.options.outputDir, "assets");
      await fs.copy(assetsDir, destAssetsDir);
      console.log("  📁 Copied assets");
    }
  }

  private async generateIndexPage(): Promise<void> {
    const basePath = this.options.basePath || this.catalog.config.basePath || "";

    // Prepare custom font URL
    // Note: customFont should be an external URL (e.g., Google Fonts)
    // For local fonts, use @font-face in customCSS instead
    let customFontUrl = null;
    let customFontFamily = null;
    if (this.catalog.config.customFont) {
      if (this.catalog.config.customFont.startsWith('http://') || this.catalog.config.customFont.startsWith('https://')) {
        // External URL (e.g., Google Fonts) - extract font family from URL if possible
        customFontUrl = this.catalog.config.customFont;
        // Try to extract font family from Google Fonts URL
        const fontMatch = this.catalog.config.customFont.match(/family=([^:&]+)/);
        if (fontMatch) {
          customFontFamily = fontMatch[1].replace(/\+/g, ' ');
        }
      }
      // For local files, users should use @font-face in customCSS
    }

    // Prepare custom CSS URL
    let customCSSUrl = null;
    if (this.catalog.config.customCSS) {
      if (this.catalog.config.customCSS.startsWith('http://') || this.catalog.config.customCSS.startsWith('https://')) {
        // External URL
        customCSSUrl = this.catalog.config.customCSS;
      } else {
        // Local file - already copied to assets/
        customCSSUrl = `assets/${path.basename(this.catalog.config.customCSS)}`;
      }
    }

    const data = {
      basePath,
      catalog: {
        ...this.catalog.config,
        headerImageUrl: this.catalog.config.headerImage
          ? path.basename(this.catalog.config.headerImage)
          : null,
        customFontUrl,
        customFontFamily,
        customCSSUrl,
      },
      artist: this.catalog.artist,
      releases: this.catalog.releases
        .filter((release) => !release.config.unlisted) // Filter out unlisted releases
        .map((release) => ({
          ...release,
          url: `releases/${release.slug}/index.html`,
          coverUrl: release.coverPath
            ? `releases/${release.slug}/${path.basename(release.coverPath)}`
            : null,
        })),
    };

    const html = this.templateEngine.renderWithLayout("index", data);
    const outputPath = path.join(this.options.outputDir, "index.html");

    await writeFile(outputPath, html);
    console.log("  📄 Generated index.html");
  }

  private async generateReleasesPages(): Promise<void> {
    for (const release of this.catalog.releases) {
      await this.generateReleasePage(release);
    }
  }

  private async generateReleasePage(release: any): Promise<void> {
    const releaseOutputDir = path.join(
      this.options.outputDir,
      "releases",
      release.slug
    );
    await ensureDir(releaseOutputDir);

    const basePath = this.options.basePath || this.catalog.config.basePath || "";

    // Prepare custom font URL
    let customFontUrl = null;
    let customFontFamily = null;
    if (this.catalog.config.customFont) {
      if (this.catalog.config.customFont.startsWith('http://') || this.catalog.config.customFont.startsWith('https://')) {
        customFontUrl = this.catalog.config.customFont;
        // Try to extract font family from Google Fonts URL
        const fontMatch = this.catalog.config.customFont.match(/family=([^:&]+)/);
        if (fontMatch) {
          customFontFamily = fontMatch[1].replace(/\+/g, ' ');
        }
      }
    }

    // Prepare custom CSS URL
    let customCSSUrl = null;
    if (this.catalog.config.customCSS) {
      if (this.catalog.config.customCSS.startsWith('http://') || this.catalog.config.customCSS.startsWith('https://')) {
        customCSSUrl = this.catalog.config.customCSS;
      } else {
        customCSSUrl = `../../assets/${path.basename(this.catalog.config.customCSS)}`;
      }
    }

    const siteUrl = this.catalog.config.url || "";
    const releaseUrl = siteUrl 
      ? `${siteUrl}${basePath ? basePath : ''}releases/${release.slug}/index.html`
      : `../../index.html`;

    const data = {
      basePath,
      catalog: {
        ...this.catalog.config,
        headerImageUrl: this.catalog.config.headerImage
          ? `../../${path.basename(this.catalog.config.headerImage)}`
          : null,
        customFontUrl,
        customFontFamily,
        customCSSUrl,
        url: siteUrl,
      },
      artist: this.catalog.artist,
      release: {
        ...release,
        coverUrl: release.coverPath ? path.basename(release.coverPath) : null,
        tracks: release.tracks.map((track: any) => ({
          ...track,
          url: path.basename(track.file),
        })),
        slug: release.slug,
      },
      backUrl: "../../index.html",
      releaseUrl,
      embedCodePath: "embed-code.txt",
      embedCompactPath: "embed-compact.txt",
    };

    const html = this.templateEngine.renderWithLayout(
      "release",
      data,
      release.config.title
    );
    const outputPath = path.join(releaseOutputDir, "index.html");

    await writeFile(outputPath, html);
    console.log(`  📄 Generated ${release.slug}/index.html`);
  }

  private async copyMediaFiles(): Promise<void> {
    // Copy logo.svg from project root if exists
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const projectRoot = path.join(__dirname, "../../");
    const logoPath = path.join(projectRoot, "logo.svg");
    if (await fs.pathExists(logoPath)) {
      const logoDest = path.join(this.options.outputDir, "logo.svg");
      await copyFile(logoPath, logoDest);
      console.log(`  🎨 Copied logo.svg`);
    }

    // Copy header image if exists
    if (this.catalog.config.headerImage) {
      const headerImageSrc = path.join(this.options.inputDir, this.catalog.config.headerImage);
      if (await fs.pathExists(headerImageSrc)) {
        const headerImageDest = path.join(this.options.outputDir, path.basename(this.catalog.config.headerImage));
        await copyFile(headerImageSrc, headerImageDest);
        console.log(`  🖼️  Copied header image: ${this.catalog.config.headerImage}`);
      } else {
        console.warn(`  ⚠️  Header image not found: ${headerImageSrc}`);
      }
    } else {
      // Debug: check if headerImage is in config but not being read
      if ((this.catalog.config as any).headerImage) {
        console.warn(`  ⚠️  Header image found in config but not processed: ${(this.catalog.config as any).headerImage}`);
      }
    }

    // Copy custom font file if exists (only if it's a local file, not a URL)
    // Note: For local fonts, users should use @font-face in custom CSS instead
    if (this.catalog.config.customFont && !this.catalog.config.customFont.startsWith('http://') && !this.catalog.config.customFont.startsWith('https://')) {
      const customFontSrc = path.join(this.options.inputDir, this.catalog.config.customFont);
      if (await fs.pathExists(customFontSrc)) {
        const customFontDest = path.join(this.options.outputDir, "assets", "fonts", path.basename(this.catalog.config.customFont));
        await ensureDir(path.dirname(customFontDest));
        await copyFile(customFontSrc, customFontDest);
        console.log(`  🔤 Copied custom font: ${this.catalog.config.customFont}`);
      } else {
        console.warn(`  ⚠️  Custom font not found: ${customFontSrc}`);
      }
    }

    // Copy custom CSS if exists (only if it's a local file, not a URL)
    if (this.catalog.config.customCSS && !this.catalog.config.customCSS.startsWith('http://') && !this.catalog.config.customCSS.startsWith('https://')) {
      const customCSSSrc = path.join(this.options.inputDir, this.catalog.config.customCSS);
      if (await fs.pathExists(customCSSSrc)) {
        const customCSSDest = path.join(this.options.outputDir, "assets", path.basename(this.catalog.config.customCSS));
        await ensureDir(path.dirname(customCSSDest));
        await copyFile(customCSSSrc, customCSSDest);
        console.log(`  🎨 Copied custom CSS: ${this.catalog.config.customCSS}`);
      } else {
        console.warn(`  ⚠️  Custom CSS not found: ${customCSSSrc}`);
      }
    }

    // Copy artist photo if exists
    if (this.catalog.artist?.photo) {
      const artistPhotoSrc = path.join(this.options.inputDir, this.catalog.artist.photo);
      const artistPhotoDest = path.join(this.options.outputDir, path.basename(this.catalog.artist.photo));
      await copyFile(artistPhotoSrc, artistPhotoDest);
      console.log(`  📸 Copied artist photo: ${this.catalog.artist.photo}`);
    }

    for (const release of this.catalog.releases) {
      const releaseOutputDir = path.join(
        this.options.outputDir,
        "releases",
        release.slug
      );

      // Copy cover
      if (release.coverPath) {
        const coverSrc = path.join(release.path, release.coverPath);
        const coverDest = path.join(
          releaseOutputDir,
          path.basename(release.coverPath)
        );
        await copyFile(coverSrc, coverDest);
      }

      // Copy tracks
      for (const track of release.tracks) {
        const trackSrc = track.file;
        const trackDest = path.join(
          releaseOutputDir,
          path.basename(track.file)
        );
        await copyFile(trackSrc, trackDest);
      }
    }

    console.log("  🎵 Copied media files");
  }

  /**
   * Generate RSS and Atom feeds
   */
  private async generateFeeds(): Promise<void> {
    const siteUrl = this.catalog.config.url || "https://example.com";
    const basePath = this.options.basePath || this.catalog.config.basePath || "";

    const feedGenerator = new FeedGenerator(this.catalog, {
      siteUrl,
      basePath,
    });

    // Generate RSS feed
    const rssFeed = feedGenerator.generateRssFeed();
    await writeFile(path.join(this.options.outputDir, "feed.xml"), rssFeed);
    console.log("  📡 Generated feed.xml (RSS)");

    // Generate Atom feed
    const atomFeed = feedGenerator.generateAtomFeed();
    await writeFile(path.join(this.options.outputDir, "atom.xml"), atomFeed);
    console.log("  📡 Generated atom.xml (Atom)");
  }

  /**
   * Generate M3U playlists for releases and catalog
   */
  private async generateM3uPlaylists(): Promise<void> {
    const siteUrl = this.catalog.config.url || "";
    const basePath = this.options.basePath || this.catalog.config.basePath || "";

    // Generate playlist for each release
    for (const release of this.catalog.releases) {
      const m3u = this.generateReleaseM3u(release, siteUrl, basePath);
      const releaseDir = path.join(this.options.outputDir, "releases", release.slug);
      await writeFile(path.join(releaseDir, "playlist.m3u"), m3u);
    }
    console.log("  🎶 Generated release playlists (M3U)");

    // Generate catalog-wide playlist
    const catalogM3u = this.generateCatalogM3u(siteUrl, basePath);
    await writeFile(path.join(this.options.outputDir, "catalog.m3u"), catalogM3u);
    console.log("  🎶 Generated catalog.m3u");
  }

  /**
   * Generate M3U playlist for a single release
   */
  private generateReleaseM3u(release: Release, siteUrl: string, basePath: string): string {
    const lines = ["#EXTM3U"];
    const artistName = this.catalog.artist?.name || "Unknown Artist";

    for (const track of release.tracks) {
      const duration = track.duration ? Math.round(track.duration) : -1;
      const trackUrl = siteUrl
        ? `${siteUrl.replace(/\/$/, "")}${basePath}/releases/${release.slug}/${path.basename(track.file)}`
        : path.basename(track.file);

      lines.push(`#EXTINF:${duration},${artistName} - ${track.title}`);
      lines.push(trackUrl);
    }

    return lines.join("\n");
  }

  /**
   * Generate M3U playlist for entire catalog
   */
  private generateCatalogM3u(siteUrl: string, basePath: string): string {
    const lines = ["#EXTM3U"];
    const artistName = this.catalog.artist?.name || "Unknown Artist";

    // Sort releases by date (newest first)
    const sortedReleases = [...this.catalog.releases].sort(
      (a, b) => new Date(b.config.date).getTime() - new Date(a.config.date).getTime()
    );

    for (const release of sortedReleases) {
      // Skip unlisted releases from catalog playlist
      if ((release.config as any).unlisted) continue;

      for (const track of release.tracks) {
        const duration = track.duration ? Math.round(track.duration) : -1;
        const trackUrl = siteUrl
          ? `${siteUrl.replace(/\/$/, "")}${basePath}/releases/${release.slug}/${path.basename(track.file)}`
          : `releases/${release.slug}/${path.basename(track.file)}`;

        lines.push(`#EXTINF:${duration},${artistName} - ${track.title}`);
        lines.push(trackUrl);
      }
    }

    return lines.join("\n");
  }

  /**
   * Generate artist pages for label mode
   */
  private async generateArtistPages(): Promise<void> {
    if (!this.catalog.artists) return;

    const basePath = this.options.basePath || this.catalog.config.basePath || "";

    for (const artist of this.catalog.artists) {
      const artistSlug = artist.slug || artist.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const artistDir = path.join(this.options.outputDir, "artists", artistSlug);
      await ensureDir(artistDir);

      // Get releases for this artist
      const artistReleases = this.catalog.releases.filter(
        (release) => release.config.artistSlug === artistSlug && !release.config.unlisted
      );

      // Prepare custom font URL
      let customFontUrl = null;
      let customFontFamily = null;
      if (this.catalog.config.customFont) {
        if (this.catalog.config.customFont.startsWith('http://') || this.catalog.config.customFont.startsWith('https://')) {
          customFontUrl = this.catalog.config.customFont;
          // Try to extract font family from Google Fonts URL
          const fontMatch = this.catalog.config.customFont.match(/family=([^:&]+)/);
          if (fontMatch) {
            customFontFamily = fontMatch[1].replace(/\+/g, ' ');
          }
        }
      }

      // Prepare custom CSS URL
      let customCSSUrl = null;
      if (this.catalog.config.customCSS) {
        if (this.catalog.config.customCSS.startsWith('http://') || this.catalog.config.customCSS.startsWith('https://')) {
          customCSSUrl = this.catalog.config.customCSS;
        } else {
          customCSSUrl = `../../assets/${path.basename(this.catalog.config.customCSS)}`;
        }
      }

      const data = {
        basePath,
        catalog: {
          ...this.catalog.config,
          customFontUrl,
          customFontFamily,
          customCSSUrl,
        },
        artist,
        releases: artistReleases.map((release) => ({
          ...release,
          url: `../../releases/${release.slug}/index.html`,
          coverUrl: release.coverPath
            ? `../../releases/${release.slug}/${path.basename(release.coverPath)}`
            : null,
        })),
        backUrl: "../../index.html",
      };

      // Try to use artist template, fall back to index
      const templateName = this.templateEngine.hasTemplate("artist") ? "artist" : "index";
      const html = this.templateEngine.renderWithLayout(templateName, data, artist.name);
      await writeFile(path.join(artistDir, "index.html"), html);
      console.log(`  👤 Generated artists/${artistSlug}/index.html`);
    }
  }

  /**
   * Generate embed pages for each release
   */
  private async generateEmbedPages(): Promise<void> {
    const siteUrl = this.catalog.config.url || "";
    const basePath = this.options.basePath || this.catalog.config.basePath || "";

    const embedGenerator = new EmbedGenerator(this.catalog, { siteUrl, basePath });

    for (const release of this.catalog.releases) {
      const releaseDir = path.join(this.options.outputDir, "releases", release.slug);

      // Generate embed.html (standalone embed page)
      const embedHtml = this.generateEmbedHtmlPage(release, embedGenerator);
      await writeFile(path.join(releaseDir, "embed.html"), embedHtml);

      // Generate embed-code.txt (copyable embed code)
      const embedCode = embedGenerator.generateReleaseEmbed(release);
      await writeFile(path.join(releaseDir, "embed-code.txt"), embedCode);

      // Generate compact embed code
      const compactEmbed = embedGenerator.generateCompactEmbed(release);
      await writeFile(path.join(releaseDir, "embed-compact.txt"), compactEmbed);
    }
    console.log("  📦 Generated embed pages");
  }

  /**
   * Generate standalone embed HTML page
   */
  private generateEmbedHtmlPage(release: Release, embedGenerator: EmbedGenerator): string {
    const siteUrl = this.catalog.config.url || "";
    const basePath = this.options.basePath || this.catalog.config.basePath || "";
    const coverUrl = release.coverPath ? path.basename(release.coverPath) : null;
    const artistName = this.catalog.artist?.name || "Unknown Artist";
    const firstTrackUrl = release.tracks.length > 0 ? path.basename(release.tracks[0].file) : null;

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${release.config.title} - Embed</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1e293b; }
    .embed-container { max-width: 400px; margin: 0 auto; }
    .cover { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; }
    .cover-placeholder { width: 100%; aspect-ratio: 1; background: linear-gradient(135deg, #6366f1, #8b5cf6); display: flex; align-items: center; justify-content: center; font-size: 4rem; color: rgba(255,255,255,0.3); }
    .info { padding: 1rem; }
    .title { font-size: 1.1rem; font-weight: 600; color: #f1f5f9; margin-bottom: 0.25rem; }
    .artist { font-size: 0.9rem; color: #94a3b8; }
    .tracks { font-size: 0.8rem; color: #64748b; margin-top: 0.5rem; }
    audio { width: 100%; height: 40px; }
    .footer { padding: 0.5rem 1rem; background: #0f172a; font-size: 0.7rem; color: #64748b; text-align: right; }
    .footer a { color: #6366f1; text-decoration: none; }
    .link { display: block; text-decoration: none; color: inherit; }
  </style>
</head>
<body>
  <div class="embed-container">
    <a href="index.html" class="link" target="_top">
      ${coverUrl ? `<img src="${coverUrl}" alt="${release.config.title}" class="cover">` : '<div class="cover-placeholder">♪</div>'}
      <div class="info">
        <div class="title">${release.config.title}</div>
        <div class="artist">${artistName}</div>
        <div class="tracks">${release.tracks.length} track${release.tracks.length !== 1 ? 's' : ''}</div>
      </div>
    </a>
    ${firstTrackUrl ? `<audio controls preload="none"><source src="${firstTrackUrl}" type="audio/mpeg">Your browser does not support audio.</audio>` : ''}
    <div class="footer">
      Powered by <a href="https://github.com/scobru/shogun-message-bridge/tree/main/tunecamp" target="_blank">Tunecamp</a>
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * Generate podcast RSS feed
   */
  private async generatePodcastFeed(): Promise<void> {
    const siteUrl = this.catalog.config.url || "https://example.com";
    const basePath = this.options.basePath || this.catalog.config.basePath || "";
    const podcastConfig = this.catalog.config.podcast || {};

    const podcastGenerator = new PodcastFeedGenerator(this.catalog, {
      siteUrl,
      basePath,
      podcastTitle: podcastConfig.title,
      podcastDescription: podcastConfig.description,
      podcastAuthor: podcastConfig.author || this.catalog.artist?.name,
      podcastEmail: podcastConfig.email,
      podcastCategory: podcastConfig.category,
      podcastImage: podcastConfig.image,
      explicit: podcastConfig.explicit,
    });

    const podcastFeed = podcastGenerator.generatePodcastFeed();
    await writeFile(path.join(this.options.outputDir, "podcast.xml"), podcastFeed);
    console.log("  🎙️ Generated podcast.xml");
  }

  /**
   * Generate procedural SVG covers for releases without cover art
   */
  private async generateProceduralCovers(): Promise<void> {
    const coverGenerator = new ProceduralCoverGenerator();
    const artistName = this.catalog.artist?.name || "Unknown Artist";
    let generatedCount = 0;

    for (const release of this.catalog.releases) {
      // Only generate if no cover exists
      if (!release.coverPath) {
        const releaseDir = path.join(this.options.outputDir, "releases", release.slug);

        // Generate procedural cover
        const svg = coverGenerator.generateCover(
          release.config.title,
          artistName,
          release.config.date,
          release.config.genres
        );

        // Save as SVG
        const coverPath = path.join(releaseDir, "cover-procedural.svg");
        await writeFile(coverPath, svg);
        generatedCount++;
      }
    }

    if (generatedCount > 0) {
      console.log(`  🎨 Generated ${generatedCount} procedural cover(s)`);
    }
  }
}
