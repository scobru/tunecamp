
import { jest } from '@jest/globals';
import { LifecycleService } from "./lifecycle.service.js";
import { UserRole } from "../common/visibility.js";

describe("LifecycleService", () => {
    let lifecycleService: LifecycleService;
    let mockDb: any;
    let mockPublishing: any;
    let mockAp: any;

    beforeEach(() => {
        mockDb = {
            getAlbum: jest.fn(),
            updateAlbumStatus: jest.fn(),
            promoteToRelease: jest.fn(),
            getRelease: jest.fn(),
            updateReleaseStatus: jest.fn(),
        };
        mockPublishing = {
            publishReleaseToAP: jest.fn(),
        };
        mockAp = {
            ensureArtistKeys: jest.fn(),
        };
        lifecycleService = new LifecycleService(mockDb, mockPublishing, mockAp);
    });

    test("requestPromotion should move album from draft to pending", async () => {
        const album = { id: 1, owner_id: 10, status: 'draft' };
        mockDb.getAlbum.mockReturnValue(album);

        await lifecycleService.requestPromotion(1, { userId: 10, role: 'super_user' });

        expect(mockDb.updateAlbumStatus).toHaveBeenCalledWith(1, 'pending');
    });

    test("approvePromotion should transition monetized album to awaiting_finalization", async () => {
        const album = { id: 1, status: 'pending', price: 10 };
        mockDb.getAlbum.mockReturnValue(album);

        await lifecycleService.approvePromotion(1, { userId: 1, role: 'root_admin' });

        expect(mockDb.updateAlbumStatus).toHaveBeenCalledWith(1, 'awaiting_finalization');
    });

    test("approvePromotion should finalize immediately for free releases", async () => {
        const album = { id: 1, status: 'pending', price: 0, owner_id: 10 };
        mockDb.getAlbum.mockReturnValue(album);
        mockDb.getRelease.mockReturnValue({ id: 1, title: 'Test' });

        await lifecycleService.approvePromotion(1, { userId: 1, role: 'root_admin' });

        expect(mockDb.promoteToRelease).toHaveBeenCalledWith(1);
        expect(mockDb.updateAlbumStatus).toHaveBeenCalledWith(1, 'released');
    });

    test("finalizeRelease should promote to release and broadcast", async () => {
        const album = { id: 1, status: 'awaiting_finalization', artist_id: 5 };
        mockDb.getAlbum.mockReturnValue(album);
        const release = { id: 1, title: 'Test Release' };
        mockDb.getRelease.mockReturnValue(release);

        await lifecycleService.finalizeRelease(1, { userId: 10, artistId: 5, role: 'super_user' });

        expect(mockDb.promoteToRelease).toHaveBeenCalledWith(1);
        expect(mockAp.ensureArtistKeys).toHaveBeenCalledWith(5);
        expect(mockPublishing.publishReleaseToAP).toHaveBeenCalledWith(release);
    });
});
