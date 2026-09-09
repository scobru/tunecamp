import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { UploadProgress } from "./UploadProgress";

describe("UploadProgress", () => {
	it("shows the label and the rounded percentage", () => {
		render(<UploadProgress label="Uploading — kick.wav" percent={42.4} />);

		expect(screen.getByText("Uploading — kick.wav")).toBeInTheDocument();
		expect(screen.getByText("42%")).toBeInTheDocument();
		expect(screen.getByRole("progressbar")).toHaveAttribute("value", "42");
	});

	it("clamps a percentage outside 0-100", () => {
		const { rerender } = render(<UploadProgress label="Sending" percent={140} />);
		expect(screen.getByRole("progressbar")).toHaveAttribute("value", "100");

		rerender(<UploadProgress label="Sending" percent={-10} />);
		expect(screen.getByRole("progressbar")).toHaveAttribute("value", "0");
	});

	it("claims no number when there is no total to measure against", () => {
		render(<UploadProgress label="Sending" percent={0} indeterminate />);

		// No `value` attribute is what makes the bar animate rather than sit at 0%.
		expect(screen.getByRole("progressbar")).not.toHaveAttribute("value");
		expect(screen.queryByText("0%")).not.toBeInTheDocument();
	});

	it("renders the detail line when given one", () => {
		render(<UploadProgress label="Sending" percent={10} detail="12.4 MB" />);
		expect(screen.getByText("12.4 MB")).toBeInTheDocument();
	});
});
