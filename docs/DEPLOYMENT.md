# Deployment Guide

This guide explains how to deploy your Tunecamp site to various hosting platforms and configure the correct base paths.

## Table of Contents

- [Understanding Base Paths](#understanding-base-paths)
- [Configuration](#configuration)
- [Platform-Specific Guides](#platform-specific-guides)
  - [GitHub Pages](#github-pages)
  - [Netlify](#netlify)
  - [Vercel](#vercel)
  - [Custom Server](#custom-server)
- [Troubleshooting](#troubleshooting)

## Understanding Base Paths

When you deploy a static site, it can be served from different locations:

1. **Root of a domain**: `https://mymusic.com/`
2. **Subdirectory**: `https://username.github.io/my-music/`

The `basePath` configuration tells Shogun Faircamp where your site will be located, ensuring that all asset references (CSS, JavaScript, images, audio files) use the correct paths.

### How It Works

Without `basePath` configuration, all assets use absolute paths from the root:

```html
<link rel="stylesheet" href="/assets/style.css">
<a href="/index.html">Home</a>
<script src="/assets/player.js"></script>
```

These paths work fine if your site is at `https://mymusic.com/` but will fail if deployed to `https://username.github.io/my-music/` because the browser will look for files at:

- `https://username.github.io/assets/style.css` ❌ (Wrong!)
- Instead of `https://username.github.io/my-music/assets/style.css` ✓ (Correct!)

With `basePath: "/my-music"`, the generated HTML becomes:

```html
<link rel="stylesheet" href="/my-music/assets/style.css">
<a href="/my-music/index.html">Home</a>
<script src="/my-music/assets/player.js"></script>
```

## Configuration

### Option 1: In catalog.yaml

Set the `basePath` in your `catalog.yaml` file:

```yaml
title: "My Music Catalog"
description: "Independent music releases"
url: "https://mymusic.com"
basePath: "" # or "/my-music" for subdirectory deployment
theme: "default"
language: "en"
```

### Option 2: CLI Override

Override the `basePath` at build time using the `--basePath` flag:

```bash
shogun-faircamp build ./my-catalog --output ./public --basePath /my-music
```

This is useful for:
- Testing different deployment paths
- CI/CD pipelines where the path might vary
- Building for multiple environments

### Base Path Values

| Deployment Type | basePath Value | Example URL |
|----------------|----------------|-------------|
| Root domain | `""` (empty) or omit | `https://mymusic.com/` |
| Subdirectory | `"/subdirectory"` | `https://example.com/music/` |
| GitHub Pages (project) | `"/repo-name"` | `https://user.github.io/repo-name/` |
| GitHub Pages (user) | `""` (empty) | `https://user.github.io/` |

**Important**: Always start with a forward slash (`/`) and never end with one.

✓ Correct: `basePath: "/my-music"`  
✗ Wrong: `basePath: "my-music"` or `basePath: "/my-music/"`

## Platform-Specific Guides

### GitHub Pages

#### Project Site (username.github.io/repository-name/)

1. **Configure basePath** in `catalog.yaml`:
   ```yaml
   basePath: "/repository-name"
   ```

2. **Build your site**:
   ```bash
   shogun-faircamp build . --output ./public
   ```

3. **Deploy**:
   - Push the `public` folder to the `gh-pages` branch, or
   - Configure GitHub Pages to serve from the `main` branch `/docs` folder

**Example workflow**:

```bash
# Build the site
shogun-faircamp build ./my-catalog --output ./docs --basePath /my-music-catalog

# Commit and push
git add docs/
git commit -m "Update site"
git push origin main
```

Then configure GitHub Pages to serve from `/docs` on the main branch.

#### User/Organization Site (username.github.io/)

For user or organization sites, deploy to the root:

```yaml
basePath: ""
```

Build and deploy to the `main` branch of your `username.github.io` repository.

### Netlify

#### Custom Domain

If you're using a custom domain (e.g., `mymusic.com`), use root deployment:

1. **Configure basePath**:
   ```yaml
   basePath: ""
   ```

2. **Build command**: `shogun-faircamp build . --output ./public`

3. **Publish directory**: `public`

#### Subdirectory Deployment

If deploying to a subdirectory:

```yaml
basePath: "/music"
```

Configure your Netlify settings accordingly.

### Vercel

Similar to Netlify, Vercel deployments typically use root paths with custom domains:

1. **Configure basePath**:
   ```yaml
   basePath: ""
   ```

2. **Build command**: `shogun-faircamp build . --output ./public`

3. **Output directory**: `public`

### Custom Server

If you're deploying to your own server:

1. **Root deployment** (e.g., Apache/Nginx serving from `/var/www/html`):
   ```yaml
   basePath: ""
   ```

2. **Subdirectory** (e.g., serving from `/var/www/html/music`):
   ```yaml
   basePath: "/music"
   ```

Make sure your web server is configured to serve static files from the correct directory.

## Troubleshooting

### Styles and scripts not loading

**Symptom**: The site loads but has no styling, and the player doesn't work.

**Cause**: Incorrect `basePath` configuration.

**Solution**:
1. Open the browser's developer console (F12)
2. Check the Network tab for 404 errors on CSS/JS files
3. Compare the requested paths with your actual deployment path
4. Adjust the `basePath` accordingly

**Example**:
- If the browser requests `/assets/style.css` but you're deployed at `/my-music/`
- Set `basePath: "/my-music"` and rebuild

### Audio files not playing

**Symptom**: The player appears but audio files don't play.

**Cause**: Same as above - incorrect paths to audio files.

**Solution**: Same as above - fix the `basePath`.

### Links broken after deployment

**Symptom**: Clicking links returns 404 errors.

**Cause**: The `path` helper is not being used consistently in custom templates.

**Solution**: If you've created custom templates, ensure all internal links use the `{{path "url"}}` helper:

```handlebars
<!-- Correct -->
<a href="{{path "index.html"}}">Home</a>
<link rel="stylesheet" href="{{path "assets/style.css"}}">

<!-- Wrong -->
<a href="/index.html">Home</a>
<link rel="stylesheet" href="/assets/style.css">
```

### Testing locally with different base paths

To test how your site will look when deployed to a subdirectory:

```bash
# Build with the deployment basePath
shogun-faircamp build . --output ./public --basePath /my-music

# Serve with a simple HTTP server
cd public
python -m http.server 8000

# Visit http://localhost:8000/my-music/ in your browser
```

Note: You'll need to navigate to `http://localhost:8000/my-music/` (with the base path) to see the site correctly.

### CI/CD Example (GitHub Actions)

Here's an example GitHub Actions workflow for automated deployment:

```yaml
name: Deploy Site

on:
  push:
    branches: [ main ]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install Shogun Faircamp
        run: npm install -g shogun-faircamp
      
      - name: Build site
        run: shogun-faircamp build . --output ./public --basePath /my-music-repo
      
      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./public
```

## Best Practices

1. **Use catalog.yaml for permanent configuration**: Set `basePath` in your `catalog.yaml` if you know the final deployment path.

2. **Use CLI flag for flexibility**: Use `--basePath` in CI/CD or when testing different deployment scenarios.

3. **Test before deploying**: Always test your site locally with the correct base path before deploying.

4. **Document your deployment path**: Add a comment in your `catalog.yaml` or README explaining why a specific `basePath` is used.

5. **Keep it simple**: If possible, deploy to the root of a domain to avoid base path complications entirely.

## Migration Guide

If you have an existing Shogun Faircamp site that was generated before the `basePath` feature:

1. **Determine your deployment path**: Where is your site currently deployed?
   - Root domain: Leave `basePath` empty or omit it
   - Subdirectory: Add the appropriate `basePath`

2. **Update catalog.yaml**:
   ```yaml
   basePath: "/your-path"  # or "" for root
   ```

3. **Rebuild**:
   ```bash
   shogun-faircamp build . --output ./public
   ```

4. **Redeploy**: Upload the new `public` folder to your hosting service.

5. **Verify**: Check that all assets load correctly by opening the browser console and checking for 404 errors.

## Need Help?

If you're still having trouble with deployment:

1. Check the [GitHub Issues](https://github.com/yourusername/shogun-faircamp/issues)
2. Review the [Examples](../examples/) directory for reference configurations
3. Open a new issue with:
   - Your `catalog.yaml` configuration
   - The deployment platform you're using
   - Any error messages from the browser console

