import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Changelog from "../Changelog";
import API from "../../services/api";

vi.mock("../../services/api", () => ({
	default: {
		getChangelog: vi.fn(() =>
			Promise.resolve({
				changelog: "## Version 5.4.0\n- Added full Web3 smart checkout\n- Enhanced P2P chat",
			}),
		),
	},
}));

describe("Changelog Page", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("renders markdown changelog content and heading", async () => {
		render(<Changelog />);

		await waitFor(() => {
			expect(screen.getByRole("heading", { name: "What's New" })).toBeInTheDocument();
			expect(screen.getByText(/Version 5\.4\.0/)).toBeInTheDocument();
			expect(screen.getByText(/Added full Web3 smart checkout/)).toBeInTheDocument();
		});
	});
});
