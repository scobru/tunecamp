
import type { DatabaseService, Album, Release } from "../../core/database.js";
import type { PublishingService } from "../publishing/publishing.service.js";
import type { ActivityPubService } from "../activitypub/activitypub.service.js";
import { VisibilityGuardian, Capability, ViewerContext } from "../../common/visibility.js";

export class LifecycleService {
    constructor(
        private db: DatabaseService,
        private publishing: PublishingService,
        private ap: ActivityPubService
    ) {}

    /**
     * Artist requests promotion of a library album or existing release to a public release.
     * Transitions from 'draft' to 'pending'.
     */
    async requestPromotion(id: number, user: { userId: number, artistId?: number, role: string }): Promise<void> {
        const album = this.db.getAlbum(id);
        const release = this.db.getRelease(id);
        const item = album || release;
        
        if (!item) throw new Error("Item not found");

        const context: ViewerContext = VisibilityGuardian.deriveContext(user as any);
        
        // Only owners (Super Users or Artists) or Library Managers can request promotion
        if (item.owner_id !== user.userId && !VisibilityGuardian.can(context, Capability.MANAGE_PRIVATE_LIBRARY)) {
            throw new Error("Only the owner can request promotion");
        }

        if (item.status !== 'draft') {
            throw new Error(`Cannot request promotion: current status is ${item.status}`);
        }

        if (album) {
            this.db.updateAlbumStatus(id, 'pending');
        } else {
            this.db.updateReleaseStatus(id, 'pending');
        }
        
        console.log(`[Lifecycle] Item ${id} is now PENDING approval.`);
    }

    /**
     * Admin/Label approves the promotion request.
     * If free: finalizes immediately.
     * If monetized: transitions to 'awaiting_finalization'.
     */
    async approvePromotion(id: number, admin: { userId: number, role: string }): Promise<void> {
        const album = this.db.getAlbum(id);
        const release = this.db.getRelease(id);
        const item = album || release;

        if (!item) throw new Error("Item not found");

        const context: ViewerContext = VisibilityGuardian.deriveContext(admin as any);
        if (!VisibilityGuardian.can(context, Capability.MANAGE_SYSTEM)) {
            throw new Error("Access denied: Admin role required for approval");
        }

        if (item.status !== 'pending') {
            throw new Error(`Cannot approve: current status is ${item.status}`);
        }

        const isMonetized = (item.price || 0) > 0 || (item.price_usdc || 0) > 0;

        if (isMonetized) {
            if (album) {
                this.db.updateAlbumStatus(id, 'awaiting_finalization');
            } else {
                this.db.updateReleaseStatus(id, 'awaiting_finalization');
            }
            console.log(`[Lifecycle] Item ${id} approved, AWAITING FINALIZATION (gas payment) by Artist.`);
        } else {
            console.log(`[Lifecycle] Item ${id} approved (FREE), finalizing immediately.`);
            await this.finalizeRelease(id, { userId: item.owner_id || 0, role: 'super_user' });
        }
    }

    /**
     * Finalizes the release process. 
     * Executed by the Artist (after gas payment) or automatically for free releases.
     */
    async finalizeRelease(id: number, user: { userId: number, artistId?: number, role: string }): Promise<void> {
        const album = this.db.getAlbum(id);
        const release = this.db.getRelease(id);
        const item = album || release;

        if (!item) throw new Error("Item not found");

        // Verification: must be 'awaiting_finalization' or 'pending' (if free and called via approve)
        if (item.status !== 'awaiting_finalization' && item.status !== 'pending') {
            throw new Error(`Cannot finalize: current status is ${item.status}`);
        }

        // 1. Promote to Release table (if it's an album)
        if (album) {
            this.db.promoteToRelease(id);
            this.db.updateAlbumStatus(id, 'released');
        }

        // 2. Update status to 'released' in releases table
        this.db.updateReleaseStatus(id, 'released');
        
        // 3. side-effects: Identity and Federation
        if (item.artist_id) {
            await this.ap.ensureArtistKeys(item.artist_id);
        }

        const finalRelease = this.db.getRelease(id);
        if (finalRelease) {
            await this.publishing.publishReleaseToAP(finalRelease);
        }

        console.log(`[Lifecycle] Item ${id} is now RELEASED and federated.`);
    }

    /**
     * Admin/Label rejects the promotion request.
     * Transitions back to 'draft'.
     */
    async rejectPromotion(id: number, reason: string, admin: { userId: number, role: string }): Promise<void> {
        const album = this.db.getAlbum(id);
        const release = this.db.getRelease(id);
        const item = album || release;

        if (!item) throw new Error("Item not found");

        const context: ViewerContext = VisibilityGuardian.deriveContext(admin as any);
        if (!VisibilityGuardian.can(context, Capability.MANAGE_SYSTEM)) {
            throw new Error("Access denied");
        }

        if (album) {
            this.db.updateAlbumStatus(id, 'draft');
        } else {
            this.db.updateReleaseStatus(id, 'draft');
        }

        console.log(`[Lifecycle] Item ${id} rejected by Admin. Reason: ${reason}`);
        // TODO: Store reason in curation_notes
    }
}
