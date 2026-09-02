import type { Database as DatabaseType, Statement } from "better-sqlite3";
import type { Artist } from "../core/database.types.js";
import { VisibilityProfile, ViewerContext, UserRole, getContextFromProfile } from "../common/visibility.js";

export class ArtistRepository {
    private getArtistStmt: Statement;
    private getArtistSimpleStmt: Statement;
    private getArtistBySlugStmt: Statement;
    private getArtistByNameStmt: Statement;

    constructor(protected db: DatabaseType) {
        const baseSelect = `
            SELECT a.*, a.wallet_address as walletAddress,
            (CASE WHEN EXISTS (SELECT 1 FROM admin WHERE artist_id = a.id)
                  OR EXISTS (SELECT 1 FROM releases WHERE artist_id = a.id)
                  OR EXISTS (SELECT 1 FROM albums WHERE artist_id = a.id AND is_release = 1)
                  THEN 0 ELSE 1 END) as isLibraryArtist
            FROM artists a
        `;

        this.getArtistStmt = this.db.prepare(`${baseSelect} WHERE a.id = ?`);
        this.getArtistSimpleStmt = this.db.prepare(`SELECT a.*, a.wallet_address as walletAddress FROM artists a WHERE a.id = ?`);
        this.getArtistBySlugStmt = this.db.prepare(`${baseSelect} WHERE a.slug = ?`);
        this.getArtistByNameStmt = this.db.prepare(`${baseSelect} WHERE a.name = ? COLLATE NOCASE`);
    }

    private mapArtist(row: any): Artist | undefined {
        if (!row) return undefined;
        let links = [];
        try {
            const parsed = row.links ? JSON.parse(row.links) : [];
            links = Array.isArray(parsed) ? parsed : [];
        } catch (e: any) {
            console.warn(`⚠️ [ArtistRepository] Failed to parse links for artist ${row.id}:`, e.message);
            links = [];
        }

        let post_params = {};
        try {
            const parsed = row.post_params ? JSON.parse(row.post_params) : {};
            post_params = (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
        } catch (e: any) {
            console.warn(`⚠️ [ArtistRepository] Failed to parse post_params for artist ${row.id}:`, e.message);
            post_params = {};
        }

        let also_known_as = [];
        try {
            const parsed = row.also_known_as ? JSON.parse(row.also_known_as) : [];
            also_known_as = Array.isArray(parsed) ? parsed : [];
        } catch (e: any) {
            console.warn(`⚠️ [ArtistRepository] Failed to parse also_known_as for artist ${row.id}:`, e.message);
            also_known_as = [];
        }

        return {
            ...row,
            isLibraryArtist: !!row.isLibraryArtist,
            hasLinkedUser: !!row.hasLinkedUser,
            links,
            post_params,
            also_known_as
        } as Artist;
    }

    private ensureSiteActor(): void {
        const hasSiteActor = this.db.prepare("SELECT 1 FROM artists WHERE id = -1").get();
        if (hasSiteActor) return;
        console.log("📡 [Database] Self-healing: Re-creating virtual artist record for Site Actor...");
        const pubKey = this.db.prepare("SELECT value FROM settings WHERE key = 'site_public_key'").get() as { value: string } | undefined;
        const privKey = this.db.prepare("SELECT value FROM settings WHERE key = 'site_private_key'").get() as { value: string } | undefined;
        const siteSlug = (this.db.prepare("SELECT value FROM settings WHERE key = 'siteHandle'").get() as { value: string } | undefined)?.value || 'site';
        const siteActorName = (this.db.prepare("SELECT value FROM settings WHERE key = 'siteName'").get() as { value: string } | undefined)?.value || 'Site';
        // The site actor's slug and name are reserved (both columns are UNIQUE);
        // free them from any library artist holding them so this insert doesn't
        // crash with SQLITE_CONSTRAINT_UNIQUE.
        const collidingSlugArtist = this.db.prepare("SELECT id FROM artists WHERE slug = ? AND id != -1").get(siteSlug) as { id: number } | undefined;
        if (collidingSlugArtist) {
            let fallbackSlug = `${siteSlug}-artist`;
            let n = 2;
            while (this.db.prepare("SELECT 1 FROM artists WHERE slug = ?").get(fallbackSlug)) {
                fallbackSlug = `${siteSlug}-artist-${n++}`;
            }
            this.db.prepare("UPDATE artists SET slug = ? WHERE id = ?").run(fallbackSlug, collidingSlugArtist.id);
        }
        const collidingNameArtist = this.db.prepare("SELECT id FROM artists WHERE name = ? AND id != -1").get(siteActorName) as { id: number } | undefined;
        if (collidingNameArtist) {
            let fallbackName = `${siteActorName} (Artist)`;
            let n = 2;
            while (this.db.prepare("SELECT 1 FROM artists WHERE name = ?").get(fallbackName)) {
                fallbackName = `${siteActorName} (Artist ${n++})`;
            }
            this.db.prepare("UPDATE artists SET name = ? WHERE id = ?").run(fallbackName, collidingNameArtist.id);
        }
        this.db.prepare("INSERT INTO artists (id, name, slug, visibility, public_key, private_key) VALUES (-1, ?, ?, 'public', ?, ?)")
          .run(siteActorName, siteSlug, pubKey ? pubKey.value : null, privKey ? privKey.value : null);
    }

    getById(id: number): Artist | undefined {
        if (id === -1) this.ensureSiteActor();
        const row = this.getArtistStmt.get(id);
        return this.mapArtist(row);
    }

    getByIdSimple(id: number): Artist | undefined {
        if (id === -1) this.ensureSiteActor();
        const row = this.getArtistSimpleStmt.get(id);
        return this.mapArtist(row);
    }

    getBySlug(slug: string): Artist | undefined {
        const row = this.getArtistBySlugStmt.get(slug);
        return this.mapArtist(row);
    }

    getByName(name: string): Artist | undefined {
        const row = this.getArtistByNameStmt.get(name);
        return this.mapArtist(row);
    }

    getAll(profile?: VisibilityProfile | ViewerContext): Artist[] {
        const context = getContextFromProfile(profile);
        const publicOnly = context.role === UserRole.GUEST;
        const baseSql = `
            SELECT a.*, a.wallet_address as walletAddress,
            (CASE WHEN EXISTS (SELECT 1 FROM admin WHERE artist_id = a.id)
                  OR EXISTS (SELECT 1 FROM releases WHERE artist_id = a.id)
                  OR EXISTS (SELECT 1 FROM albums WHERE artist_id = a.id AND is_release = 1)
                  THEN 0 ELSE 1 END) as isLibraryArtist,
            (CASE WHEN EXISTS (SELECT 1 FROM admin WHERE artist_id = a.id) THEN 1 ELSE 0 END) as hasLinkedUser
            FROM artists a
        `;
        const sql = publicOnly 
            ? `${baseSql} WHERE a.visibility IN ('public', 'unlisted') ORDER BY a.name`
            : `${baseSql} ORDER BY a.name`;
            
        const rows = this.db.prepare(sql).all();
        return rows.map(row => this.mapArtist(row)) as Artist[];
    }

    getArtistsByNames(names: string[]): Artist[] {
        if (names.length === 0) return [];
        const uniqueNames = [...new Set(names)];
        let allArtists: Artist[] = [];
        const CHUNK_SIZE = 900;

        for (let i = 0; i < uniqueNames.length; i += CHUNK_SIZE) {
            const chunk = uniqueNames.slice(i, i + CHUNK_SIZE);
            const placeholders = chunk.map(() => "?").join(",");
            const sql = `
                SELECT a.*, a.wallet_address as walletAddress,
                (CASE WHEN EXISTS (SELECT 1 FROM admin WHERE artist_id = a.id)
                      OR EXISTS (SELECT 1 FROM releases WHERE artist_id = a.id)
                      OR EXISTS (SELECT 1 FROM albums WHERE artist_id = a.id AND is_release = 1)
                      THEN 0 ELSE 1 END) as isLibraryArtist
                FROM artists a WHERE a.name COLLATE NOCASE IN (${placeholders})
            `;
            const rows = this.db.prepare(sql).all(...chunk);
            allArtists = allArtists.concat(rows.map(row => this.mapArtist(row)) as Artist[]);
        }
        return allArtists;
    }


    getByIds(ids: number[]): Artist[] {
        if (ids.length === 0) return [];
        const placeholders = ids.map(() => "?").join(",");
        const sql = `
            SELECT a.*, a.wallet_address as walletAddress,
            (CASE WHEN EXISTS (SELECT 1 FROM admin WHERE artist_id = a.id)
                  OR EXISTS (SELECT 1 FROM releases WHERE artist_id = a.id)
                  OR EXISTS (SELECT 1 FROM albums WHERE artist_id = a.id AND is_release = 1)
                  THEN 0 ELSE 1 END) as isLibraryArtist
            FROM artists a WHERE a.id IN (${placeholders})
        `;
        const rows = this.db.prepare(sql).all(...ids);
        return rows.map(row => this.mapArtist(row)) as Artist[];
    }

    create(name: string, bio?: string, photoPath?: string, links?: any, postParams?: any, walletAddress?: string, visibility: 'public' | 'private' | 'unlisted' = 'private', externalId?: string): number {
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "artist";
        const linksJson = links ? JSON.stringify(links) : null;
        const postParamsJson = postParams ? JSON.stringify(postParams) : null;
        let finalSlug = slug;
        let attempt = 0;
        while (attempt < 100) {
            try {
                const result = this.db
                    .prepare("INSERT INTO artists (name, slug, bio, photo_path, links, post_params, wallet_address, visibility, external_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
                    .run(name, finalSlug, bio || null, photoPath || null, linksJson, postParamsJson, walletAddress || null, visibility, externalId || null);
                return result.lastInsertRowid as number;
            } catch (e: any) {
                if (e.code === "SQLITE_CONSTRAINT_UNIQUE" && e.message.includes("slug")) {
                    attempt++;
                    finalSlug = `${slug}-${attempt}`;
                } else if (e.code === "SQLITE_CONSTRAINT_UNIQUE" && e.message.includes("name")) {
                    // Name already taken (case/whitespace mismatch vs the NOCASE lookup,
                    // or a concurrent create). Treat as create-or-get: return the existing row.
                    const existing = this.getByName(name);
                    if (existing) return existing.id;
                    throw e;
                } else {
                    throw e;
                }
            }
        }
        throw new Error("Could not create unique slug for artist");
    }

    update(id: number, name?: string, bio?: string, photoPath?: string, links?: any, postParams?: any, walletAddress?: string, visibility?: 'public' | 'private' | 'unlisted', manuallyApprovesFollowers?: boolean): void {
        const linksJson = links ? JSON.stringify(links) : undefined;
        const postParamsJson = postParams ? JSON.stringify(postParams) : undefined;
        const maf = manuallyApprovesFollowers !== undefined ? (manuallyApprovesFollowers ? 1 : 0) : undefined;
        this.db.prepare(`
            UPDATE artists SET
                name = COALESCE(?, name),
                bio = COALESCE(?, bio),
                photo_path = COALESCE(?, photo_path),
                links = COALESCE(?, links),
                post_params = COALESCE(?, post_params),
                wallet_address = COALESCE(?, wallet_address),
                visibility = COALESCE(?, visibility),
                manually_approves_followers = COALESCE(?, manually_approves_followers)
            WHERE id = ?
        `).run(name ?? null, bio ?? null, photoPath ?? null, linksJson ?? null, postParamsJson ?? null, walletAddress ?? null, visibility ?? null, maf ?? null, id);
    }

    updateBanner(id: number, bannerPath: string | null): void {
        this.db.prepare("UPDATE artists SET banner_path = ? WHERE id = ?").run(bannerPath, id);
    }

    updateKeys(id: number, publicKey: string, privateKey: string): void {
        this.db.prepare("UPDATE artists SET public_key = ?, private_key = ? WHERE id = ?").run(publicKey, privateKey, id);
    }

    setCanSell(id: number, canSell: boolean): void {
        this.db.prepare("UPDATE artists SET can_sell = ? WHERE id = ?").run(canSell ? 1 : 0, id);
    }

    setStripeAccountId(id: number, stripeAccountId: string | null): void {
        this.db.prepare("UPDATE artists SET stripe_account_id = ? WHERE id = ?").run(stripeAccountId, id);
    }

    getByStripeAccountId(stripeAccountId: string): Artist | undefined {
        const row = this.db.prepare("SELECT a.*, a.wallet_address as walletAddress FROM artists a WHERE a.stripe_account_id = ?").get(stripeAccountId);
        return this.mapArtist(row);
    }

    updateMigrationStatus(id: number, alsoKnownAs: string[] | null, movedTo: string | null): void {
        const akaJson = alsoKnownAs ? JSON.stringify(alsoKnownAs) : null;
        this.db.prepare("UPDATE artists SET also_known_as = ?, moved_to = ? WHERE id = ?").run(akaJson, movedTo, id);
    }

    delete(id: number): void {
        this.db.transaction(() => {
            this.db.prepare("UPDATE albums SET artist_id = NULL WHERE artist_id = ?").run(id);
            this.db.prepare("UPDATE tracks SET artist_id = NULL WHERE artist_id = ?").run(id);
            this.db.prepare("UPDATE samples SET artist_id = NULL WHERE artist_id = ?").run(id);
            this.db.prepare("UPDATE sample_packs SET artist_id = NULL WHERE artist_id = ?").run(id);
            this.db.prepare("UPDATE assets SET artist_id = NULL WHERE artist_id = ?").run(id);
            this.db.prepare("DELETE FROM fid_registry WHERE artist_id = ?").run(id);
            this.db.prepare("UPDATE admin SET artist_id = NULL WHERE artist_id = ?").run(id);
            this.db.prepare("DELETE FROM followers WHERE artist_id = ?").run(id);
            this.db.prepare("DELETE FROM following WHERE artist_id = ?").run(id);
            this.db.prepare("DELETE FROM artists WHERE id = ?").run(id);
        })();
    }

    deleteBatch(ids: number[]): void {
        if (ids.length === 0) return;

        this.db.transaction(() => {
            const CHUNK_SIZE = 900;
            for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
                const chunk = ids.slice(i, i + CHUNK_SIZE);
                const placeholders = chunk.map(() => '?').join(',');

                this.db.prepare(`UPDATE albums SET artist_id = NULL WHERE artist_id IN (${placeholders})`).run(...chunk);
                this.db.prepare(`UPDATE tracks SET artist_id = NULL WHERE artist_id IN (${placeholders})`).run(...chunk);
                this.db.prepare(`UPDATE samples SET artist_id = NULL WHERE artist_id IN (${placeholders})`).run(...chunk);
                this.db.prepare(`UPDATE sample_packs SET artist_id = NULL WHERE artist_id IN (${placeholders})`).run(...chunk);
                this.db.prepare(`UPDATE assets SET artist_id = NULL WHERE artist_id IN (${placeholders})`).run(...chunk);
                this.db.prepare(`DELETE FROM fid_registry WHERE artist_id IN (${placeholders})`).run(...chunk);
                this.db.prepare(`UPDATE admin SET artist_id = NULL WHERE artist_id IN (${placeholders})`).run(...chunk);
                this.db.prepare(`DELETE FROM followers WHERE artist_id IN (${placeholders})`).run(...chunk);
                this.db.prepare(`DELETE FROM following WHERE artist_id IN (${placeholders})`).run(...chunk);
                this.db.prepare(`DELETE FROM artists WHERE id IN (${placeholders})`).run(...chunk);
            }
        })();
    }

    isLinkedToUser(id: number): boolean {
        return !!this.db.prepare("SELECT 1 FROM admin WHERE artist_id = ?").get(id);
    }

    isLinkedToUserBySlug(slug: string): boolean {
        return !!this.db.prepare("SELECT 1 FROM admin adm JOIN artists art ON adm.artist_id = art.id WHERE art.slug = ?").get(slug);
    }

    getCount(): number {
        const row = this.db.prepare("SELECT COUNT(*) as count FROM artists").get() as any;
        return row ? row.count : 0;
    }

    getMissingMetadata(filter: 'photo' | 'bio' | 'links'): Artist[] {
        let condition = "";
        switch (filter) {
            case 'photo': condition = "photo_path IS NULL"; break;
            case 'bio': condition = "bio IS NULL OR bio = ''"; break;
            case 'links': condition = "links IS NULL OR links = '[]'"; break;
            default: return [];
        }
        const rows = this.db.prepare(`SELECT * FROM artists WHERE ${condition}`).all();
        return rows.map(row => this.mapArtist(row)) as Artist[];
    }
}
