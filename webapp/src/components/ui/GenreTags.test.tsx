import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { GenreTags } from "../GenreTags";

describe("GenreTags Component", () => {
	it("renders tags correctly from comma-separated string", () => {
		render(
			<GenreTags
				genres="Ambient, Synthwave, Electronic"
				canEdit={false}
				onSave={vi.fn()}
			/>,
		);

		expect(screen.getByText("Ambient")).toBeInTheDocument();
		expect(screen.getByText("Synthwave")).toBeInTheDocument();
		expect(screen.getByText("Electronic")).toBeInTheDocument();
	});

	it("renders nothing when genres is empty and cannot edit", () => {
		const { container } = render(
			<GenreTags genres="" canEdit={false} onSave={vi.fn()} />,
		);

		expect(container.firstChild).toBeNull();
	});

	it("calls onSave when removing a tag in edit mode", async () => {
		const onSave = vi.fn().mockImplementation(async () => {});
		render(
			<GenreTags
				genres="Rock, Pop"
				canEdit={true}
				onSave={onSave}
			/>,
		);

		const removeButtons = screen.getAllByRole("button");
		fireEvent.click(removeButtons[0]);

		await waitFor(() => {
			expect(onSave).toHaveBeenCalledWith("Pop");
		});
	});
});
