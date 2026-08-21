import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import About from "../About";
import { MemoryRouter } from "react-router-dom";

describe("About Page", () => {
	it("renders title, mission statement, and feature cards", () => {
		render(
			<MemoryRouter>
				<About />
			</MemoryRouter>,
		);

		expect(screen.getByRole("heading", { name: "About TuneCamp" })).toBeInTheDocument();
		expect(screen.getByText("Core Architecture")).toBeInTheDocument();
		expect(screen.getByText("Music Management")).toBeInTheDocument();
		expect(screen.getByText("Connectivity")).toBeInTheDocument();
	});
});
