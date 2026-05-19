import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Search from './Search'
import { useAuthStore } from '../stores/useAuthStore'
import { MemoryRouter } from 'react-router-dom'

// Mock the stores and services
vi.mock('zen', () => ({
  default: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockReturnThis(),
    put: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    once: vi.fn().mockReturnThis(),
    map: vi.fn().mockReturnThis(),
  })),
}))

vi.mock('../services/zen', () => ({
  ZenAuth: {
    init: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    getProfile: vi.fn(),
  },
  ZenSocial: {
    isLiked: vi.fn(),
  },
  ZenPlaylists: {
    getMyPlaylists: vi.fn(),
  }
}))

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
      local: { tracks: [], albums: [], artists: [] },
      external: [{ id: '1', title: 'Ext Track', artist: 'Ext Artist', source: 'spotify' }],
      streaming: [{ id: '2', title: 'Stream Track', artist: 'Stream Artist', source: 'youtube', isStreaming: true }]
    })),
    getPlaylists: vi.fn(() => Promise.resolve([])),
    getStarredTracks: vi.fn(() => Promise.resolve([])),
    getStarredAlbums: vi.fn(() => Promise.resolve([])),
    getStarredArtists: vi.fn(() => Promise.resolve([])),
  },
}))

describe('Search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does NOT show Discover section for normal users', async () => {
    vi.mocked(useAuthStore).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      role: 'user',
      user: { username: 'testuser' },
    } as any)

    render(
      <MemoryRouter initialEntries={['/search?q=test']}>
        <Search />
      </MemoryRouter>
    )

    // Wait for the search to complete
    const discoverSection = await screen.queryByText(/Discover \(External & Streaming\)/i)
    expect(discoverSection).not.toBeInTheDocument()
  })

  it('SHOWS Discover section for admin users', async () => {
    vi.mocked(useAuthStore).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      role: 'admin',
      user: { username: 'adminuser' },
    } as any)

    render(
      <MemoryRouter initialEntries={['/search?q=test']}>
        <Search />
      </MemoryRouter>
    )

    // Wait for the search to complete and section to appear
    const discoverSection = await screen.findByText(/Discover \(External & Streaming\)/i)
    expect(discoverSection).toBeInTheDocument()
    expect(screen.getByText('Ext Track')).toBeInTheDocument()
    expect(screen.getByText('Stream Track')).toBeInTheDocument()
  })
})
