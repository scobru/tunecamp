import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ContentSearch from './ContentSearch'
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
    getSoulseekStatus: vi.fn(() => Promise.resolve([])),
    getTorrents: vi.fn(() => Promise.resolve([])),
  },
}))

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

describe('ContentSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects to home if user is not authenticated', () => {
    vi.mocked(useAuthStore).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      role: null,
      user: null,
    } as any)

    render(
      <MemoryRouter>
        <ContentSearch />
      </MemoryRouter>
    )

    expect(mockNavigate).toHaveBeenCalledWith('/')
  })

  it('redirects to home if user is not an admin/manager', () => {
    vi.mocked(useAuthStore).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      role: 'user',
      user: { username: 'testuser' },
    } as any)

    render(
      <MemoryRouter>
        <ContentSearch />
      </MemoryRouter>
    )

    expect(mockNavigate).toHaveBeenCalledWith('/')
  })

  it('renders correctly if user is admin', () => {
    vi.mocked(useAuthStore).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      role: 'admin',
      user: { username: 'adminuser' },
    } as any)

    render(
      <MemoryRouter>
        <ContentSearch />
      </MemoryRouter>
    )

    expect(screen.getByText('Content Search')).toBeInTheDocument()
    expect(screen.getByText('Soulseek')).toBeInTheDocument()
    expect(screen.getByText('WebTorrent')).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('renders correctly if user is root_admin', () => {
    vi.mocked(useAuthStore).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      role: 'root_admin',
      user: { username: 'rootadmin' },
    } as any)

    render(
      <MemoryRouter>
        <ContentSearch />
      </MemoryRouter>
    )

    expect(screen.getByText('Content Search')).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
