#!/usr/bin/env node

/**
 * Interactive CLI Wizard for Tunecamp
 * Guides users step-by-step through catalog creation
 */

import { select, input, confirm, checkbox } from '@inquirer/prompts';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { translations, Language, getTranslations, Translations } from './i18n/index.js';

// Wizard state
interface WizardState {
  language: Language;
  catalog: {
    title: string;
    description: string;
    url: string;
    theme: string;
  };
  artist: {
    name: string;
    bio: string;
    links: Array<{ platform: string; url: string }>;
    donationLinks: Array<{ platform: string; url: string; description: string }>;
  };
  release: {
    title: string;
    date: string;
    description: string;
    genres: string[];
    download: 'free' | 'paycurtain' | 'codes' | 'none';
    price?: number;
    paypalLink?: string;
    stripeLink?: string;
  };
}

// Theme colors for terminal
const colors = {
  primary: chalk.hex('#8B5CF6'),
  secondary: chalk.hex('#06B6D4'),
  success: chalk.hex('#10B981'),
  warning: chalk.hex('#F59E0B'),
  error: chalk.hex('#EF4444'),
  muted: chalk.gray,
  highlight: chalk.bold.white,
};

/**
 * Print a styled header
 */
function printHeader(title: string, subtitle?: string): void {
  console.log('\n');
  console.log(colors.primary('━'.repeat(50)));
  console.log(colors.highlight(`  ${title}`));
  if (subtitle) {
    console.log(colors.muted(`  ${subtitle}`));
  }
  console.log(colors.primary('━'.repeat(50)));
  console.log('');
}

/**
 * Print step indicator
 */
function printStep(current: number, total: number, t: Translations): void {
  const progress = '●'.repeat(current) + '○'.repeat(total - current);
  console.log(colors.muted(`  ${t.common.step} ${current} ${t.common.of} ${total}  ${progress}`));
  console.log('');
}

/**
 * Print a preview box
 */
function printPreview(title: string, content: Record<string, string>): void {
  console.log(colors.secondary(`\n  ┌─ ${title} ${'─'.repeat(40 - title.length)}┐`));
  for (const [key, value] of Object.entries(content)) {
    const displayValue = value.length > 35 ? value.substring(0, 32) + '...' : value;
    console.log(colors.muted(`  │ ${chalk.white(key.padEnd(15))} ${displayValue.padEnd(35)}│`));
  }
  console.log(colors.secondary(`  └${'─'.repeat(52)}┘\n`));
}

/**
 * Create slug from string
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/**
 * Main wizard function
 */
export async function runWizard(outputDir?: string): Promise<void> {
  const state: WizardState = {
    language: 'en',
    catalog: { title: '', description: '', url: '', theme: 'default' },
    artist: { name: '', bio: '', links: [], donationLinks: [] },
    release: { title: '', date: '', description: '', genres: [], download: 'free' },
  };

  try {
    // ═══════════════════════════════════════════════════════════════════
    // STEP 0: Welcome & Language Selection
    // ═══════════════════════════════════════════════════════════════════
    console.clear();
    console.log('\n');
    console.log(colors.primary(`
    ╔════════════════════════════════════════════════════╗
    ║                                                    ║
    ║   🎵  T U N E C A M P   W I Z A R D  🎵           ║
    ║                                                    ║
    ╚════════════════════════════════════════════════════╝
    `));

    state.language = await select({
      message: 'Select your language / Seleziona la tua lingua:',
      choices: [
        { name: '🇬🇧 English', value: 'en' as Language },
        { name: '🇮🇹 Italiano', value: 'it' as Language },
      ],
    });

    const t = getTranslations(state.language);

    console.log('\n' + colors.muted(t.welcome.description) + '\n');
    
    await confirm({ message: t.welcome.start, default: true });

    // ═══════════════════════════════════════════════════════════════════
    // STEP 1: Catalog Configuration
    // ═══════════════════════════════════════════════════════════════════
    console.clear();
    printHeader(t.catalog.title, t.catalog.subtitle);
    printStep(1, 5, t);

    state.catalog.title = await input({
      message: t.catalog.catalogTitle,
      default: t.catalog.catalogTitlePlaceholder.replace('Es: ', '').replace('E.g.: ', ''),
      validate: (value) => value.length > 0 || t.validation.required,
    });

    state.catalog.description = await input({
      message: t.catalog.catalogDescription,
      default: t.catalog.catalogDescriptionPlaceholder,
    });

    state.catalog.url = await input({
      message: t.catalog.catalogUrl,
      default: 'https://example.com',
    });

    printPreview(t.summary.catalogInfo, {
      [t.catalog.catalogTitle]: state.catalog.title,
      [t.catalog.catalogDescription]: state.catalog.description,
    });

    // ═══════════════════════════════════════════════════════════════════
    // STEP 2: Artist Information
    // ═══════════════════════════════════════════════════════════════════
    console.clear();
    printHeader(t.artist.title, t.artist.subtitle);
    printStep(2, 5, t);

    state.artist.name = await input({
      message: t.artist.artistName,
      validate: (value) => value.length > 0 || t.validation.required,
    });

    state.artist.bio = await input({
      message: t.artist.bio,
      default: t.artist.bioPlaceholder,
    });

    // Social links
    const addSocialLinks = await confirm({
      message: `${t.artist.socialLinks}?`,
      default: true,
    });

    if (addSocialLinks) {
      const platforms = ['website', 'bandcamp', 'spotify', 'soundcloud', 'youtube', 'instagram', 'twitter'];
      
      for (const platform of platforms) {
        const addThis = await confirm({
          message: `${t.artist.addLink} ${platform}?`,
          default: false,
        });

        if (addThis) {
          const url = await input({
            message: `${platform} URL:`,
            validate: (value) => {
              if (!value) return true;
              try {
                new URL(value);
                return true;
              } catch {
                return t.validation.invalidUrl;
              }
            },
          });

          if (url) {
            state.artist.links.push({ platform, url });
          }
        }
      }
    }

    printPreview(t.summary.artistInfo, {
      [t.artist.artistName]: state.artist.name,
      [t.artist.bio]: state.artist.bio.substring(0, 30) + '...',
      [t.artist.socialLinks]: state.artist.links.length.toString() + ' links',
    });

    // ═══════════════════════════════════════════════════════════════════
    // STEP 3: First Release
    // ═══════════════════════════════════════════════════════════════════
    console.clear();
    printHeader(t.release.title, t.release.subtitle);
    printStep(3, 5, t);

    state.release.title = await input({
      message: t.release.releaseTitle,
      default: t.release.releaseTitlePlaceholder.replace('Es: ', '').replace('E.g.: ', ''),
      validate: (value) => value.length > 0 || t.validation.required,
    });

    state.release.date = await input({
      message: t.release.releaseDate,
      default: new Date().toISOString().split('T')[0],
      validate: (value) => {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        return dateRegex.test(value) || t.validation.invalidDate;
      },
    });

    state.release.description = await input({
      message: t.release.description,
      default: t.release.descriptionPlaceholder,
    });

    const genresInput = await input({
      message: `${t.release.genres} (${t.release.genresHelp}):`,
      default: 'Electronic, Experimental',
    });

    state.release.genres = genresInput.split(',').map((g) => g.trim()).filter(Boolean);

    printPreview(t.summary.releaseInfo, {
      [t.release.releaseTitle]: state.release.title,
      [t.release.releaseDate]: state.release.date,
      [t.release.genres]: state.release.genres.join(', '),
    });

    // ═══════════════════════════════════════════════════════════════════
    // STEP 4: Download Mode
    // ═══════════════════════════════════════════════════════════════════
    console.clear();
    printHeader(t.download.title, t.download.subtitle);
    printStep(4, 5, t);

    state.release.download = await select({
      message: t.download.selectMode,
      choices: [
        { 
          name: `${colors.success('●')} ${t.download.modes.free.name}\n     ${colors.muted(t.download.modes.free.description)}`, 
          value: 'free' as const 
        },
        { 
          name: `${colors.warning('●')} ${t.download.modes.paycurtain.name}\n     ${colors.muted(t.download.modes.paycurtain.description)}`, 
          value: 'paycurtain' as const 
        },
        { 
          name: `${colors.primary('●')} ${t.download.modes.codes.name}\n     ${colors.muted(t.download.modes.codes.description)}`, 
          value: 'codes' as const 
        },
        { 
          name: `${colors.muted('●')} ${t.download.modes.none.name}\n     ${colors.muted(t.download.modes.none.description)}`, 
          value: 'none' as const 
        },
      ],
    });

    if (state.release.download === 'paycurtain') {
      const priceInput = await input({
        message: t.download.price,
        default: '10.00',
      });
      state.release.price = parseFloat(priceInput) || 10;

      state.release.paypalLink = await input({
        message: `${t.download.paypalLink} (${t.common.optional}):`,
      });

      state.release.stripeLink = await input({
        message: `${t.download.stripeLink} (${t.common.optional}):`,
      });
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 5: Summary & Generation
    // ═══════════════════════════════════════════════════════════════════
    console.clear();
    printHeader(t.summary.title, t.summary.subtitle);
    printStep(5, 5, t);

    // Show all previews
    printPreview(t.summary.catalogInfo, {
      [t.catalog.catalogTitle]: state.catalog.title,
      'URL': state.catalog.url,
    });

    printPreview(t.summary.artistInfo, {
      [t.artist.artistName]: state.artist.name,
    });

    printPreview(t.summary.releaseInfo, {
      [t.release.releaseTitle]: state.release.title,
      [t.release.releaseDate]: state.release.date,
      'Download': state.release.download,
    });

    const shouldGenerate = await confirm({
      message: t.summary.generate,
      default: true,
    });

    if (!shouldGenerate) {
      console.log(colors.warning('\n  ' + t.common.cancel + '\n'));
      return;
    }

    // Generate catalog
    const targetDir = outputDir || await input({
      message: state.language === 'it' ? 'Cartella di destinazione:' : 'Output directory:',
      default: `./${slugify(state.catalog.title)}`,
    });

    await generateCatalog(state, targetDir);

    // Success message
    console.log('\n');
    console.log(colors.success(`  ✅ ${t.summary.success}`));
    console.log(colors.muted(`     ${t.summary.successMessage}\n`));
    
    console.log(colors.highlight(`  ${t.summary.nextSteps}:`));
    console.log(colors.muted(`  1. ${t.summary.step1.replace('ZIP', targetDir)}`));
    console.log(colors.muted(`  2. ${t.summary.step2}`));
    console.log(colors.muted(`  3. ${t.summary.step3}`));
    console.log('\n');

  } catch (error) {
    if ((error as any).name === 'ExitPromptError') {
      console.log(colors.warning('\n  Wizard cancelled.\n'));
      return;
    }
    throw error;
  }
}

/**
 * Generate catalog files from wizard state
 */
async function generateCatalog(state: WizardState, targetDir: string): Promise<void> {
  const resolvedDir = path.resolve(targetDir);
  
  // Ensure directory exists
  await fs.ensureDir(resolvedDir);

  // Generate catalog.yaml
  const catalogYaml = `title: "${state.catalog.title}"
description: "${state.catalog.description}"
url: "${state.catalog.url}"
basePath: ""
theme: "${state.catalog.theme}"
language: "${state.language}"
`;
  await fs.writeFile(path.join(resolvedDir, 'catalog.yaml'), catalogYaml);

  // Generate artist.yaml
  let artistYaml = `name: "${state.artist.name}"
bio: "${state.artist.bio}"
`;

  if (state.artist.links.length > 0) {
    artistYaml += 'links:\n';
    for (const link of state.artist.links) {
      artistYaml += `  - ${link.platform}: "${link.url}"\n`;
    }
  }

  if (state.artist.donationLinks.length > 0) {
    artistYaml += 'donationLinks:\n';
    for (const link of state.artist.donationLinks) {
      artistYaml += `  - platform: "${link.platform}"\n`;
      artistYaml += `    url: "${link.url}"\n`;
      artistYaml += `    description: "${link.description}"\n`;
    }
  }

  await fs.writeFile(path.join(resolvedDir, 'artist.yaml'), artistYaml);

  // Create releases directory
  const releaseSlug = slugify(state.release.title);
  const releaseDir = path.join(resolvedDir, 'releases', releaseSlug);
  await fs.ensureDir(path.join(releaseDir, 'tracks'));

  // Generate release.yaml
  let releaseYaml = `title: "${state.release.title}"
date: "${state.release.date}"
description: "${state.release.description}"
download: "${state.release.download}"
`;

  if (state.release.genres.length > 0) {
    releaseYaml += 'genres:\n';
    for (const genre of state.release.genres) {
      releaseYaml += `  - "${genre}"\n`;
    }
  }

  if (state.release.download === 'paycurtain') {
    if (state.release.price) {
      releaseYaml += `price: ${state.release.price}\n`;
    }
    if (state.release.paypalLink) {
      releaseYaml += `paypalLink: "${state.release.paypalLink}"\n`;
    }
    if (state.release.stripeLink) {
      releaseYaml += `stripeLink: "${state.release.stripeLink}"\n`;
    }
  }

  if (state.release.download === 'codes') {
    releaseYaml += `unlockCodes:
  enabled: true
  namespace: tunecamp
`;
  }

  await fs.writeFile(path.join(releaseDir, 'release.yaml'), releaseYaml);

  // Generate README
  const t = getTranslations(state.language);
  const readme = `# ${state.catalog.title}

${state.catalog.description}

## ${t.summary.nextSteps}

1. ${state.language === 'it' ? 'Aggiungi i tuoi file audio in' : 'Add your audio files to'} \`releases/${releaseSlug}/tracks/\`
2. ${state.language === 'it' ? 'Aggiungi una copertina' : 'Add cover art'} (cover.jpg, cover.png)
3. ${state.language === 'it' ? 'Esegui' : 'Run'}: \`tunecamp build . -o public\`
4. ${state.language === 'it' ? 'Carica la cartella public sul tuo hosting' : 'Upload the public folder to your hosting'}

## ${state.language === 'it' ? 'Struttura' : 'Structure'}

\`\`\`
${slugify(state.catalog.title)}/
├── catalog.yaml
├── artist.yaml
├── README.md
└── releases/
    └── ${releaseSlug}/
        ├── release.yaml
        └── tracks/
            └── (${state.language === 'it' ? 'aggiungi qui i tuoi file audio' : 'add your audio files here'})
\`\`\`

## ${state.language === 'it' ? 'Documentazione' : 'Documentation'}

${state.language === 'it' ? 'Per maggiori informazioni, visita' : 'For more information, visit'}: https://github.com/scobru/tunecamp
`;
  await fs.writeFile(path.join(resolvedDir, 'README.md'), readme);
}

export default runWizard;
