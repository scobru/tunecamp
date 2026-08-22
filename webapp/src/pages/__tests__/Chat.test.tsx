import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Chat from "../Chat";
import {
	usePeerChat,
	type ChatMessage,
	type PeerInfo,
	type RoomInfo,
} from "../../hooks/usePeerChat";
import { useSiteSettingsStore } from "../../stores/useSiteSettingsStore";
import { useAuthStore } from "../../stores/useAuthStore";

vi.mock("../../hooks/usePeerChat", () => ({
	usePeerChat: vi.fn(),
}));

vi.mock("../../stores/useSiteSettingsStore", () => ({
	useSiteSettingsStore: vi.fn(),
	truthy: (v: unknown) => v === true || v === "true" || v === 1 || v === "1",
}));

vi.mock("../../stores/useAuthStore", () => ({
	useAuthStore: vi.fn(),
}));

const chatDefaults = {
	messages: [] as ChatMessage[],
	status: "online",
	username: "me",
	isAdmin: false,
	peers: [] as PeerInfo[],
	rooms: [] as RoomInfo[],
	createRoom: vi.fn(async () => null as RoomInfo | null),
	deleteRoom: vi.fn(async () => true),
	leaveRoom: vi.fn(async () => true),
	sendRoomMessage: vi.fn(() => true),
	roomUnreadCounts: {} as Record<number, number>,
	clearRoomUnread: vi.fn(),
	roomPassphrases: {} as Record<number, string>,
	setRoomPassphrase: vi.fn(),
	clearRoomPassphrase: vi.fn(),
	hasRoomPassphrase: vi.fn(() => false),
	keyChanges: {},
	acceptKeyChange: vi.fn(),
	unreadCounts: {},
	clearUnread: vi.fn(),
	sendMessage: vi.fn(async () => true),
	sendAdminAction: vi.fn(),
	formatUser: (user: string) => user,
	client: { getInstanceName: () => "instanceA" },
};

const mockChat = (overrides: Partial<typeof chatDefaults> = {}) => {
	const chat = { ...chatDefaults, ...overrides };
	vi.mocked(usePeerChat).mockReturnValue(chat as any);
	return chat;
};

const messageBox = () =>
	screen.getByPlaceholderText(/Encrypted message|Message or|Message #/);
const peerBox = () =>
	screen.getByPlaceholderText("Peer username (empty = lobby)");

describe("Chat page", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(useSiteSettingsStore).mockReturnValue({
			settings: { peerChatEnabled: "true" },
			fetchFlags: vi.fn(),
		} as any);
		vi.mocked(useAuthStore).mockReturnValue({ role: "user" } as any);
	});

	test("keeps the draft when the client refuses to send it unencrypted", async () => {
		const chat = mockChat({ sendMessage: vi.fn(async () => false) });
		render(<Chat />);

		fireEvent.change(peerBox(), { target: { value: "bob" } });
		fireEvent.change(messageBox(), { target: { value: "secret" } });
		fireEvent.click(screen.getByRole("button", { name: /send/i }));

		await waitFor(() =>
			expect(chat.sendMessage).toHaveBeenCalledWith("bob", "secret"),
		);
		expect(messageBox()).toHaveValue("secret");
	});

	test("clears the draft once the message is actually sent", async () => {
		mockChat({ sendMessage: vi.fn(async () => true) });
		render(<Chat />);

		fireEvent.change(messageBox(), { target: { value: "hello lobby" } });
		fireEvent.click(screen.getByRole("button", { name: /send/i }));

		await waitFor(() => expect(messageBox()).toHaveValue(""));
	});

	test("shows both fingerprints and re-pins the peer only after the user confirms", () => {
		const chat = mockChat({
			keyChanges: {
				bob: { peerId: "bob", pinned: "AA:BB", offered: "CC:DD" },
			},
		});
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
		render(<Chat />);

		fireEvent.change(peerBox(), { target: { value: "bob" } });

		expect(screen.getByText(/encryption key changed/i)).toBeInTheDocument();
		expect(screen.getByText(/AA:BB/)).toBeInTheDocument();
		expect(screen.getByText(/CC:DD/)).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: /accept new key/i }));
		expect(chat.acceptKeyChange).toHaveBeenCalledWith("bob");

		confirmSpy.mockRestore();
	});

	test("leaves the peer pinned when the user declines the key change", () => {
		const chat = mockChat({
			keyChanges: {
				bob: { peerId: "bob", pinned: "AA:BB", offered: "CC:DD" },
			},
		});
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
		render(<Chat />);

		fireEvent.change(peerBox(), { target: { value: "bob" } });
		fireEvent.click(screen.getByRole("button", { name: /accept new key/i }));

		expect(chat.acceptKeyChange).not.toHaveBeenCalled();
		confirmSpy.mockRestore();
	});

	describe("rooms", () => {
		const room = (over: Partial<RoomInfo> = {}): RoomInfo => ({
			id: 3,
			globalId: "g3",
			name: "listening-party",
			description: null,
			is_private: false,
			created_by: "someone-else",
			member_count: 2,
			...over,
		});

		test("sends to the selected room instead of the lobby", async () => {
			const chat = mockChat({ rooms: [room()] });
			render(<Chat />);

			fireEvent.click(screen.getByRole("button", { name: /^listening-party/ }));
			fireEvent.change(messageBox(), { target: { value: "anyone around?" } });
			fireEvent.click(screen.getByRole("button", { name: /send/i }));

			await waitFor(() =>
				expect(chat.sendRoomMessage).toHaveBeenCalledWith(3, "anyone around?"),
			);
			expect(chat.sendMessage).not.toHaveBeenCalled();
		});

		test("selecting a room clears an active DM target", () => {
			mockChat({ rooms: [room()] });
			render(<Chat />);

			fireEvent.change(peerBox(), { target: { value: "bob" } });
			fireEvent.click(screen.getByRole("button", { name: /^listening-party/ }));

			// The peer field is replaced by the room label once a room is active.
			expect(
				screen.queryByPlaceholderText("Peer username (empty = lobby)"),
			).toBeNull();
			expect(
				screen.getByPlaceholderText("Message #listening-party..."),
			).toBeInTheDocument();
		});

		test("creates a room and opens it", async () => {
			const created = room({ id: 9, name: "new-room" });
			const chat = mockChat({
				rooms: [],
				createRoom: vi.fn(async () => created),
			});
			render(<Chat />);

			fireEvent.click(screen.getByRole("button", { name: /new room/i }));
			fireEvent.change(screen.getByPlaceholderText(/room name/i), {
				target: { value: "new-room" },
			});
			fireEvent.click(screen.getByRole("button", { name: /create room/i }));

			await waitFor(() =>
				expect(chat.createRoom).toHaveBeenCalledWith(
					"new-room",
					undefined,
					false,
				),
			);
		});

		test("offers Delete only to the room creator", () => {
			mockChat({
				rooms: [room({ created_by: "me" }), room({ id: 4, name: "theirs" })],
			});
			render(<Chat />);

			expect(screen.getByTitle("Delete listening-party")).toBeInTheDocument();
			expect(screen.queryByTitle("Delete theirs")).toBeNull();
			expect(screen.getByTitle("Leave theirs")).toBeInTheDocument();
		});

		test("deletes only after the user confirms", () => {
			const chat = mockChat({ rooms: [room({ created_by: "me" })] });
			const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
			render(<Chat />);

			fireEvent.click(screen.getByTitle("Delete listening-party"));
			expect(chat.deleteRoom).not.toHaveBeenCalled();

			confirmSpy.mockReturnValue(true);
			fireEvent.click(screen.getByTitle("Delete listening-party"));
			expect(chat.deleteRoom).toHaveBeenCalledWith(3);

			confirmSpy.mockRestore();
		});

		test("shows room banner with delete action when room is active", () => {
			const active = room({ id: 5, name: "my-active-room", created_by: "me" });
			mockChat({ rooms: [active] });
			render(<Chat />);

			// Select the room
			fireEvent.click(screen.getByRole("button", { name: /^my-active-room/ }));

			// Should have active room header with Leave and Delete room
			expect(screen.getByText("Elimina stanza")).toBeInTheDocument();
			expect(screen.getByText("Esci")).toBeInTheDocument();
		});

		test("allows admin to delete rooms created by other users", () => {
			vi.mocked(useAuthStore).mockReturnValue({ role: "admin" } as any);
			mockChat({
				rooms: [room({ id: 4, name: "other-user-room", created_by: "other" })],
				isAdmin: true,
			});
			render(<Chat />);

			expect(screen.getByTitle("Delete other-user-room")).toBeInTheDocument();
		});

		test("counts unread room traffic separately from DMs", () => {
			mockChat({ rooms: [room()], roomUnreadCounts: { 3: 4 } });
			render(<Chat />);

			expect(screen.getByText("4")).toBeInTheDocument();
		});
	});

	test("flags a peer whose key changed in the connected list", () => {
		mockChat({
			peers: [{ username: "bob", pubkey: true }],
			keyChanges: {
				bob: { peerId: "bob", pinned: "AA:BB", offered: "CC:DD" },
			},
		});
		render(<Chat />);

		expect(screen.getByLabelText(/key changed/i)).toBeInTheDocument();
		expect(screen.queryByLabelText("E2E ready")).not.toBeInTheDocument();
	});
});
