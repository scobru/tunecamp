/**
 * Dynamic theme-font loading.
 *
 * The previous implementation hard-coded `wght@100..900` for every font. That
 * range is only valid for a few families (Outfit, Inter, Montserrat). For
 * fonts with a narrower axis — e.g. Playfair Display (400–900) or Lora
 * (400–700) — Google Fonts answers the css2 request with `400 Bad Request`,
 * so the stylesheet never loads and the page silently falls back to
 * sans-serif. We request a discrete set of weights that every font offered in
 * the settings dropdown supports.
 */
const SAFE_WEIGHTS = "wght@400;500;600;700";

/** Fonts that are bundled/loaded statically and need no Google Fonts request. */
const STATIC_FONTS = new Set(["Outfit", "sans-serif", "JetBrains Mono"]);

const FONT_LINK_ID = "dynamic-google-font";

/**
 * Ensure the Google Fonts stylesheet for `font` is present (no-op for fonts we
 * already bundle), then point `--font-sans` at it so Tailwind's `font-sans`
 * utility picks it up app-wide.
 */
export function applyThemeFont(font: string | undefined | null): void {
    const family = font || "Outfit";

    if (!STATIC_FONTS.has(family)) {
        let linkElement = document.getElementById(FONT_LINK_ID) as HTMLLinkElement | null;
        if (!linkElement) {
            linkElement = document.createElement("link");
            linkElement.id = FONT_LINK_ID;
            linkElement.rel = "stylesheet";
            document.head.appendChild(linkElement);
        }
        const fontQuery = family.replace(/\s+/g, "+");
        linkElement.href = `https://fonts.googleapis.com/css2?family=${fontQuery}:${SAFE_WEIGHTS}&display=swap`;
    }

    document.documentElement.style.setProperty("--font-sans", `"${family}", sans-serif`);
}
