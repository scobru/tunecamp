import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { createDatabase } from '../../core/database.js';
import { RemoteContentRepository } from '../remote-content.repository.js';

function remoteContentInput(overrides: Record<string, any> = {}) {
    return {
        ap_id: 'ap1',
        actor_uri: 'actor1',
        type: 'release',
        title: 'Title',
        content: 'Content',
        url: 'http://url',
        cover_url: 'http://cover',
        stream_url: 'http://stream',
        artist_name: 'Artist',
        album_name: 'Album',
        duration: 100,
        published_at: '2023-01-01',
        ...overrides
    } as any;
}

describe('RemoteContentRepository', () => {
    let db: any;
    let repo: RemoteContentRepository;

    beforeEach(() => {
        db = createDatabase(':memory:');
        repo = new RemoteContentRepository(db.db);
        db.db.exec(`
            INSERT INTO remote_actors (uri, type, is_followed) VALUES ('actor1', 'Person', 1);
            INSERT INTO remote_actors (uri, type, is_followed) VALUES ('actor2', 'Person', 0);
        `);
    });

    afterEach(() => {
        if (db && db.db) db.db.close();
    });

    describe('upsertRemoteContentsBatch', () => {
        test('inserts multiple contents', () => {
            repo.upsertRemoteContentsBatch([
                remoteContentInput({ ap_id: 'track1' }),
                remoteContentInput({ ap_id: 'track2', actor_uri: 'actor2' })
            ]);
            expect(repo.getRemoteContent('track1')).toBeDefined();
            expect(repo.getRemoteContent('track2')).toBeDefined();
        });

        test('does nothing with empty array', () => {
            repo.upsertRemoteContentsBatch([]);
            // No error should be thrown
        });

        test('updates existing content', () => {
            repo.upsertRemoteContentsBatch([remoteContentInput({ ap_id: 'track1', title: 'Old' })]);
            repo.upsertRemoteContentsBatch([remoteContentInput({ ap_id: 'track1', title: 'New' })]);
            expect(repo.getRemoteContent('track1')?.title).toBe('New');
        });
    });

    describe('upsertRemoteContent', () => {
        test('inserts a single content', () => {
            repo.upsertRemoteContent(remoteContentInput({ ap_id: 'single1' }));
            expect(repo.getRemoteContent('single1')?.ap_id).toBe('single1');
        });

        test('updates existing content', () => {
            repo.upsertRemoteContent(remoteContentInput({ ap_id: 'single1', title: 'Old' }));
            repo.upsertRemoteContent(remoteContentInput({ ap_id: 'single1', title: 'New' }));
            expect(repo.getRemoteContent('single1')?.title).toBe('New');
        });
    });

    describe('getRemoteContent', () => {
        test('returns content by ap_id', () => {
            repo.upsertRemoteContent(remoteContentInput({ ap_id: 'get1' }));
            expect(repo.getRemoteContent('get1')?.ap_id).toBe('get1');
        });

        test('returns undefined for non-existent ap_id', () => {
            expect(repo.getRemoteContent('missing')).toBeUndefined();
        });
    });

    describe('getRemoteTracks', () => {
        test('returns release contents from followed actors', () => {
            repo.upsertRemoteContentsBatch([
                remoteContentInput({ ap_id: 't1', type: 'release', actor_uri: 'actor1' }), // Followed
                remoteContentInput({ ap_id: 't2', type: 'release', actor_uri: 'actor2' }), // Not followed
                remoteContentInput({ ap_id: 't3', type: 'post', actor_uri: 'actor1' }) // Not a release
            ]);
            const tracks = repo.getRemoteTracks();
            expect(tracks.length).toBe(1);
            expect(tracks[0].ap_id).toBe('t1');
            expect(tracks[0]).toHaveProperty('actor_type', 'Person');
        });
    });

    describe('getRemotePosts', () => {
        test('returns post contents', () => {
            repo.upsertRemoteContentsBatch([
                remoteContentInput({ ap_id: 'p1', type: 'post', actor_uri: 'actor1' }),
                remoteContentInput({ ap_id: 'p2', type: 'post', actor_uri: 'actor2' }),
                remoteContentInput({ ap_id: 'p3', type: 'release', actor_uri: 'actor1' })
            ]);
            const posts = repo.getRemotePosts();
            expect(posts.length).toBe(2);
            expect(posts.map(p => p.ap_id).sort()).toEqual(['p1', 'p2']);
        });
    });

    describe('getRemoteTrack', () => {
        test('finds by ap_id', () => {
            repo.upsertRemoteContent(remoteContentInput({ ap_id: 'find1', url: 'http://find1' }));
            expect(repo.getRemoteTrack('find1')?.ap_id).toBe('find1');
        });

        test('finds by url suffix (slug)', () => {
            repo.upsertRemoteContent(remoteContentInput({ ap_id: 'find2', url: 'http://find2' }));
            expect(repo.getRemoteTrack('find2')?.ap_id).toBe('find2');
        });
    });

    describe('saveRemotePost', () => {
        test('inserts a post with defaults', () => {
            repo.saveRemotePost({ ap_id: 'sp1', actor_uri: 'actor1' });
            const post = repo.getRemoteContent('sp1');
            expect(post).toBeDefined();
            expect(post?.type).toBe('post');
        });

        test('updates an existing post', () => {
            repo.saveRemotePost({ ap_id: 'sp2', actor_uri: 'actor1', title: 'Old' });
            repo.saveRemotePost({ ap_id: 'sp2', actor_uri: 'actor1', title: 'New' });
            expect(repo.getRemoteContent('sp2')?.title).toBe('New');
        });
    });

    describe('deleteRemotePost', () => {
        test('deletes a post', () => {
            repo.saveRemotePost({ ap_id: 'dp1', actor_uri: 'actor1' });
            repo.deleteRemotePost('dp1');
            expect(repo.getRemoteContent('dp1')).toBeUndefined();
        });
    });

    describe('deleteRemoteContent', () => {
        test('deletes content', () => {
            repo.upsertRemoteContent(remoteContentInput({ ap_id: 'dc1' }));
            repo.deleteRemoteContent('dc1');
            expect(repo.getRemoteContent('dc1')).toBeUndefined();
        });
    });

    describe('deleteRemoteContentByActorPrefix', () => {
        test('deletes content matching actor prefix', () => {
            repo.upsertRemoteContentsBatch([
                remoteContentInput({ ap_id: 'prefix1', actor_uri: 'https://example.com/users/a' }),
                remoteContentInput({ ap_id: 'prefix2', actor_uri: 'https://example.com/users/b' }),
                remoteContentInput({ ap_id: 'prefix3', actor_uri: 'https://other.com/users/a' })
            ]);
            const changes = repo.deleteRemoteContentByActorPrefix('https://example.com');
            expect(changes).toBe(2);
            expect(repo.getRemoteContent('prefix1')).toBeUndefined();
            expect(repo.getRemoteContent('prefix2')).toBeUndefined();
            expect(repo.getRemoteContent('prefix3')).toBeDefined();
        });
    });
});
