import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { UploadTracksModal } from "./UploadTracksModal";
import { useAuthStore } from "../../stores/useAuthStore";
import API from "../../services/api";

// Mock dependencies
vi.mock("../../stores/useAuthStore");
vi.mock("../../services/api");
vi.mock("../../utils/confirm", () => ({
	confirm: vi.fn().mockResolvedValue(true),
}));

const mockUseAuthStore = vi.mocked(useAuthStore);
const mockAPI = vi.mocked(API);

beforeEach(() => {
	vi.clearAllMocks();
	mockUseAuthStore.mockReturnValue({
		isAuthenticated: true,
		isLoading: false,
		role: "user",
		user: { username: "testuser" },
		isAdminAuthenticated: false,
		isInitializing: false,
	} as any);

	mockAPI.getArtists.mockResolvedValue([]);
	mockAPI.getAlbums.mockResolvedValue([]);
	mockAPI.uploadTracks.mockResolvedValue(undefined);
	mockAPI.getAlbum.mockResolvedValue({
		id: "test-slug",
		title: "Test Album",
		artistId: "123",
		type: "album",
		tracks: [
			{
				id: "1",
				title: "Existing Track",
				duration: 180,
				artistId: "456",
				albumId: "test-slug",
				path: "/audio/track.mp3",
				filename: "track.mp3",
				playCount: 5,
			},
		],
	});

	window.HTMLDialogElement.prototype.showModal = vi.fn();
	window.HTMLDialogElement.prototype.close = vi.fn();
});

const renderModal = (props = {}) => {
	render(
		<MemoryRouter>
			<UploadTracksModal {...props} />
		</MemoryRouter>,
	);
	document.dispatchEvent(new CustomEvent("open-upload-tracks-modal"));
	expect(screen.getByText("Upload Tracks")).toBeInTheDocument();
};

describe("UploadTracksModal", () => {
	it("renders upload form by default", () => {
		renderModal();
		expect(screen.getByRole("button", { name: /Album/i })).toBeInTheDocument();
		expect(screen.getByText("Release")).toBeInTheDocument();
		expect(screen.getByText("Artist Name")).toBeInTheDocument();
		expect(screen.getByText("Library Album Title")).toBeInTheDocument();
	});

	it("switches to release mode when release data passed", async () => {
		renderModal();
		document.dispatchEvent(
			new CustomEvent("open-upload-tracks-modal", {
				detail: {
					slug: "test-release",
					title: "Test Album",
					artistName: "Test Artist",
				},
			}),
		);
		expect(screen.getByText("Adding to: Test Album")).toBeInTheDocument();
	});

	it("handles file selection", async () => {
		renderModal();
		// File input is not associated with label, so we need a different approach
		// Looking for the actual input element in the document
		const inputs = screen.getAllByRole("button", { hidden: true });
		// Actually, let's look for the file input directly
		const fileInput = document.querySelector('input[type="file"]');
		expect(fileInput).toBeInTheDocument();
		const file = new File(["audio content"], "test.mp3", {
			type: "audio/mpeg",
		});
		fireEvent.change(fileInput, { target: { files: [file] } });
		expect(screen.getByText("test.mp3")).toBeInTheDocument();
	});

	it("submits form and shows progress", async () => {
		renderModal();
		const fileInput = document.querySelector('input[type="file"]');
		const file = new File(["audio content"], "test.mp3", {
			type: "audio/mpeg",
		});
		fireEvent.change(fileInput, { target: { files: [file] } });

		fireEvent.click(screen.getByRole("button", { name: /Start Upload/i }));

		await waitFor(() => {
			expect(screen.getByRole("progressbar")).toBeInTheDocument();
		});
		expect(mockAPI.uploadTracks).toHaveBeenCalled();
	});

	it("shows error on upload failure", async () => {
		mockAPI.uploadTracks.mockRejectedValueOnce(new Error("Upload failed"));
		renderModal();
		const fileInput = document.querySelector('input[type="file"]');
		const file = new File(["audio content"], "test.mp3", {
			type: "audio/mpeg",
		});
		fireEvent.change(fileInput, { target: { files: [file] } });

		fireEvent.click(screen.getByRole("button", { name: /Start Upload/i }));

		await waitFor(() => {
			expect(screen.getByText(/Upload failed/i)).toBeInTheDocument();
		});
	});

	it("shows success message on upload complete", async () => {
		renderModal();
		const fileInput = document.querySelector('input[type="file"]');
		const file = new File(["audio content"], "test.mp3", {
			type: "audio/mpeg",
		});
		fireEvent.change(fileInput, { target: { files: [file] } });

		fireEvent.click(screen.getByRole("button", { name: /Start Upload/i }));

		await waitFor(() => {
			expect(
				screen.getByText(/Successfully uploaded all 1 tracks/i),
			).toBeInTheDocument();
		});
	});

	it("calls onUploadComplete callback", async () => {
		const onComplete = vi.fn();
		renderModal({ onUploadComplete: onComplete });
		const fileInput = document.querySelector('input[type="file"]');
		const file = new File(["audio content"], "test.mp3", {
			type: "audio/mpeg",
		});
		fireEvent.change(fileInput, { target: { files: [file] } });

		fireEvent.click(screen.getByRole("button", { name: /Start Upload/i }));

		await waitFor(() => {
			expect(onComplete).toHaveBeenCalled();
		});
	});

	it("closes modal on close button", () => {
		renderModal();
		fireEvent.click(screen.getByRole("button", { name: /Close/i }));
		expect(window.HTMLDialogElement.prototype.close).toHaveBeenCalled();
	});

	it("shows existing tracks when release has tracks", async () => {
		renderModal();
		document.dispatchEvent(
			new CustomEvent("open-upload-tracks-modal", {
				detail: { slug: "test-release", title: "Test Album" },
			}),
		);
		await waitFor(() => {
			expect(screen.getByText("Existing Track")).toBeInTheDocument();
		});
	});
});
