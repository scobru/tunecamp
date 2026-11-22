import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import Library from './Library';
import API from '../services/api';
import { useAuthStore } from '../stores/useAuthStore';

vi.mock('../stores/useAuthStore', () => ({
  useAuthStore: vi.fn(),
}));

vi.mock('../stores/usePlayerStore', () => ({
  usePlayerStore: vi.fn(() => ({
    playTrack: vi.fn(),
  })),
}));

vi.mock('../components/modals/CreateUserPlaylistModal', () => ({
  CreateUserPlaylistModal: () => null,
}));

vi.mock('../services/api', () => ({
  default: {
    getTracks: vi.fn(),
    getAlbums: vi.fn(),
    getReleases: vi.fn(),
    getArtists: vi.fn(),
    getPlaylists: vi.fn(),
    unstarTrack: vi.fn(),
    unstarAlbum: vi.fn(),
    unstarArtist: vi.fn(),
    getReleaseCoverUrl: vi.fn((id) => `/api/releases/${id}/cover`),
    getAlbumCoverUrl: vi.fn((id) => `/api/albums/${id}/cover`),
    getArtistCoverUrl: vi.fn((id) => `/api/artists/${id}/cover`),
  },
}));

function renderLibrary(initialUrl = '/library?tab=albums') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <Library />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Library page — Albums tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuthStore).mockReturnValue({
      isAuthenticated: true,
      isInitializing: false,
      user: { username: 'fid_user' },
    } as any);
    vi.mocked(API.getTracks).mockResolvedValue([]);
    vi.mocked(API.getArtists).mockResolvedValue([]);
    vi.mocked(API.getPlaylists).mockResolvedValue([]);
    vi.mocked(API.unstarAlbum).mockResolvedValue({ success: true, starred: false });
  });

  it('keeps starred formal releases even when releases payload lacks starred flag, and links to /releases/...', async () => {
    vi.mocked(API.getAlbums).mockResolvedValue([
      {
        id: 7,
        title: 'Playground',
        slug: 'playground',
        artistName: 'Homologo',
        year: 2026,
        type: 'album',
        is_release: true,
        starred: true,
      } as any,
      {
        id: 12,
        title: 'Tape Vault',
        slug: 'tape-vault',
        artistName: 'Homologo',
        year: 2025,
        type: 'album',
        is_release: false,
        starred: true,
      } as any,
    ]);
    vi.mocked(API.getReleases).mockResolvedValue([
      {
        id: 7,
        title: 'Playground',
        slug: 'playground',
        artistName: 'Homologo',
        year: 2026,
        type: 'album',
        is_formal_release: true,
        // intentionally omit `starred` to verify merge preserves starred: true
      } as any,
    ]);

    renderLibrary('/library?tab=albums');

    expect(await screen.findByText('Playground')).toBeInTheDocument();
    expect(screen.getByText('Tape Vault')).toBeInTheDocument();

    const albumsTab = screen.getByRole('button', { name: /Albums/i });
    expect(albumsTab).toHaveTextContent('2');

    const playgroundLink = screen.getByText('Playground').closest('a');
    expect(playgroundLink).toHaveAttribute('href', '/releases/playground');

    const tapeVaultLink = screen.getByText('Tape Vault').closest('a');
    expect(tapeVaultLink).toHaveAttribute('href', '/albums/tape-vault');
  });

  it('unstars an album and removes it from the list and tab count', async () => {
    vi.mocked(API.getAlbums).mockResolvedValue([]);
    vi.mocked(API.getReleases).mockResolvedValue([
      {
        id: 9,
        title: 'Waterflow',
        slug: 'waterflow',
        artistName: 'Homologo',
        year: 2026,
        type: 'album',
        is_formal_release: true,
        starred: true,
      } as any,
    ]);

    renderLibrary('/library?tab=albums');

    expect(await screen.findByText('Waterflow')).toBeInTheDocument();
    const removeBtn = screen.getByTitle('Remove from favorites');
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(API.unstarAlbum).toHaveBeenCalledWith(9);
      expect(screen.queryByText('Waterflow')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Albums/i })).toHaveTextContent('0');
  });
});
