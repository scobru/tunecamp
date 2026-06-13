import * as cheerio from "cheerio";
import type { Cheerio } from "cheerio";
import type { AnyNode, Element } from "domhandler";
import type { DatabaseService } from "../../core/database.types.js";
import { isSafeUrl } from "../../../utils/networkUtils.js";

/**
 * RssService — follow plain RSS/Atom sources (podcasts, Owncast, blogs) as part
 * of the federation layer, alongside ActivityPub and TuneCamp peers.
 *
 * Design: a feed is modelled as a row in `remote_actors` (type = 'rss') and its
 * items as rows in `remote_content`, reusing the exact same tables and queries
 * the Network page already reads. Podcast items (those with an audio enclosure)
 * become playable `release` tracks; everything else becomes a `post`. No schema
 * migration and no new dependency — parsing uses cheerio (already a dep).
 */

const FETCH_TIMEOUT_MS = 10_000;
const MAX_ITEMS_PER_FEED = 50;
const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|flac|wav)(\?|$)/i;

export interface RssService {
    /** Validates, fetches and stores a feed as a followed source. Returns channel name + item count. */
    addFeed(url: string): Promise<{ name: string; items: number }>;
    /** Re-fetches one feed and upserts its items. Returns the number of items stored. */
    refreshFeed(url: string): Promise<number>;
    /** Re-fetches every followed RSS feed. Best-effort; never throws. */
    refreshAll(): Promise<void>;
    /** Stops following a feed (its content stays cached but hidden, mirroring AP unfollow). */
    removeFeed(url: string): void;
}

export function createRssService(db: DatabaseService): RssService {
    const fetchText = async (url: string): Promise<string | null> => {
        if (!(await isSafeUrl(url))) {
            console.warn(`⚠️ [RSS] Refusing to fetch unsafe URL: ${url}`);
            return null;
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
            const res = await fetch(url, {
                signal: controller.signal,
                redirect: "follow",
                headers: {
                    Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
                    "User-Agent": "TuneCamp-Federation/2.0",
                },
            });
            if (!res.ok) {
                console.warn(`⚠️ [RSS] ${url} returned ${res.status}`);
                return null;
            }
            return await res.text();
        } catch (e: any) {
            console.warn(`⚠️ [RSS] Failed to fetch ${url}: ${e?.message || e}`);
            return null;
        } finally {
            clearTimeout(timeout);
        }
    };

    return {
        async addFeed(url: string) {
            const feedUrl = url.trim();
            if (!/^https?:\/\//i.test(feedUrl)) {
                throw new Error("Feed URL must start with http(s)://");
            }
            const body = await fetchText(feedUrl);
            if (body === null) throw new Error("Could not fetch the feed (unreachable, blocked, or not XML).");

            // Accept either a direct feed URL or an HTML page that links to one
            // (autodiscovery via <link rel="alternate" type="application/rss+xml">).
            let parsed = parseFeed(body, feedUrl);
            let effectiveUrl = feedUrl;
            if (!parsed) {
                const discovered = discoverFeedUrl(body, feedUrl);
                if (discovered && discovered !== feedUrl) {
                    const xml = await fetchText(discovered);
                    if (xml !== null) {
                        const p = parseFeed(xml, discovered);
                        if (p) {
                            parsed = p;
                            effectiveUrl = discovered;
                        }
                    }
                }
            }
            if (!parsed) throw new Error("The URL did not return a valid RSS or Atom feed.");

            db.upsertRemoteActor({
                uri: effectiveUrl,
                type: "rss",
                username: null,
                name: parsed.channel.name || effectiveUrl,
                summary: parsed.channel.summary || null,
                icon_url: parsed.channel.icon || null,
                inbox_url: null,
                outbox_url: effectiveUrl,
                is_followed: true,
            });

            for (const item of parsed.items) {
                db.upsertRemoteContent(item);
            }
            console.log(`📡 [RSS] Followed "${parsed.channel.name}" (${parsed.items.length} items) — ${effectiveUrl}`);
            return { name: parsed.channel.name || effectiveUrl, items: parsed.items.length };
        },

        async refreshFeed(url: string) {
            const feedUrl = url.trim();
            const xml = await fetchText(feedUrl);
            if (xml === null) return 0;
            const parsed = parseFeed(xml, feedUrl);
            if (!parsed) return 0;

            // Keep channel metadata fresh without flipping the follow state.
            db.upsertRemoteActor({
                uri: feedUrl,
                type: "rss",
                username: null,
                name: parsed.channel.name || feedUrl,
                summary: parsed.channel.summary || null,
                icon_url: parsed.channel.icon || null,
                inbox_url: null,
                outbox_url: feedUrl,
            });

            for (const item of parsed.items) {
                db.upsertRemoteContent(item);
            }
            return parsed.items.length;
        },

        async refreshAll() {
            const feeds = db.getFollowedActors().filter((a) => a.type === "rss");
            for (const feed of feeds) {
                try {
                    const n = await this.refreshFeed(feed.uri);
                    console.log(`📡 [RSS] Refreshed ${feed.uri}: ${n} items`);
                } catch (e: any) {
                    console.error(`❌ [RSS] Refresh failed for ${feed.uri}: ${e?.message || e}`);
                }
            }
        },

        removeFeed(url: string) {
            db.unfollowActor(url.trim());
        },
    };
}

interface ParsedItem {
    ap_id: string;
    actor_uri: string;
    type: "release" | "post";
    title: string;
    content: string | null;
    url: string | null;
    cover_url: string | null;
    stream_url: string | null;
    artist_name: string | null;
    album_name: string | null;
    duration: number | null;
    published_at: string;
}

interface ParsedFeed {
    channel: { name: string; summary: string | null; icon: string | null };
    items: ParsedItem[];
}

/**
 * Parses an RSS 2.0 or Atom document into channel metadata + a normalized item
 * list. cheerio's CSS engine can't select namespaced tags (itunes:*, content:*),
 * so namespaced fields are read by walking direct children by tag name.
 */
function parseFeed(xml: string, feedUrl: string): ParsedFeed | null {
    let $: cheerio.CheerioAPI;
    try {
        $ = cheerio.load(xml, { xmlMode: true });
    } catch {
        return null;
    }

    const text = (node: Cheerio<AnyNode> | null): string =>
        node && node.length ? node.first().text().trim() : "";

    // First direct child of `scope` whose (namespace-aware) tag name matches.
    const childByTag = (scope: Cheerio<AnyNode>, ...tags: string[]): Cheerio<Element> | null => {
        const wanted = new Set(tags.map((t) => t.toLowerCase()));
        let hit: Element | null = null;
        scope.children().each((_, el) => {
            if (hit) return;
            const name = ((el as Element).tagName || (el as any).name || "").toLowerCase();
            if (wanted.has(name)) hit = el as Element;
        });
        return hit ? $(hit) : null;
    };

    const pickDuration = parseDurationLocal;

    const channelImageFrom = (scope: Cheerio<AnyNode>): string | null => {
        const itunesImg = childByTag(scope, "itunes:image");
        if (itunesImg?.attr("href")) return itunesImg.attr("href")!;
        const image = childByTag(scope, "image", "logo", "icon");
        if (!image) return null;
        if (image.attr("href")) return image.attr("href")!; // atom logo/icon as attr (rare)
        const urlChild = childByTag(image, "url");
        if (urlChild) return text(urlChild) || null;
        const t = text(image);
        return t || null;
    };

    const rssChannel = $("channel").first();
    const atomFeed = $("feed").first();

    if (rssChannel.length) {
        const channel = {
            name: text(childByTag(rssChannel, "title")) || feedUrl,
            summary: text(childByTag(rssChannel, "description", "itunes:summary")) || null,
            icon: channelImageFrom(rssChannel),
        };

        const items: ParsedItem[] = [];
        $("item").each((_, el) => {
            if (items.length >= MAX_ITEMS_PER_FEED) return;
            const item = $(el);

            const enclosure = childByTag(item, "enclosure");
            const enclosureUrl = enclosure?.attr("url") || null;
            const enclosureType = (enclosure?.attr("type") || "").toLowerCase();
            const isAudio = !!enclosureUrl && (enclosureType.startsWith("audio/") || AUDIO_EXT.test(enclosureUrl));

            const link = text(childByTag(item, "link"));
            const guid = text(childByTag(item, "guid")) || link;
            if (!guid) return;

            const itemImg = childByTag(item, "itunes:image");
            const cover = itemImg?.attr("href") || channel.icon || null;

            items.push({
                ap_id: guid,
                actor_uri: feedUrl,
                type: isAudio ? "release" : "post",
                title: text(childByTag(item, "title")) || "Untitled",
                content: text(childByTag(item, "content:encoded", "description", "summary")) || null,
                url: link || null,
                cover_url: cover,
                stream_url: isAudio ? enclosureUrl : null,
                artist_name: channel.name,
                album_name: channel.name,
                duration: pickDuration(text(childByTag(item, "itunes:duration"))),
                published_at: toIsoLocal(text(childByTag(item, "pubdate", "pubDate"))),
            });
        });

        return { channel, items };
    }

    if (atomFeed.length) {
        const channel = {
            name: text(childByTag(atomFeed, "title")) || feedUrl,
            summary: text(childByTag(atomFeed, "subtitle")) || null,
            icon: channelImageFrom(atomFeed),
        };

        const items: ParsedItem[] = [];
        $("entry").each((_, el) => {
            if (items.length >= MAX_ITEMS_PER_FEED) return;
            const entry = $(el);

            // Atom links: rel="enclosure" carries media; default/alternate carries the page.
            let pageLink: string | null = null;
            let enclosureUrl: string | null = null;
            let enclosureType = "";
            entry.children().each((__, c) => {
                const node = c as Element;
                if ((node.tagName || (node as any).name || "").toLowerCase() !== "link") return;
                const rel = ($(node).attr("rel") || "alternate").toLowerCase();
                const href = $(node).attr("href") || null;
                if (!href) return;
                if (rel === "enclosure") {
                    enclosureUrl = href;
                    enclosureType = ($(node).attr("type") || "").toLowerCase();
                } else if (!pageLink && (rel === "alternate" || rel === "self")) {
                    pageLink = href;
                }
            });
            const isAudio = !!enclosureUrl && (enclosureType.startsWith("audio/") || AUDIO_EXT.test(enclosureUrl));

            const id = text(childByTag(entry, "id")) || pageLink || enclosureUrl;
            if (!id) return;

            items.push({
                ap_id: id,
                actor_uri: feedUrl,
                type: isAudio ? "release" : "post",
                title: text(childByTag(entry, "title")) || "Untitled",
                content: text(childByTag(entry, "content", "summary")) || null,
                url: pageLink,
                cover_url: channel.icon,
                stream_url: isAudio ? enclosureUrl : null,
                artist_name: channel.name,
                album_name: channel.name,
                duration: null,
                published_at: toIsoLocal(text(childByTag(entry, "published", "updated"))),
            });
        });

        return { channel, items };
    }

    return null;
}

// Standalone copies so parseFeed (a free function) doesn't depend on closure helpers.
function parseDurationLocal(raw: string): number | null {
    const s = (raw || "").trim();
    if (!s) return null;
    if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s));
    const parts = s.split(":").map((p) => Number(p));
    if (parts.some((n) => Number.isNaN(n))) return null;
    return parts.reduce((acc, n) => acc * 60 + n, 0);
}

function toIsoLocal(raw: string): string {
    if (raw) {
        const t = Date.parse(raw);
        if (!Number.isNaN(t)) return new Date(t).toISOString();
    }
    return new Date().toISOString();
}

/**
 * Given an HTML page, finds a linked RSS/Atom feed via
 * <link rel="alternate" type="application/rss+xml|atom+xml" href="...">.
 * Returns an absolute URL or null.
 */
function discoverFeedUrl(html: string, baseUrl: string): string | null {
    if (!/<html[\s>]/i.test(html) && !/<link\b/i.test(html)) return null;
    try {
        const $ = cheerio.load(html); // HTML mode
        let href: string | null = null;
        $('link[rel="alternate"]').each((_, el) => {
            if (href) return;
            const type = ($(el).attr("type") || "").toLowerCase();
            if (type.includes("rss") || type.includes("atom") || type.includes("xml")) {
                href = $(el).attr("href") || null;
            }
        });
        if (!href) return null;
        return new URL(href, baseUrl).toString();
    } catch {
        return null;
    }
}
