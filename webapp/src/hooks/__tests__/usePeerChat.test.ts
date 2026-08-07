import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePeerChat } from '../usePeerChat';
import { useAuthStore } from '../../stores/useAuthStore';
import { useTuneCampChat } from '@tunecamp/chat';

vi.mock('@tunecamp/chat', () => ({
    useTuneCampChat: vi.fn(() => ({ client: { getInstanceName: () => 'instanceA' } })),
    formatUsernameWithInstance: vi.fn((user: string, instance?: string) => `${user}@${instance}`),
}));

vi.mock('../../stores/useAuthStore', () => ({
    useAuthStore: vi.fn(),
}));

describe('usePeerChat', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('passes the chatKeyPair from useAuthStore to useTuneCampChat', () => {
        const pair = { pub: 'p', priv: 's', epub: 'ep', epriv: 'es' };
        vi.mocked(useAuthStore).mockImplementation((selector: any) => selector({ chatKeyPair: pair }));

        renderHook(() => usePeerChat(true, 'peer1'));

        expect(useTuneCampChat).toHaveBeenCalledWith(
            expect.objectContaining({ keyPair: pair }),
            'peer1',
            undefined,
        );
    });

    test('passes undefined keyPair when none has been derived yet (e.g. logged out)', () => {
        vi.mocked(useAuthStore).mockImplementation((selector: any) => selector({ chatKeyPair: null }));

        renderHook(() => usePeerChat(true, 'peer1'));

        expect(useTuneCampChat).toHaveBeenCalledWith(
            expect.objectContaining({ keyPair: undefined }),
            'peer1',
            undefined,
        );
    });

    test('passes activeRoomId to useTuneCampChat', () => {
        vi.mocked(useAuthStore).mockImplementation((selector: any) => selector({ chatKeyPair: null }));

        renderHook(() => usePeerChat(true, 'peer1', 42));

        expect(useTuneCampChat).toHaveBeenCalledWith(
            expect.objectContaining({ keyPair: undefined }),
            'peer1',
            42,
        );
    });
});
