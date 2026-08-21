import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Releases from "../Releases";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("../../services/api", () => ({
	default: {
		getReleases: vi.fn(() =>
			Promise.resolve([
				{
					id: 1,
					title: "Neon Nights",
					artistName: "Retro Artist",
					type: "album",
					is_release: 1,
					slug: "neon-nights",
				},
				{
					id: 2,
					title: "Summer Vibes Single",
					artistName: "Beach DJ",
					type: "single",
					is_release: 1,
					slug: "summer-vibes-single",
				},
			]),
		),
		getReleaseCoverUrl: vi.fn((id) => `/cover/release/${id}`),
		getAlbumCoverUrl: vi.fn((id) => `/cover/album/${id}`),
	},
}));

describe("Releases Page", () => {
	let queryClient: QueryClient;

	beforeEach(() => {
		vi.clearAllMocks();
		queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
	});

	it("renders releases grid with category tabs and titles", async () => {
		render(
			<QueryClientProvider client={queryClient}>
				<MemoryRouter initialEntries={["/releases"]}>
					<Releases />
				</MemoryRouter>
			</QueryClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByText("Neon Nights")).toBeInTheDocument();
			expect(screen.getByText("Summer Vibes Single")).toBeInTheDocument();
			expect(screen.getByText("Albums")).toBeInTheDocument();
			expect(screen.getByText("Singles")).toBeInTheDocument();
		});
	});
});
