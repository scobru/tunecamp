#!/usr/bin/env node

/**
 * Command-line interface for Tunecamp
 */

import { Command } from 'commander';
import { Tunecamp } from './index.js';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const program = new Command();

program
  .name('tunecamp')
  .description('Static site generator for musicians and labels')
  .version('0.1.0');

program
  .command('build')
  .description('Build a static site from catalog')
  .argument('<input>', 'Input directory containing catalog')
  .option('-o, --output <dir>', 'Output directory', './public')
  .option('-t, --theme <name>', 'Theme name (overrides catalog.yaml)')
  .option('-b, --basePath <path>', 'Base path for deployment (overrides catalog.yaml)')
  .option('-v, --verbose', 'Verbose output', false)
  .action(async (input: string, options: any) => {
    try {
      const generator = new Tunecamp({
        inputDir: path.resolve(input),
        outputDir: path.resolve(options.output),
        theme: options.theme,
        basePath: options.basePath,
        verbose: options.verbose,
      });
      
      await generator.build();
    } catch (error) {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Initialize a new catalog')
  .argument('<directory>', 'Directory to initialize')
  .action(async (directory: string) => {
    try {
      const targetDir = path.resolve(directory);
      
      if (await fs.pathExists(targetDir)) {
        const files = await fs.readdir(targetDir);
        if (files.length > 0) {
          console.error(chalk.red('Error: Directory is not empty'));
          process.exit(1);
        }
      }
      
      await initializeCatalog(targetDir);
      
      console.log(chalk.green('✅ Catalog initialized successfully!'));
      console.log(chalk.blue(`\nNext steps:`));
      console.log(`  cd ${directory}`);
      console.log(`  # Add your music files to releases/`);
      console.log(`  tunecamp build . -o public`);
    } catch (error) {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

program
  .command('serve')
  .description('Serve the generated site locally')
  .argument('[directory]', 'Directory to serve', './public')
  .option('-p, --port <port>', 'Port number', '3000')
  .action(async (directory: string, options: any) => {
    const http = await import('http');
    const fs = await import('fs');
    const path = await import('path');
    
    const port = parseInt(options.port);
    const dir = path.resolve(directory);
    
    const server = http.createServer((req, res) => {
      let filePath = path.join(dir, req.url === '/' ? 'index.html' : req.url!);
      
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        
        const ext = path.extname(filePath);
        const contentTypes: Record<string, string> = {
          '.html': 'text/html',
          '.css': 'text/css',
          '.js': 'text/javascript',
          '.json': 'application/json',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.svg': 'image/svg+xml',
          '.mp3': 'audio/mpeg',
          '.flac': 'audio/flac',
          '.ogg': 'audio/ogg',
          '.wav': 'audio/wav',
        };
        
        res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
        res.end(data);
      });
    });
    
    server.listen(port, () => {
      console.log(chalk.green(`🎵 Server running at http://localhost:${port}`));
      console.log(chalk.blue(`Serving: ${dir}`));
    });
  });

async function initializeCatalog(targetDir: string): Promise<void> {
  await fs.ensureDir(targetDir);
  
  // Create catalog.yaml
  const catalogYaml = `title: "My Music Catalog"
description: "Independent music releases"
url: "https://example.com"
basePath: "" # Leave empty for root deployment, use "/repo-name" for subdirectories
theme: "default"
language: "en"
`;
  await fs.writeFile(path.join(targetDir, 'catalog.yaml'), catalogYaml);
  
  // Create artist.yaml
  const artistYaml = `name: "Artist Name"
bio: "Write your biography here."
links:
  - website: "https://example.com"
  - bandcamp: "https://artistname.bandcamp.com"
`;
  await fs.writeFile(path.join(targetDir, 'artist.yaml'), artistYaml);
  
  // Create releases directory with example
  const exampleReleaseDir = path.join(targetDir, 'releases', 'example-album');
  await fs.ensureDir(path.join(exampleReleaseDir, 'tracks'));
  
  const releaseYaml = `title: "Example Album"
date: "${new Date().toISOString().split('T')[0]}"
description: "An amazing album"
download: "free"
genres:
  - "Electronic"
  - "Experimental"
`;
  await fs.writeFile(path.join(exampleReleaseDir, 'release.yaml'), releaseYaml);
  
  // Create README
  const readme = `# My Music Catalog

This is your Tunecamp catalog.

## Structure

- \`catalog.yaml\` - Main catalog configuration
- \`artist.yaml\` - Artist information
- \`releases/\` - Your music releases
  - Each subdirectory is a release
  - Add \`release.yaml\` to configure each release
  - Add audio files and cover art

## Usage

1. Add your music files to \`releases/your-album-name/tracks/\`
2. Add cover art (cover.jpg, cover.png, etc.)
3. Configure \`release.yaml\` for each album
4. Build: \`tunecamp build . -o public\`
5. Deploy the \`public\` folder

## Documentation

See https://github.com/scobru/tunecamp for full documentation.
`;
  await fs.writeFile(path.join(targetDir, 'README.md'), readme);
}

program.parse();

