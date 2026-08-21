import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Dig from "../Dig";
import { useDigStore } from "../../stores/useDigStore";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../stores/useDigStore");
vi.mock("../../stores/usePlayerStore", () => ({
	usePlayerStore: vi.fn(() => ({
		playTrack: vi.fn(),
	})),
}));

describe("Dig Page", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(useDigStore).mockReturnValue({
			query: "",
			setQuery: vi.fn(),
			search: vi.fn(),
			searchResults: [
				{
					url: "https://artist.bandcamp.com/album/ambient-dreams",
					title: "Ambient Dreams",
					artist: "Dreamer",
					coverUrl: "/cover.jpg",
					previewUrl: "/preview.mp3",
				},
			],
			isSearching: false,
			strategy: "balanced",
			setStrategy: vi.fn(),
			runDig: vi.fn(),
			digResult: null,
			isDigging: false,
			digError: null,
			sessions: [{ id: "sess-1", name: "Techno Digging Session" }],
			currentSessionId: "sess-1",
			crate: [],
			history: [],
			loadSessions: vi.fn(),
			createSession: vi.fn(),
			deleteSession: vi.fn(),
			selectSession: vi.fn(),
			addToCrate: vi.fn(),
			removeFromCrate: vi.fn(),
			loadHistory: vi.fn(),
		} as any);
	});

	it("renders digging search results and active session", () => {
		render(
			<MemoryRouter>
				<Dig />
			</MemoryRouter>,
		);

		expect(screen.getByText("Ambient Dreams")).toBeInTheDocument();
		expect(screen.getByText("Dreamer")).toBeInTheDocument();
		expect(screen.getByText("Techno Digging Session")).toBeInTheDocument();
	});
});
