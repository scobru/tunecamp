import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import AdminReleaseEditor from "../AdminReleaseEditor";
import { useAuthStore } from "../../stores/useAuthStore";
import { useWalletStore } from "../../stores/useWalletStore";
import API from "../../services/api";

vi.mock("../../stores/useAuthStore");
vi.mock("../../stores/useWalletStore");
vi.mock("../../services/api");
vi.mock("../../utils/confirm", () => ({ confirm: vi.fn().mockResolvedValue(true) }));
vi.mock("../../utils/notify", () => ({
	notify: {
		success: vi.fn(),
		error: vi.fn(),
		warning: vi.fn(),
		info: vi.fn(),
	},
}));

const mockAPI = vi.mocked(API);

/** The editor renders `/admin/release/new`, so nothing is loaded from an id. */
const renderEditor = () =>
	render(
		<MemoryRouter initialEntries={["/admin/release/new"]}>
			<AdminReleaseEditor />
		</MemoryRouter>,
	);

const audioFile = (name = "track.mp3") =>
	new File(["audio"], name, { type: "audio/mpeg" });

const queueAudio = async (file: File) => {
	const input = document.querySelector('input[accept="audio/*"]')!;
	await act(async () => {
		fireEvent.change(input, { target: { files: [file] } });
	});
};

beforeEach(() => {
	vi.clearAllMocks();

	// jsdom ships no <dialog> methods; the editor mounts modals that call them.
	window.HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
		this.setAttribute("open", "");
	});
	window.HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
		this.removeAttribute("open");
	});

	vi.mocked(useAuthStore).mockReturnValue({
		isAuthenticated: true,
		isLoading: false,
		role: "admin",
		user: { id: 1, username: "artist", artistId: "7" },
	} as any);
	vi.mocked(useWalletStore).mockReturnValue({ signer: null, isConnected: false } as any);

	vi.stubGlobal(
		"fetch",
		vi.fn().mockResolvedValue({ json: async () => ({ web3Enabled: false }) }),
	);

	mockAPI.getArtists.mockResolvedValue([{ id: 7, name: "Test Artist" }] as any);
	mockAPI.getUsers.mockResolvedValue([] as any);
	mockAPI.inspectAudioTags.mockResolvedValue({ tags: { title: "Tagged Title" } } as any);
	mockAPI.createRelease.mockResolvedValue({ id: 42, slug: "new-release" } as any);
	mockAPI.updateRelease.mockResolvedValue({} as any);
	mockAPI.getAdminRelease.mockResolvedValue({
		id: 42,
		slug: "new-release",
		title: "My Release",
		artist_id: 7,
		type: "album",
		year: 2026,
		tracks: [],
	} as any);
	mockAPI.getReleaseCoverUrl.mockReturnValue("/cover.jpg");
	mockAPI.uploadTracks.mockResolvedValue(undefined as any);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("AdminReleaseEditor uploads", () => {
	it("offers an Upload button only once audio is queued", async () => {
		renderEditor();
		await waitFor(() => expect(mockAPI.getArtists).toHaveBeenCalled());

		expect(screen.queryByRole("button", { name: /Upload 1 file/i })).not.toBeInTheDocument();

		await queueAudio(audioFile());

		expect(await screen.findByRole("button", { name: /Upload 1 file/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Upload now/i })).toBeInTheDocument();
	});

	it("uploads without saving-and-closing, and reports the transfer as it goes", async () => {
		let report: ((percent: number) => void) | undefined;
		let finish: (() => void) | undefined;
		mockAPI.uploadTracks.mockImplementation((_files: any, options: any) => {
			report = options.onProgress;
			return new Promise<void>((resolve) => {
				finish = resolve;
			}) as any;
		});

		renderEditor();
		await waitFor(() => expect(mockAPI.getArtists).toHaveBeenCalled());
		await queueAudio(audioFile("intro.mp3"));

		// A title is required for the release the files land in.
		fireEvent.change(screen.getByPlaceholderText(/Release Title/i), {
			target: { value: "My Release" },
		});

		fireEvent.click(await screen.findByRole("button", { name: /Upload now/i }));

		// The release is created first, since a file needs somewhere to land.
		await waitFor(() => expect(mockAPI.createRelease).toHaveBeenCalled());
		await waitFor(() => expect(report).toBeDefined());

		act(() => report!(64));
		await waitFor(() => {
			expect(screen.getAllByText("64%").length).toBeGreaterThan(0);
		});
		expect(screen.getAllByText(/Uploading 1 of 1 — intro.mp3/i).length).toBeGreaterThan(0);

		await act(async () => {
			finish!();
		});

		// One request per file, so each transfer can be measured on its own.
		expect(mockAPI.uploadTracks).toHaveBeenCalledTimes(1);
		expect(mockAPI.uploadTracks.mock.calls[0][0]).toHaveLength(1);
		await waitFor(() => expect(mockAPI.getAdminRelease).toHaveBeenCalled());
	});

	it("keeps a file that failed to upload queued for a retry", async () => {
		mockAPI.uploadTracks.mockRejectedValue(new Error("network died"));

		renderEditor();
		await waitFor(() => expect(mockAPI.getArtists).toHaveBeenCalled());
		await queueAudio(audioFile("broken.mp3"));

		fireEvent.change(screen.getByPlaceholderText(/Release Title/i), {
			target: { value: "My Release" },
		});

		await act(async () => {
			fireEvent.click(await screen.findByRole("button", { name: /Upload now/i }));
		});

		await waitFor(() =>
			expect(screen.getByRole("button", { name: /Upload 1 file/i })).toBeInTheDocument(),
		);
	});
});
