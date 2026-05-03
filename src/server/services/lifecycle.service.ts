
import type { DatabaseService, Album, Release } from "../database.js";
import type { PublishingService } from "../publishing.js";
import type { ActivityPubService } from "../activitypub.js";
import { VisibilityGuardian, Capability, ViewerContext } from "../common/visibility.js";

export class LifecycleService {
    constructor(
        private db: DatabaseService,
        private publishing: PublishingService,
        private ap: ActivityPubService
    ) {}

    /**
     * Artist requests promotion of a library album to a public release.
     * Transitions from 'draft' to 'pending'.
     */
    async requestPromotion(albumId: number, user: { userId: number, artistId?: number, role: string }): Promise<void> {
        const album = this.db.getAlbum(albumId);
        if (!album) throw new Error("Album not found");

        const context: ViewerContext = VisibilityGuardian.deriveContext(user as any);
        
        // Only owners (Super Users or Artists) or Library Managers can request promotion
        if (album.owner_id !== user.userId && !VisibilityGuardian.can(context, Capability.MANAGE_PRIVATE_LIBRARY)) {
            throw new Error("Only the owner can request promotion");
        }

        if (album.status !== 'draft') {
            throw new Error(`Cannot request promotion: current status is ${album.status}`);
        }

        this.db.updateAlbumStatus(albumId, 'pending');
        console.log(`[Lifecycle] Album ${albumId} is now PENDING approval.`);
    }

    /**
     * Admin/Label approves the promotion request.
     * If free: finalizes immediately.
     * If monetized: transitions to 'awaiting_finalization'.
     */
    async approvePromotion(albumId: number, admin: { userId: number, role: string }): Promise<void> {
        const album = this.db.getAlbum(albumId);
        if (!album) throw new Error("Album not found");

        const context: ViewerContext = VisibilityGuardian.deriveContext(admin as any);
        if (!VisibilityGuardian.can(context, Capability.MANAGE_SYSTEM)) {
            throw new Error("Access denied: Admin role required for approval");
        }

        if (album.status !== 'pending') {
            throw new Error(`Cannot approve: current status is ${album.status}`);
        }

        const isMonetized = (album.price || 0) > 0 || (album.price_usdc || 0) > 0;

        if (isMonetized) {
            this.db.updateAlbumStatus(albumId, 'awaiting_finalization');
            console.log(`[Lifecycle] Album ${albumId} approved, AWAITING FINALIZATION (gas payment) by Artist.`);
        } else {
            console.log(`[Lifecycle] Album ${albumId} approved (FREE), finalizing immediately.`);
            await this.finalizeRelease(albumId, { userId: album.owner_id || 0, role: 'super_user' });
        }
    }

    /**
     * Finalizes the release process. 
     * Executed by the Artist (after gas payment) or automatically for free releases.
     */
    async finalizeRelease(albumId: number, user: { userId: number, artistId?: number, role: string }): Promise<void> {
        const album = this.db.getAlbum(albumId);
        if (!album) throw new Error("Album not found");

        // Verification: must be 'awaiting_finalization' or 'pending' (if free and called via approve)
        if (album.status !== 'awaiting_finalization' && album.status !== 'pending') {
            throw new Error(`Cannot finalize: current status is ${album.status}`);
        }

        // 1. Promote to Release table
        this.db.promoteToRelease(albumId);

        // 2. Update status to 'released'
        this.db.updateAlbumStatus(albumId, 'released');
        
        // 3. side-effects: Identity and Federation
        if (album.artist_id) {
            await this.ap.ensureArtistKeys(album.artist_id);
        }

        const release = this.db.getRelease(albumId);
        if (release) {
            this.db.updateReleaseStatus(albumId, 'released');
            await this.publishing.publishReleaseToAP(release);
        }

        console.log(`[Lifecycle] Album ${albumId} is now RELEASED and federated.`);
    }

    /**
     * Admin/Label rejects the promotion request.
     * Transitions back to 'draft'.
     */
    async rejectPromotion(albumId: number, reason: string, admin: { userId: number, role: string }): Promise<void> {
        const album = this.db.getAlbum(albumId);
        if (!album) throw new Error("Album not found");

        const context: ViewerContext = VisibilityGuardian.deriveContext(admin as any);
        if (!VisibilityGuardian.can(context, Capability.MANAGE_SYSTEM)) {
            throw new Error("Access denied");
        }

        this.db.updateAlbumStatus(albumId, 'draft');
        console.log(`[Lifecycle] Album ${albumId} rejected by Admin. Reason: ${reason}`);
        // TODO: Store reason in curation_notes
    }
}
