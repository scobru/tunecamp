import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { ThemeSwitcher } from './ThemeSwitcher'
import { useUIStore } from '../../stores/useUIStore'

describe('ThemeSwitcher', () => {
  beforeEach(() => {
    // Reset theme to default before each test
    useUIStore.getState().setTheme('tunecamp')
  })

  it('renders all theme options', () => {
    render(<ThemeSwitcher />)
    expect(screen.getByTitle('Dark')).toBeInTheDocument()
    expect(screen.getByTitle('Grey')).toBeInTheDocument()
    expect(screen.getByTitle('White')).toBeInTheDocument()
    expect(screen.getByTitle('Nordic')).toBeInTheDocument()
    expect(screen.getByTitle('Nordic Dark')).toBeInTheDocument()
  })

  it('changes theme when a button is clicked', () => {
    render(<ThemeSwitcher />)
    const greyButton = screen.getByTitle('Grey')
    
    fireEvent.click(greyButton)
    
    expect(useUIStore.getState().theme).toBe('grey')
    expect(document.documentElement.getAttribute('data-theme')).toBe('grey')
  })
})
