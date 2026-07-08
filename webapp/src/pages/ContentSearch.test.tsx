import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ContentSearch from './ContentSearch'
import { useConfigStore } from '../stores/useConfigStore'
import { MemoryRouter } from 'react-router-dom'
import '../core/plugins' // register the built-in frontend plugins

// Auth/role gating moved out of the component: /search/content is wrapped in
// ManagerOrRootGuard at the route level (see App.tsx). The component itself
// only renders the search tabs contributed by the plugin registry, filtered
// by the backend status reported through useConfigStore.
vi.mock('../stores/useConfigStore')

const mockStatus = (status: any) => {
  vi.mocked(useConfigStore).mockImplementation((selector: any) =>
    selector({ status })
  )
}

describe('ContentSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the tabs of online plugins', () => {
    mockStatus({
      soulseek: { connected: true, username: 'tester' },
      torrent: { connected: false },
      youtube: { online: false },
    })

    render(
      <MemoryRouter>
        <ContentSearch />
      </MemoryRouter>
    )

    expect(screen.getByText('Content Search')).toBeInTheDocument()
    expect(screen.getByText('Soulseek')).toBeInTheDocument()
    expect(screen.getByText('Transfers')).toBeInTheDocument()
  })

  it('hides tabs of offline plugins', () => {
    mockStatus({
      soulseek: { connected: false },
      torrent: { connected: false },
      youtube: { online: false },
    })

    render(
      <MemoryRouter>
        <ContentSearch />
      </MemoryRouter>
    )

    expect(screen.queryByText('Soulseek')).not.toBeInTheDocument()
  })

  it('shows the empty state when no plugin is enabled', () => {
    mockStatus({
      soulseek: { connected: false },
      torrent: { connected: false },
      youtube: { online: false },
    })

    render(
      <MemoryRouter>
        <ContentSearch />
      </MemoryRouter>
    )

    expect(
      screen.getByText(/No content search plugins are currently enabled/i)
    ).toBeInTheDocument()
  })
})
