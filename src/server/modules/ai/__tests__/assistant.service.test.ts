import { describe, test, expect, jest, beforeEach } from "@jest/globals";
import { AssistantService, type AssistantCaller, type AssistantDeps } from "../assistant.service.js";
import { UserRole } from "../../../common/visibility.js";

describe("AssistantService", () => {
	let service: AssistantService;
	let deps: AssistantDeps;

	const adminCaller: AssistantCaller = {
		userId: 1,
		username: "admin",
		role: UserRole.ROOT_ADMIN,
		isAdmin: true,
		isRootAdmin: true
	};

	const publisherCaller: AssistantCaller = {
		userId: 7,
		username: "artist7",
		artistId: 70,
		role: UserRole.NORMAL_USER,
		isAdmin: false,
		context: {
			userId: 7,
			artistId: 70,
			role: UserRole.NORMAL_USER,
			isActive: true
		}
	};

	const sampleTracks = [
		{
			id: 101,
			track_num: 1,
			title: "AudioTrack 01",
			artist_id: 70,
			artist_name: "Bluvertigo",
			album_id: 20,
			album_title: "Acidi e basi",
			owner_id: 1,
			duration: 254,
			genre: null,
			year: null
		},
		{
			id: 102,
			track_num: 2,
			title: "AudioTrack 02",
			artist_id: 70,
			artist_name: "Bluvertigo",
			album_id: 20,
			album_title: "Acidi e basi",
			owner_id: 1,
			duration: 325,
			genre: null,
			year: null
		}
	];

	beforeEach(() => {
		jest.clearAllMocks();
		deps = {
			database: {
				getTracksByIds: jest.fn((ids: number[]) => sampleTracks.filter(t => ids.includes(t.id))),
				getTrack: jest.fn((id: number) => sampleTracks.find(t => t.id === id)),
				getTracksByAlbum: jest.fn().mockReturnValue(sampleTracks),
				getAlbumsByArtist: jest.fn().mockReturnValue([]),
				getAllTracks: jest.fn().mockReturnValue(sampleTracks)
			} as any,
			library: {
				search: jest.fn().mockReturnValue({ tracks: sampleTracks, albums: [], artists: [] }),
				getAlbum: jest.fn(),
				getRelease: jest.fn(),
				getArtist: jest.fn(),
				getTracksByReleaseId: jest.fn().mockReturnValue([]),
				getStats: jest.fn().mockResolvedValue({ artists: 1, albums: 1, tracks: 2 }),
				updateArtist: jest.fn(),
				pruneOrphans: jest.fn()
			} as any,
			catalogService: {
				updateTrack: jest.fn<any>().mockResolvedValue({}),
				updateAlbum: jest.fn<any>().mockResolvedValue(undefined)
			} as any,
			metadataService: {
				searchRelease: jest.fn<any>().mockResolvedValue([
					{
						id: "mb-rel-1",
						source: "musicbrainz",
						title: "Acidi e basi",
						artist: "Bluvertigo",
						year: 1995,
						trackCount: 2
					}
				]),
				getReleaseDetails: jest.fn<any>().mockResolvedValue({
					id: "mb-rel-1",
					source: "musicbrainz",
					title: "Acidi e basi",
					artist: "Bluvertigo",
					year: 1995,
					tracks: [
						{ position: 1, title: "L'assenzio (The Power of Nothing)", duration: 254 },
						{ position: 2, title: "Salute", duration: 325 }
					]
				}),
				searchRecording: jest.fn<any>().mockResolvedValue([]),
				searchArtist: jest.fn<any>().mockResolvedValue([])
			} as any,
			maintenanceService: {
				getTracksWithMissingMetadata: jest.fn().mockReturnValue([]),
				getTracksWithGenericTitles: jest.fn().mockReturnValue(sampleTracks),
				getAlbumsWithMissingMetadata: jest.fn().mockReturnValue([]),
				getArtistsWithMissingPhotos: jest.fn<any>().mockResolvedValue([]),
				propagateAlbumMetadataToTracks: jest.fn<any>().mockResolvedValue(undefined),
				syncAllTagsFromDb: jest.fn<any>().mockResolvedValue({ success: 2, failed: 0 }),
				runStartupRepairs: jest.fn<any>().mockResolvedValue(undefined)
			} as any,
			openRouterService: {
				chat: jest.fn()
			} as any,
			scannerService: {
				scanDirectory: jest.fn<any>().mockResolvedValue({ successful: [], failed: [] })
			} as any,
			mediaEngine: {
				prewarmCache: jest.fn<any>().mockResolvedValue(0)
			} as any,
			config: { musicDir: "/music" } as any,
			musicDir: "/music"
		};

		service = new AssistantService(deps);
	});

	test("runs tool-calling workflow and returns diff proposal without mutating DB", async () => {
		(deps.openRouterService.chat as any)
			.mockResolvedValueOnce({
				ok: true,
				message: {
					role: "assistant",
					content: null,
					tool_calls: [
						{
							id: "tc1",
							type: "function",
							function: {
								name: "search_external_releases",
								arguments: JSON.stringify({ query: "Bluvertigo - Acidi e basi" })
							}
						}
					]
				}
			})
			.mockResolvedValueOnce({
				ok: true,
				message: {
					role: "assistant",
					content: null,
					tool_calls: [
						{
							id: "tc2",
							type: "function",
							function: {
								name: "get_external_release_tracklist",
								arguments: JSON.stringify({ source: "musicbrainz", releaseId: "mb-rel-1" })
							}
						}
					]
				}
			})
			.mockResolvedValueOnce({
				ok: true,
				message: {
					role: "assistant",
					content: null,
					tool_calls: [
						{
							id: "tc3",
							type: "function",
							function: {
								name: "propose_track_updates",
								arguments: JSON.stringify({
									reason: "Match official Bluvertigo - Acidi e basi tracklist by position and duration",
									updates: [
										{ trackId: 101, title: "L'assenzio (The Power of Nothing)" },
										{ trackId: 102, title: "Salute" }
									]
								})
							}
						}
					]
				}
			})
			.mockResolvedValueOnce({
				ok: true,
				message: {
					role: "assistant",
					content: "Ho trovato la tracklist ufficiale di Acidi e basi e preparato la rinomina delle tracce."
				}
			});

		const result = await service.chat(
			[{ role: "user", content: "mi trovi i titoli giusti delle tracce di questo album?" }],
			adminCaller,
			{ trackIds: [101, 102], view: "tracks" }
		);

		expect(deps.metadataService.searchRelease).toHaveBeenCalledWith("Bluvertigo - Acidi e basi");
		expect(deps.metadataService.getReleaseDetails).toHaveBeenCalledWith("musicbrainz", "mb-rel-1");
		expect(deps.catalogService.updateTrack).not.toHaveBeenCalled();

		expect(result.proposal).toBeDefined();
		expect(result.proposal!.actions).toHaveLength(2);
		expect(result.proposal!.actions[0].diffs).toEqual([
			{ field: "title", before: "AudioTrack 01", after: "L'assenzio (The Power of Nothing)" }
		]);
		expect(result.proposal!.actions[1].diffs).toEqual([
			{ field: "title", before: "AudioTrack 02", after: "Salute" }
		]);
	});

	test("applyProposal updates only selected actions, blocks cross-user apply and double apply", async () => {
		(deps.openRouterService.chat as any)
			.mockResolvedValueOnce({
				ok: true,
				message: {
					role: "assistant",
					content: null,
					tool_calls: [
						{
							id: "tc1",
							type: "function",
							function: {
								name: "propose_track_updates",
								arguments: JSON.stringify({
									updates: [
										{ trackId: 101, title: "New Title 1" },
										{ trackId: 102, title: "New Title 2" }
									]
								})
							}
						}
					]
				}
			})
			.mockResolvedValueOnce({
				ok: true,
				message: { role: "assistant", content: "Ready" }
			});

		const chatRes = await service.chat([{ role: "user", content: "Fix titles" }], adminCaller);
		const proposalId = chatRes.proposal!.id;
		const firstActionId = chatRes.proposal!.actions[0].id;

		// Wrong user rejected
		await expect(
			service.applyProposal(proposalId, [firstActionId], publisherCaller)
		).rejects.toThrow(/belongs to another user/i);

		// Apply only first action
		const applyRes = await service.applyProposal(proposalId, [firstActionId], adminCaller);
		expect(applyRes.applied).toBe(1);
		expect(applyRes.failed).toBe(0);
		expect(deps.catalogService.updateTrack).toHaveBeenCalledTimes(1);
		expect(deps.catalogService.updateTrack).toHaveBeenCalledWith(101, { title: "New Title 1" });

		// Re-applying already applied action does nothing
		const reApply = await service.applyProposal(proposalId, [firstActionId], adminCaller);
		expect(reApply.applied).toBe(0);
	});

	test("blocks unsafe coverUrl (SSRF) during proposal staging", async () => {
		(deps.openRouterService.chat as any)
			.mockResolvedValueOnce({
				ok: true,
				message: {
					role: "assistant",
					content: null,
					tool_calls: [
						{
							id: "tc1",
							type: "function",
							function: {
								name: "propose_track_updates",
								arguments: JSON.stringify({
									updates: [{ trackId: 101, coverUrl: "http://127.0.0.1/internal.jpg" }]
								})
							}
						}
					]
				}
			})
			.mockResolvedValueOnce({
				ok: true,
				message: { role: "assistant", content: "Unsafe URL rejected." }
			});

		const res = await service.chat([{ role: "user", content: "Set cover" }], adminCaller);
		expect(res.proposal).toBeUndefined();
	});

	test("non-admin publisher cannot invoke admin-only tools or access unowned tracks", async () => {
		const unownedTrack = { ...sampleTracks[0], id: 999, owner_id: 2, artist_id: 22 };
		(deps.database.getTrack as any).mockImplementation((id: number) => (id === 999 ? unownedTrack : sampleTracks[0]));

		(deps.openRouterService.chat as any)
			.mockResolvedValueOnce({
				ok: true,
				message: {
					role: "assistant",
					content: null,
					tool_calls: [
						{
							id: "tc1",
							type: "function",
							function: {
								name: "propose_system_action",
								arguments: JSON.stringify({ action: "optimize_db" })
							}
						},
						{
							id: "tc2",
							type: "function",
							function: {
								name: "propose_track_updates",
								arguments: JSON.stringify({
									updates: [{ trackId: 999, title: "Hacked" }]
								})
							}
						}
					]
				}
			})
			.mockResolvedValueOnce({
				ok: true,
				message: { role: "assistant", content: "Denied." }
			});

		const res = await service.chat([{ role: "user", content: "Optimize and hack" }], publisherCaller);
		// Check admin-only tools were omitted from the OpenRouter tools payload
		const sentTools = (deps.openRouterService.chat as any).mock.calls[0][1].tools.map((t: any) => t.function.name);
		expect(sentTools).not.toContain("propose_system_action");
		expect(sentTools).not.toContain("list_missing_metadata");
		expect(res.proposal).toBeUndefined();
	});

	test("propagates OpenRouter error cleanly when unconfigured", async () => {
		(deps.openRouterService.chat as any).mockResolvedValueOnce({
			ok: false,
			error: "OpenRouter AI is not configured or disabled."
		});

		await expect(
			service.chat([{ role: "user", content: "Hello" }], adminCaller)
		).rejects.toThrow("OpenRouter AI is not configured");
	});
});
