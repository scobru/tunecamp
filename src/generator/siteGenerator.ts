import path from "path";
import fs from "fs-extra";
import { fileURLToPath } from "url";
import { Catalog, BuildOptions } from "../types/index.js";
import { TemplateEngine } from "./templateEngine.js";
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
    
    const data = {
      basePath,
      catalog: this.catalog.config,
      artist: this.catalog.artist,
      releases: this.catalog.releases.map((release) => ({
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

    const data = {
      basePath,
      catalog: this.catalog.config,
      artist: this.catalog.artist,
      release: {
        ...release,
        coverUrl: release.coverPath ? path.basename(release.coverPath) : null,
        tracks: release.tracks.map((track: any) => ({
          ...track,
          url: path.basename(track.file),
        })),
      },
      backUrl: "../../index.html",
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
}
