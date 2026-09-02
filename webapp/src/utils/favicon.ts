/**
 * Browser-tab icon driven by the instance's own branding.
 *
 * index.html ships a static `<link rel="icon" href="/logo.svg">`, so every
 * instance showed the TuneCamp mark no matter what logo its admin uploaded —
 * a real problem for anyone keeping several instances open in one window.
 * Once the site settings arrive we repoint that link at `siteLogo`, falling
 * back to the bundled mark when no logo is set.
 */

/** The mark shipped in webapp/public, used until a site logo is configured. */
export const DEFAULT_FAVICON = "/logo.svg";

const MIME_BY_EXT: Record<string, string> = {
	svg: "image/svg+xml",
	png: "image/png",
	ico: "image/x-icon",
	gif: "image/gif",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	webp: "image/webp",
};

/**
 * Best-effort content type from the URL's extension. Returning null (unknown
 * extension, or a URL with no extension at all) is fine: the attribute is a
 * hint, and browsers sniff the response anyway. Guessing wrong is worse than
 * not guessing — Safari honours a mismatched `type` and drops the icon.
 */
function mimeFor(url: string): string | null {
	const withoutQuery = url.split(/[?#]/)[0];
	const lastSegment = withoutQuery.split("/").pop() || "";
	if (!lastSegment.includes(".")) return null;
	const ext = lastSegment.split(".").pop()?.toLowerCase();
	return (ext && MIME_BY_EXT[ext]) || null;
}

function iconLink(): HTMLLinkElement {
	let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
	if (!link) {
		link = document.createElement("link");
		link.rel = "icon";
		document.head.appendChild(link);
	}
	return link;
}

/**
 * Point the tab icon at `logoUrl`, or back at the bundled mark when it is
 * empty. `cacheBuster` is the app-wide asset version: pass it so a freshly
 * uploaded logo replaces the icon the browser already cached (0 — the initial
 * value — appends nothing, keeping the URL stable and cacheable).
 */
export function applyFavicon(
	logoUrl: string | null | undefined,
	cacheBuster = 0,
): void {
	const base = logoUrl?.trim() || DEFAULT_FAVICON;
	const isCustom = base !== DEFAULT_FAVICON;

	const href =
		isCustom && cacheBuster
			? `${base}${base.includes("?") ? "&" : "?"}v=${cacheBuster}`
			: base;

	const link = iconLink();
	if (link.getAttribute("href") === href) return;

	const type = mimeFor(base);
	if (type) {
		link.type = type;
	} else {
		link.removeAttribute("type");
	}

	link.href = href;
}
