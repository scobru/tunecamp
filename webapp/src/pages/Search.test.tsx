import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Search from './Search'
import { useAuthStore } from '../stores/useAuthStore'
import { MemoryRouter } from 'react-router-dom'
import API from '../services/api'

// Mock the stores and services
vi.mock('../stores/useAuthStore')
vi.mock('../stores/usePlayerStore', () => ({
  usePlayerStore: vi.fn(() => ({
    currentTrack: null,
    isPlaying: false,
    playTrack: vi.fn(),
    togglePlay: vi.fn(),
  })),
}))

vi.mock('../services/api', () => ({
  default: {
    globalSearch: vi.fn(() => Promise.resolve({
      local: {
        tracks: [{ id: 't1', title: 'Unique Track', artistName: 'Track Artist', albumId: 'al1', duration: 180 }],
        albums: [{ id: 'al1', title: 'Unique Album', artistName: 'Album Artist', coverImage: '' }],
        artists: [{ id: 'ar1', name: 'Unique Artist', slug: 'unique-artist', coverImage: '' }]
      }
    })),
    getPlaylists: vi.fn(() => Promise.resolve([])),
    getStarredTracks: vi.fn(() => Promise.resolve([])),
    getStarredAlbums: vi.fn(() => Promise.resolve([])),
    getStarredArtists: vi.fn(() => Promise.resolve([])),
    getArtistCoverUrl: vi.fn((id) => `cover-url-artist-${id}`),
    getAlbumCoverUrl: vi.fn((id) => `cover-url-album-${id}`),
    getReleaseCoverUrl: vi.fn((id) => `cover-url-release-${id}`),
  },
}))

describe('Search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuthStore).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      role: 'user',
      user: { username: 'testuser' },
    } as any)
  })

  it('renders search input and allows typing', () => {
    render(
      <MemoryRouter>
        <Search />
      </MemoryRouter>
    )

    expect(screen.getByPlaceholderText(/Search for songs, artists, albums.../i)).toBeInTheDocument()
  })

  it('performs search and displays results', async () => {
    render(
      <MemoryRouter initialEntries={['/search?q=local']}>
        <Search />
      </MemoryRouter>
    )

    // Verify globalSearch was called with query
    expect(API.globalSearch).toHaveBeenCalledWith('local')

    // Wait for the results to load
    await waitFor(() => {
      expect(screen.getByText('Unique Track')).toBeInTheDocument()
      expect(screen.getByText('Unique Album')).toBeInTheDocument()
      expect(screen.getByText('Unique Artist')).toBeInTheDocument()
    })
  })
})
