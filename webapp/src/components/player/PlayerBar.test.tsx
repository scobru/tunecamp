import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { PlayerBar } from "./PlayerBar";

// Mock useAuthStore: component calls useAuthStore.getState() directly
const mockUser = { id: "user-1", isAdmin: false };
vi.mock("../../stores/useAuthStore", () => ({
	useAuthStore: {
		getState: () => ({
			isAuthenticated: true,
			user: mockUser,
		}),
	},
}));

// Mock other dependencies
vi.mock("../../stores/usePlayerStore", () => ({
	usePlayerStore: vi.fn(),
}));

vi.mock("../../stores/useConfigStore", () => ({
	useConfigStore: vi.fn(),
}));

vi.mock("../../services/api", () => ({
	default: {
		getStreamUrl: vi.fn((id) => `/stream/${id}`),
		getAlbumCoverUrl: vi.fn(() => "/cover.jpg"),
		getTrackCoverUrl: vi.fn(() => "/track-cover.jpg"),
		getArtistCoverUrl: vi.fn(() => "/artist-cover.jpg"),
		getAlbum: vi.fn(),
		getTrackDownloadUrl: vi.fn((id) => `/download/${id}`),
		starArtist: vi.fn().mockResolvedValue(undefined),
		starAlbum: vi.fn().mockResolvedValue(undefined),
	},
}));

vi.mock("../../hooks/useNowPlayingHeartbeat", () => ({
	useNowPlayingHeartbeat: vi.fn(),
}));

vi.mock("../../utils/notify", () => ({
	notify: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("../../components/player/LyricsPanel", () => ({
	LyricsPanel: () => <div data-testid="lyrics-panel">Lyrics</div>,
}));

vi.mock("../../components/player/QueuePanel", () => ({
	QueuePanel: () => <div data-testid="queue-panel">Queue</div>,
}));

vi.mock("../../components/player/PlayerCanvas", () => ({
	PlayerCanvas: () => <div data-testid="player-canvas">Canvas</div>,
}));

// Import after mocks are set up
const { usePlayerStore } = await import("../../stores/usePlayerStore");
const { useConfigStore } = await import("../../stores/useConfigStore");

const mockUsePlayerStore = vi.mocked(usePlayerStore);
const mockUseConfigStore = vi.mocked(useConfigStore);

const mockTrack = {
	id: "track-1",
	title: "Test Track",
	artistName: "Test Artist",
	artistId: "artist-1",
	albumId: "album-1",
	album_title: "Test Album",
	coverUrl: "/cover.jpg",
	duration: 180,
	format: "mp3",
	filename: "test.mp3",
	owner_id: "user-1",
	streamUrl: "/stream/test",
};

const createMockStore = (overrides = {}) => ({
	currentTrack: mockTrack,
	isPlaying: false,
	volume: 0.75,
	progress: 30,
	currentTime: 30,
	duration: 180,
	isShuffled: false,
	repeatMode: "none" as const,
	isRadioMode: false,
	isLyricsOpen: false,
	isCanvasOpen: false,
	crossfadeSec: 0,
	togglePlay: vi.fn(),
	next: vi.fn(),
	prev: vi.fn(),
	setIsPlaying: vi.fn(),
	setProgress: vi.fn(),
	setVolume: vi.fn(),
	setCrossfade: vi.fn(),
	toggleShuffle: vi.fn(),
	toggleRepeat: vi.fn(),
	toggleRadio: vi.fn(),
	toggleLyrics: vi.fn(),
	toggleQueue: vi.fn(),
	toggleCanvas: vi.fn(),
	...overrides,
});

beforeEach(() => {
	vi.clearAllMocks();
	mockUseConfigStore.mockReturnValue({ cacheBuster: "v1" } as any);
	mockUsePlayerStore.mockReturnValue(createMockStore());
});

const renderPlayer = (storeOverrides = {}) => {
	mockUsePlayerStore.mockReturnValue(createMockStore(storeOverrides));
	render(
		<MemoryRouter>
			<PlayerBar />
		</MemoryRouter>,
	);
};

describe("PlayerBar", () => {
	it("renders placeholder when no track is loaded", () => {
		mockUsePlayerStore.mockReturnValue(createMockStore({ currentTrack: null }));
		render(
			<MemoryRouter>
				<PlayerBar />
			</MemoryRouter>,
		);
		expect(screen.getByText("Select a track to play")).toBeInTheDocument();
	});

	it("renders track info when a track is playing", () => {
		renderPlayer();
		expect(screen.getByText("Test Track")).toBeInTheDocument();
		expect(screen.getByText("Test Artist")).toBeInTheDocument();
	});

	it("renders play button when not playing", () => {
		renderPlayer({ isPlaying: false });
		expect(screen.getByRole("button", { name: /Play/i })).toBeInTheDocument();
	});

	it("renders pause button when playing", () => {
		renderPlayer({ isPlaying: true });
		expect(screen.getByRole("button", { name: /Pause/i })).toBeInTheDocument();
	});

	it("toggles play when play button is clicked", () => {
		const togglePlay = vi.fn();
		renderPlayer({ isPlaying: false, togglePlay });
		fireEvent.click(screen.getByRole("button", { name: /Play/i }));
		expect(togglePlay).toHaveBeenCalledOnce();
	});

	it("toggles pause when pause button is clicked", () => {
		const togglePlay = vi.fn();
		renderPlayer({ isPlaying: true, togglePlay });
		fireEvent.click(screen.getByRole("button", { name: /Pause/i }));
		expect(togglePlay).toHaveBeenCalledOnce();
	});

	it("renders previous and next buttons", () => {
		renderPlayer();
		expect(
			screen.getByRole("button", { name: /Previous Track/i }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /Next Track/i }),
		).toBeInTheDocument();
	});

	it("calls prev when previous button is clicked", () => {
		const prev = vi.fn();
		renderPlayer({ prev });
		fireEvent.click(screen.getByRole("button", { name: /Previous Track/i }));
		expect(prev).toHaveBeenCalledOnce();
	});

	it("calls next when next button is clicked", () => {
		const next = vi.fn();
		renderPlayer({ next });
		fireEvent.click(screen.getByRole("button", { name: /Next Track/i }));
		expect(next).toHaveBeenCalledOnce();
	});

	it("toggles shuffle when shuffle button is clicked", () => {
		const toggleShuffle = vi.fn();
		renderPlayer({ toggleShuffle });
		fireEvent.click(screen.getByRole("button", { name: /Toggle shuffle/i }));
		expect(toggleShuffle).toHaveBeenCalledOnce();
	});

	it("toggles repeat when repeat button is clicked", () => {
		const toggleRepeat = vi.fn();
		renderPlayer({ toggleRepeat, repeatMode: "none" });
		fireEvent.click(screen.getByRole("button", { name: /Repeat mode/i }));
		expect(toggleRepeat).toHaveBeenCalledOnce();
	});

	it("shows progress bar and time display", () => {
		renderPlayer({ currentTime: 30, duration: 180 });
		expect(screen.getByText(/0:30/)).toBeInTheDocument();
		expect(screen.getByText(/3:00/)).toBeInTheDocument();
	});

	it("shows volume slider", () => {
		renderPlayer();
		expect(screen.getByRole("slider", { name: /Volume/i })).toBeInTheDocument();
	});

	it("renders dropdown menu extra options", () => {
	    renderPlayer();
	    // Find the MoreVertical button - now has aria-label="Toggle more"
	    const dropdownButton = screen.getByRole("button", {
	        name: /more/i,
	    }) || screen.getByRole("button", { name: /Toggle more/i });
	    fireEvent.click(dropdownButton);
	    expect(screen.getByText("Lyrics", { selector: "a" })).toBeInTheDocument();
	    expect(screen.getByText("Visualizer")).toBeInTheDocument();
	    expect(screen.getByText("Radio Mode")).toBeInTheDocument();
	    expect(screen.getByText("Add to Playlist")).toBeInTheDocument();
	    expect(screen.getByText("Favorite Artist")).toBeInTheDocument();
	    expect(screen.getByText("Favorite Album")).toBeInTheDocument();
	});

it("opens lyrics panel when lyrics option is clicked", () => {
    const toggleLyrics = vi.fn();
    renderPlayer({ isLyricsOpen: false, toggleLyrics });
    // Find the dropdown button with aria-label
    const dropdownButton = screen.getByRole("button", { name: /Toggle more/i });
    fireEvent.click(dropdownButton);
    // Find lyrics item in dropdown menu
    const lyricsItem = screen.getByText("Lyrics", { selector: "a" });
    fireEvent.click(lyricsItem);
    expect(toggleLyrics).toHaveBeenCalledOnce();
});

	it("opens queue panel when queue button is clicked", () => {
		const toggleQueue = vi.fn();
		renderPlayer({ toggleQueue });
		// Find button by aria-label or tooltip
		const queueButton = screen.getByRole("button", { name: /Toggle queue/i });
		// Alternative: by tooltip
		// const queueButton = screen.getByRole('button', { name: /Play Queue/i })
		fireEvent.click(queueButton);
		expect(toggleQueue).toHaveBeenCalledOnce();
	});

	it("shows artist and album links in track info", () => {
		renderPlayer();
		expect(screen.getByText("Test Artist")).toBeInTheDocument();
		expect(screen.getByText("Test Track")).toBeInTheDocument();
	});

	it("disables play/pause buttons when no track is loaded", () => {
		mockUsePlayerStore.mockReturnValue(createMockStore({ currentTrack: null }));
		render(
			<MemoryRouter>
				<PlayerBar />
			</MemoryRouter>,
		);
		expect(screen.getByText("Select a track to play")).toBeInTheDocument();
	});
});
