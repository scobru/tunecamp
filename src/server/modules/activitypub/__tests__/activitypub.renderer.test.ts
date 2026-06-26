import { ActivityPubRenderer } from '../activitypub.renderer.js';

const BASE = 'https://site.test';
const renderer = new ActivityPubRenderer(BASE);
const artist = { slug: 'homologo', name: 'Homologo' } as any;

// Build a titleless post so renderPostArticle returns a Note whose `content` is
// exactly renderMarkdown(body) — the most direct view of the URL sanitizer.
function render(content: string): string {
    const note = renderer.renderPostArticle({ slug: 'p', content } as any, artist);
    return note.content as string;
}

describe('ActivityPubRenderer URL sanitizing (safeUrl)', () => {
    test('keeps a normal https link', () => {
        const html = render('[site](https://ok.test/p)');
        expect(html).toContain('href="https://ok.test/p"');
    });

    test('neutralizes javascript: links', () => {
        const html = render('[x](javascript:alert(1))');
        expect(html).not.toContain('javascript:');
        expect(html).toContain('href="#"');
    });

    test('rejects attribute-breakout urls carrying quotes/spaces', () => {
        const html = render('[x](a" onerror="alert(1))');
        expect(html).not.toContain('onerror');
        expect(html).toContain('href="#"');
    });

    test('allows site-relative and anchor links', () => {
        expect(render('[a](/releases/x)')).toContain('href="/releases/x"');
        expect(render('[b](#section)')).toContain('href="#section"');
    });

    test('allows mailto links', () => {
        expect(render('[m](mailto:a@b.test)')).toContain('href="mailto:a@b.test"');
    });

    test('scheme matching is case-insensitive', () => {
        expect(render('[c](HTTPS://OK.test/x)')).toContain('href="HTTPS://OK.test/x"');
    });

    test('rejects unknown schemes (e.g. data:)', () => {
        const html = render('[d](data:text/html,<script>)');
        expect(html).toContain('href="#"');
        expect(html).not.toContain('data:text/html');
    });
});

describe('ActivityPubRenderer actor (manuallyApprovesFollowers)', () => {
    test('sets manuallyApprovesFollowers true when the artist flag is on', () => {
        const actor = renderer.renderActor({ slug: 'a', name: 'A', manually_approves_followers: 1 } as any);
        expect(actor.manuallyApprovesFollowers).toBe(true);
    });

    test('defaults to false when the flag is absent or falsy', () => {
        expect(renderer.renderActor({ slug: 'a', name: 'A' } as any).manuallyApprovesFollowers).toBe(false);
        expect(renderer.renderActor({ slug: 'a', name: 'A', manually_approves_followers: 0 } as any).manuallyApprovesFollowers).toBe(false);
    });
});

describe('ActivityPubRenderer image handling', () => {
    test('extracts markdown images into attachments and strips them from the body', () => {
        const note = renderer.renderPostArticle(
            { slug: 'p', content: 'Hello ![a cat](https://ok.test/cat.png) world' } as any,
            artist,
        );

        // image moved to attachments, not rendered inline (Mastodon double-render fix)
        expect(note.attachment).toHaveLength(1);
        expect(note.attachment[0]).toMatchObject({ url: 'https://ok.test/cat.png', type: 'Document' });
        expect(note.content).not.toContain('<img');
        expect(note.content).not.toContain('![');
        expect(note.content).toContain('Hello');
        expect(note.content).toContain('world');
    });

    test('rewrites a relative image url to an absolute one in the attachment', () => {
        const note = renderer.renderPostArticle(
            { slug: 'p', content: '![logo](/img/logo.png)' } as any,
            artist,
        );
        expect(note.attachment[0].url).toBe(`${BASE}/img/logo.png`);
    });

    test('leaves the body untouched when there are no images', () => {
        const note = renderer.renderPostArticle(
            { slug: 'p', content: 'just **text**' } as any,
            artist,
        );
        expect(note.attachment).toBeUndefined();
        expect(note.content).toContain('<strong>text</strong>');
    });
});
