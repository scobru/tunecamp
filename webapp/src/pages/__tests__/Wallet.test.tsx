import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Wallet from "../Wallet";
import { useWalletStore } from "../../stores/useWalletStore";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../stores/useWalletStore");
vi.mock("../../hooks/useOwnedNFTs", () => ({
	useOwnedNFTs: vi.fn(() => ({
		ownedNFTs: [],
		loading: false,
	})),
}));

describe("Wallet Page", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("renders connect button when wallet is disconnected", () => {
		vi.mocked(useWalletStore).mockReturnValue({
			address: null,
			balanceEth: "0.0",
			balanceUsdc: "0.0",
			isConnected: false,
			isConnecting: false,
			connect: vi.fn(),
			disconnect: vi.fn(),
			tryReconnect: vi.fn(),
			refreshBalances: vi.fn(),
			error: null,
		} as any);

		render(
			<MemoryRouter>
				<Wallet />
			</MemoryRouter>,
		);

		expect(screen.getByRole("heading", { name: "Wallet" })).toBeInTheDocument();
		expect(screen.getByText("Connect Wallet")).toBeInTheDocument();
	});

	it("renders address and balances when connected", () => {
		vi.mocked(useWalletStore).mockReturnValue({
			address: "0x1234567890abcdef1234567890abcdef12345678",
			balanceEth: "1.45",
			balanceUsdc: "250.00",
			isConnected: true,
			isConnecting: false,
			connect: vi.fn(),
			disconnect: vi.fn(),
			tryReconnect: vi.fn(),
			refreshBalances: vi.fn(),
			error: null,
		} as any);

		render(
			<MemoryRouter>
				<Wallet />
			</MemoryRouter>,
		);

		expect(screen.getByText(/1\.4500/)).toBeInTheDocument();
		expect(screen.getByText(/250\.00/)).toBeInTheDocument();
		expect(screen.getByText("0x1234...5678")).toBeInTheDocument();
	});
});
