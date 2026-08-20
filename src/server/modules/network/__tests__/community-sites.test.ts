import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { buildCommunitySites } from "../community-sites.js";

const isLiveTuneCampSpy = jest.fn<any>();
jest.unstable_mockModule("../../../common/network.js", () => ({
    isLiveTuneCamp: isLiveTuneCampSpy
}));

let buildCommunitySitesFn: typeof buildCommunitySites;

describe("community-sites aggregator", () => {
    let mockDbService: any;
    let mockConfig: any;
    let mockFederatedDiscovery: any;

    beforeEach(async () => {
        jest.clearAllMocks();
        isLiveTuneCampSpy.mockResolvedValue(false);
        const mod = await import("../community-sites.js");
        buildCommunitySitesFn = mod.buildCommunitySites;

        mockDbService = {
            getSetting: jest.fn().mockImplementation((k: string) => {
                if (k === "publicUrl") return "https://local.tunecamp.net";
                if (k === "siteName") return "Local Music Server";
                if (k === "siteDescription") return "Local Description";
                return null;
            }),
            getFollowedActors: jest.fn().mockReturnValue([])
        };

        mockConfig = {
            publicUrl: "https://local.tunecamp.net",
            port: 1970
        };

        mockFederatedDiscovery = {
            getCommunitySites: jest.fn().mockReturnValue([])
        };
    });

    it("returns local site when no remote sites are present", async () => {
        const sites = await buildCommunitySitesFn({
            dbService: mockDbService,
            config: mockConfig,
            federatedDiscoveryService: mockFederatedDiscovery
        });

        expect(sites).toHaveLength(1);
        expect(sites[0].federation).toBe("local");
        expect(sites[0].name).toBe("Local Music Server");
        expect(sites[0].url).toBe("https://local.tunecamp.net");
    });

    it("aggregates federated gossip sites and ignores self-url", async () => {
        mockFederatedDiscovery.getCommunitySites.mockReturnValue([
            { url: "https://peer.tunecamp.net", name: "Peer Radio", version: "5.4.0" },
            { url: "https://local.tunecamp.net", name: "Self Mirror" }
        ]);

        const sites = await buildCommunitySitesFn({
            dbService: mockDbService,
            config: mockConfig,
            federatedDiscoveryService: mockFederatedDiscovery
        });

        expect(sites).toHaveLength(2);
        expect(sites[0].federation).toBe("local");
        expect(sites[1].federation).toBe("federated");
        expect(sites[1].name).toBe("Peer Radio");
    });

    it("filters and includes live ActivityPub site actors", async () => {
        isLiveTuneCampSpy.mockImplementation(async (url: string) => url.includes("live-ap.net"));

        mockDbService.getFollowedActors.mockReturnValue([
            { username: "site", uri: "https://live-ap.net/users/site", name: "Live AP Instance", summary: "Fediverse tunes" },
            { username: "site", uri: "https://dead-ap.net/users/site", name: "Dead AP Instance" }
        ]);

        const sites = await buildCommunitySitesFn({
            dbService: mockDbService,
            config: mockConfig,
            federatedDiscoveryService: mockFederatedDiscovery
        });

        expect(sites).toHaveLength(2);
        const apSite = sites.find(s => s.federation === "activitypub");
        expect(apSite).toBeDefined();
        expect(apSite?.name).toBe("Live AP Instance");
        expect(apSite?.url).toBe("https://live-ap.net/users/site");
    });

    it("deduplicates AP actor if origin is already in gossip federated list", async () => {
        isLiveTuneCampSpy.mockResolvedValue(true);

        mockFederatedDiscovery.getCommunitySites.mockReturnValue([
            { url: "https://same-origin.net/federation", name: "Gossip Node" }
        ]);

        mockDbService.getFollowedActors.mockReturnValue([
            { username: "site", uri: "https://same-origin.net/users/site", name: "AP Actor Node" }
        ]);

        const sites = await buildCommunitySitesFn({
            dbService: mockDbService,
            config: mockConfig,
            federatedDiscoveryService: mockFederatedDiscovery
        });

        // 1 local + 1 gossip (AP deduplicated)
        expect(sites).toHaveLength(2);
        expect(sites.some(s => s.federation === "activitypub")).toBe(false);
    });
});
