import { describe, it, expect, beforeEach } from "vitest";
import { applyFavicon, DEFAULT_FAVICON } from "./favicon";

const link = () =>
	document.querySelector<HTMLLinkElement>('link[rel~="icon"]');

describe("applyFavicon", () => {
	beforeEach(() => {
		document.head.innerHTML =
			'<link rel="icon" type="image/svg+xml" href="/logo.svg" />';
	});

	it("points the existing icon link at the site logo", () => {
		applyFavicon("/api/assets/site-logo.png");
		expect(link()?.getAttribute("href")).toBe("/api/assets/site-logo.png");
		expect(link()?.getAttribute("type")).toBe("image/png");
	});

	it("falls back to the bundled mark when no logo is set", () => {
		applyFavicon("/api/assets/site-logo.png");
		applyFavicon("");
		expect(link()?.getAttribute("href")).toBe(DEFAULT_FAVICON);
		expect(link()?.getAttribute("type")).toBe("image/svg+xml");
	});

	it("treats a whitespace-only logo as unset", () => {
		applyFavicon("   ");
		expect(link()?.getAttribute("href")).toBe(DEFAULT_FAVICON);
	});

	it("drops a stale type rather than mislabelling an unknown extension", () => {
		applyFavicon("/api/settings/logo");
		expect(link()?.getAttribute("href")).toBe("/api/settings/logo");
		expect(link()?.hasAttribute("type")).toBe(false);
	});

	it("appends the cache buster to a custom logo only", () => {
		applyFavicon("/logo-a.png", 42);
		expect(link()?.getAttribute("href")).toBe("/logo-a.png?v=42");

		applyFavicon("/logo-b.png?w=64", 42);
		expect(link()?.getAttribute("href")).toBe("/logo-b.png?w=64&v=42");

		applyFavicon(null, 42);
		expect(link()?.getAttribute("href")).toBe(DEFAULT_FAVICON);
	});

	it("leaves the URL stable while the cache buster is at its initial 0", () => {
		applyFavicon("/logo-a.png", 0);
		expect(link()?.getAttribute("href")).toBe("/logo-a.png");
	});

	it("creates an icon link when the document has none", () => {
		document.head.innerHTML = "";
		applyFavicon("/logo-a.svg");
		expect(link()?.getAttribute("href")).toBe("/logo-a.svg");
		expect(link()?.getAttribute("type")).toBe("image/svg+xml");
	});
});
