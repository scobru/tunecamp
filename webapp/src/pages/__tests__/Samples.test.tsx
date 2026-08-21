import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import SamplesPage from "../Samples";
import { MemoryRouter } from "react-router-dom";
import API from "../../services/api";

vi.mock("../../services/api", () => ({
	default: {
		getSamples: vi.fn(() =>
			Promise.resolve([
				{
					id: 1,
					title: "Vintage Drum Loop",
					artistName: "BeatMaker",
					license: "cc0",
					bpm: 120,
					musicalKey: "Am",
					downloadCount: 5,
				},
			]),
		),
		getSamplePacks: vi.fn(() =>
			Promise.resolve([
				{
					id: 10,
					title: "808 Essentials Pack",
					artistName: "Trap Guru",
					license: "cc0",
					sampleCount: 50,
				},
			]),
		),
		getSampleWaveformUrl: vi.fn((id) => `/waveform/sample/${id}`),
		getSampleAudioUrl: vi.fn((id) => `/audio/sample/${id}`),
		getSamplePackCoverUrl: vi.fn((id) => `/cover/pack/${id}`),
		getSampleDownloadUrl: vi.fn((id) => `/download/sample/${id}`),
	},
}));

vi.mock("../../components/player/Waveform", () => ({
	Waveform: () => <div data-testid="waveform" />,
}));

describe("Samples Page", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("renders sample packs and individual sample items", async () => {
		render(
			<MemoryRouter>
				<SamplesPage />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByText("Vintage Drum Loop")).toBeInTheDocument();
			expect(screen.getByText("808 Essentials Pack")).toBeInTheDocument();
			expect(screen.getByText(/120 BPM · Am/i)).toBeInTheDocument();
		});
	});
});
