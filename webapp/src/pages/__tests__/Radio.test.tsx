import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import RadioPage from "../Radio";
import API from "../../services/api";

vi.mock("../../services/api", () => ({
	default: {
		getRadioStatus: vi.fn(() =>
			Promise.resolve({
				active: true,
				name: "TuneCamp FM",
				currentTrack: { id: 10, title: "Midnight Stream", artist_name: "Radio DJ" },
				listenerCount: 42,
				hlsUrl: "/stream/live.m3u8",
				startedAt: new Date().toISOString(),
			}),
		),
	},
}));

describe("Radio Page", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("renders active radio station name, DJ track and listener count", async () => {
		render(<RadioPage />);

		await waitFor(() => {
			expect(screen.getByText("TuneCamp FM")).toBeInTheDocument();
			expect(screen.getByText("Midnight Stream")).toBeInTheDocument();
			expect(screen.getByText("Radio DJ")).toBeInTheDocument();
			expect(screen.getByText(/42\s+listener/)).toBeInTheDocument();
		});
	});
});
