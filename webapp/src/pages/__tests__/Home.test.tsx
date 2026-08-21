import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Home from "../Home";
import { useAuthStore } from "../../stores/useAuthStore";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import API from "../../services/api";

vi.mock("../../stores/useAuthStore");
vi.mock("../../stores/useSiteSettingsStore", () => ({
	useSiteSettingsStore: vi.fn(() => ({
		settings: { mode: "standard" },
		fetchFlags: vi.fn(),
		isModuleHidden: vi.fn().mockReturnValue(false),
	})),
	truthy: (val: any) => Boolean(val),
}));

vi.mock("../../stores/usePlayerStore", () => ({
	usePlayerStore: vi.fn(() => ({
		currentTrack: null,
		isPlaying: false,
		progress: 0,
		duration: 0,
		playQueue: vi.fn(),
		togglePlay: vi.fn(),
		recentlyPlayed: [],
	})),
}));

vi.mock("../../services/api", () => ({
	default: {
		getCatalog: vi.fn(() =>
			Promise.resolve({
				recentReleases: [
					{ id: 1, title: "Cyber Sunset", artist_name: "Synth Master", is_release: 1, slug: "cyber-sunset" },
				],
				recentAlbums: [
					{ id: 2, title: "Lo-Fi Beats", artist_name: "Chill Dev", is_release: 0, slug: "lo-fi-beats" },
				],
				stats: {
					genres: ["Synthwave", "Ambient", "Lo-Fi"],
					totalTracks: 120,
					totalAlbums: 15,
				},
			}),
		),
		getBoardHistory: vi.fn(() => Promise.resolve([])),
		getAlbumCoverUrl: vi.fn((id) => `/cover/album/${id}`),
		getReleaseCoverUrl: vi.fn((id) => `/cover/release/${id}`),
	},
}));

describe("Home Page", () => {
	let queryClient: QueryClient;

	beforeEach(() => {
		vi.clearAllMocks();
		queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		vi.mocked(useAuthStore).mockReturnValue({
			isAuthenticated: true,
			isLoading: false,
			role: "user",
			user: { username: "alice", userId: 1 },
		} as any);
	});

	it("renders catalog releases and genres", async () => {
		render(
			<QueryClientProvider client={queryClient}>
				<MemoryRouter>
					<Home />
				</MemoryRouter>
			</QueryClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByText("Cyber Sunset")).toBeInTheDocument();
			expect(screen.getByText("Synthwave")).toBeInTheDocument();
		});
	});
});
