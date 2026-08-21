import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Collab from "../Collab";
import { useAuthStore } from "../../stores/useAuthStore";
import { MemoryRouter } from "react-router-dom";
import API from "../../services/api";

vi.mock("../../stores/useAuthStore");
vi.mock("../../services/api", () => ({
	default: {
		getCollabProjects: vi.fn(() =>
			Promise.resolve([
				{
					id: 1,
					title: "Lo-Fi Jam Session",
					description: "Open stems for guitar and bass",
					created_at: new Date().toISOString(),
				},
			]),
		),
	},
}));

describe("Collab Page", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(useAuthStore).mockReturnValue({
			isAuthenticated: true,
			user: { username: "artist1", role: "admin", can_sell: 1 },
			role: "admin",
		} as any);
	});

	it("renders active collaboration projects", async () => {
		render(
			<MemoryRouter>
				<Collab />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByText("Lo-Fi Jam Session")).toBeInTheDocument();
			expect(screen.getByText("Open stems for guitar and bass")).toBeInTheDocument();
		});
	});
});
