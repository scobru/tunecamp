import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Chat from '../Chat';
import { usePeerChat, type ChatMessage, type PeerInfo } from '../../hooks/usePeerChat';
import { useSiteSettingsStore } from '../../stores/useSiteSettingsStore';
import { useAuthStore } from '../../stores/useAuthStore';

vi.mock('../../hooks/usePeerChat', () => ({
    usePeerChat: vi.fn(),
}));

vi.mock('../../stores/useSiteSettingsStore', () => ({
    useSiteSettingsStore: vi.fn(),
    truthy: (v: unknown) => v === true || v === 'true' || v === 1 || v === '1',
}));

vi.mock('../../stores/useAuthStore', () => ({
    useAuthStore: vi.fn(),
}));

const chatDefaults = {
    messages: [] as ChatMessage[],
    status: 'online',
    username: 'me',
    isAdmin: false,
    peers: [] as PeerInfo[],
    keyChanges: {},
    acceptKeyChange: vi.fn(),
    unreadCounts: {},
    clearUnread: vi.fn(),
    sendMessage: vi.fn(async () => true),
    sendAdminAction: vi.fn(),
    formatUser: (user: string) => user,
    client: { getInstanceName: () => 'instanceA' },
};

const mockChat = (overrides: Partial<typeof chatDefaults> = {}) => {
    const chat = { ...chatDefaults, ...overrides };
    vi.mocked(usePeerChat).mockReturnValue(chat as any);
    return chat;
};

const messageBox = () => screen.getByPlaceholderText(/Encrypted message|Message or/);
const peerBox = () => screen.getByPlaceholderText('Peer username (empty = lobby)');

describe('Chat page', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useSiteSettingsStore).mockReturnValue({
            settings: { peerChatEnabled: 'true' },
            fetchFlags: vi.fn(),
        } as any);
        vi.mocked(useAuthStore).mockReturnValue({ role: 'user' } as any);
    });

    test('keeps the draft when the client refuses to send it unencrypted', async () => {
        const chat = mockChat({ sendMessage: vi.fn(async () => false) });
        render(<Chat />);

        fireEvent.change(peerBox(), { target: { value: 'bob' } });
        fireEvent.change(messageBox(), { target: { value: 'secret' } });
        fireEvent.click(screen.getByRole('button', { name: /send/i }));

        await waitFor(() => expect(chat.sendMessage).toHaveBeenCalledWith('bob', 'secret'));
        expect(messageBox()).toHaveValue('secret');
    });

    test('clears the draft once the message is actually sent', async () => {
        mockChat({ sendMessage: vi.fn(async () => true) });
        render(<Chat />);

        fireEvent.change(messageBox(), { target: { value: 'hello lobby' } });
        fireEvent.click(screen.getByRole('button', { name: /send/i }));

        await waitFor(() => expect(messageBox()).toHaveValue(''));
    });

    test('shows both fingerprints and re-pins the peer only after the user confirms', () => {
        const chat = mockChat({
            keyChanges: {
                bob: { peerId: 'bob', pinned: 'AA:BB', offered: 'CC:DD' },
            },
        });
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
        render(<Chat />);

        fireEvent.change(peerBox(), { target: { value: 'bob' } });

        expect(screen.getByText(/encryption key changed/i)).toBeInTheDocument();
        expect(screen.getByText(/AA:BB/)).toBeInTheDocument();
        expect(screen.getByText(/CC:DD/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /accept new key/i }));
        expect(chat.acceptKeyChange).toHaveBeenCalledWith('bob');

        confirmSpy.mockRestore();
    });

    test('leaves the peer pinned when the user declines the key change', () => {
        const chat = mockChat({
            keyChanges: {
                bob: { peerId: 'bob', pinned: 'AA:BB', offered: 'CC:DD' },
            },
        });
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
        render(<Chat />);

        fireEvent.change(peerBox(), { target: { value: 'bob' } });
        fireEvent.click(screen.getByRole('button', { name: /accept new key/i }));

        expect(chat.acceptKeyChange).not.toHaveBeenCalled();
        confirmSpy.mockRestore();
    });

    test('flags a peer whose key changed in the connected list', () => {
        mockChat({
            peers: [{ username: 'bob', pubkey: true }],
            keyChanges: {
                bob: { peerId: 'bob', pinned: 'AA:BB', offered: 'CC:DD' },
            },
        });
        render(<Chat />);

        expect(screen.getByLabelText(/key changed/i)).toBeInTheDocument();
        expect(screen.queryByLabelText('E2E ready')).not.toBeInTheDocument();
    });
});
