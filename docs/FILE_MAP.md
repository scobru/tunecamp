# File Map

## Root Directory
-   `src/`: TypeScript source code.
-   `webapp/`: Frontend static assets (JS, CSS, HTML).
-   `templates/`: Handlebars themes.
-   `docs/`: Project documentation.
-   `examples/`: Sample catalogs.
-   `dist/`: Compiled JavaScript output.

## `src/` - Source Code
-   `cli.ts`: Main entry point for the CLI tool.
-   `index.ts`: Library exports.
-   `generator/`: Static site generation logic.
    -   `index.ts`: Main generator orchestrator.
-   `server/`: Server mode implementation.
    -   `server.ts`: Express server setup.
    -   `activitypub.ts`: Federation logic.
    -   `database.ts`: Database connection/logic.
    -   `routes/`: API and page routes.
        -   `posts.ts`: Custom posts API.
        -   `backup.ts`: Backup system logic.
-   `studio/`: Admin interface logic.
-   `gleam/`: Gleam source code.
-   `gleam_generated/`: Compiled Gleam JS interface.
-   `utils/`: Shared helper functions.

## `webapp/` - Web Application
-   `index.html`: Main entry point for the web app (SPA).
-   `js/`: Client-side JavaScript.
    -   `app.js`: Main application logic.
-   `css/`: Stylesheets.
    -   `style.css`: Main styles.

## `templates/` - Themes
-   `default/`: The default theme.
    -   `index.hbs`: Homepage template.
    -   `release.hbs`: Release page template.
    -   `layout.hbs`: Base layout.
    -   `assets/`: Theme-specific assets.
