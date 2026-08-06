import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SubsonicPasswordCard } from './SubsonicPasswordCard'

const api = vi.hoisted(() => ({
  getSubsonicPasswordStatus: vi.fn(),
  createSubsonicPassword: vi.fn(),
  revokeSubsonicPassword: vi.fn(),
}))
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('../../utils/notify', () => ({
  notify: { success: vi.fn(), error: vi.fn() },
}))

const confirmMock = vi.hoisted(() => vi.fn())
vi.mock('@/utils/confirm', () => ({ confirm: confirmMock }))

describe('SubsonicPasswordCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    confirmMock.mockResolvedValue(true)
    Object.assign(navigator, { clipboard: { writeText: vi.fn() } })
  })

  it('shows the generated password once and offers no way to re-read it', async () => {
    api.getSubsonicPasswordStatus.mockResolvedValue({ configured: false })
    api.createSubsonicPassword.mockResolvedValue({ appPassword: 's3cr3t-app-pw' })

    render(<SubsonicPasswordCard />)
    fireEvent.click(await screen.findByRole('button', { name: /Generate Password/i }))

    expect(await screen.findByDisplayValue('s3cr3t-app-pw')).toBeInTheDocument()

    // Dismissing drops it from memory — only a fresh one can be issued.
    fireEvent.click(screen.getByRole('button', { name: /Done/i }))
    await waitFor(() =>
      expect(screen.queryByDisplayValue('s3cr3t-app-pw')).not.toBeInTheDocument(),
    )
    expect(
      screen.getByRole('button', { name: /Generate New Password/i }),
    ).toBeInTheDocument()
  })

  it('confirms before replacing an existing password', async () => {
    api.getSubsonicPasswordStatus.mockResolvedValue({ configured: true })
    confirmMock.mockResolvedValue(false)

    render(<SubsonicPasswordCard />)
    fireEvent.click(
      await screen.findByRole('button', { name: /Generate New Password/i }),
    )

    await waitFor(() => expect(confirmMock).toHaveBeenCalled())
    expect(api.createSubsonicPassword).not.toHaveBeenCalled()
  })

  it('revokes only after confirmation, and hides the button when nothing is set', async () => {
    api.getSubsonicPasswordStatus.mockResolvedValue({ configured: true })
    api.revokeSubsonicPassword.mockResolvedValue({ success: true })

    render(<SubsonicPasswordCard />)
    fireEvent.click(await screen.findByRole('button', { name: /Remove/i }))

    await waitFor(() => expect(confirmMock).toHaveBeenCalled())
    await waitFor(() => expect(api.revokeSubsonicPassword).toHaveBeenCalled())
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Remove/i })).not.toBeInTheDocument(),
    )
  })
})
