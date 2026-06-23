import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNavigate     = vi.fn()
const mockLoginWith    = vi.fn()
const mockLoginAsStaff = vi.fn()
const mockSetRole      = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../../hooks/useAuth.jsx', () => ({
  useAuth: () => ({ loginWithRole: mockLoginWith, loginAsStaff: mockLoginAsStaff, authenticated: false }),
}))

vi.mock('../../hooks/useRole.jsx', () => ({
  useRole: () => ({ setRole: mockSetRole }),
  ROLES: { ADMIN: 'Admin', STAFF: 'Staff', TECHNICIAN: 'Technician' },
}))

vi.mock('../../lib/session', () => ({
  isStandalone: () => false,
}))

vi.mock('../../components/ui/Logo.jsx', () => ({ default: () => <span>Logo</span> }))

import LoginPage from '../../pages/LoginPage'

function renderLogin() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LoginPage — step 1 (role selection)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders all three role buttons on step 1', () => {
    renderLogin()
    expect(screen.getByText('Admin')).toBeInTheDocument()
    expect(screen.getByText('Staff')).toBeInTheDocument()
    expect(screen.getByText('Technician')).toBeInTheDocument()
  })

  it('advances to step 2 when a role is clicked', () => {
    renderLogin()
    fireEvent.click(screen.getByText('Admin'))
    expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument()
  })
})

describe('LoginPage — step 2 (password)', () => {
  beforeEach(() => vi.clearAllMocks())

  function goToStep2(role = 'Admin') {
    const result = renderLogin()
    fireEvent.click(screen.getByText(role))
    return result
  }

  it('disables the submit button when password is empty', () => {
    goToStep2()
    expect(screen.getByRole('button', { name: /sign in as/i })).toBeDisabled()
  })

  it('shows error when form is submitted without a password', async () => {
    const { container } = goToStep2()
    fireEvent.submit(container.querySelector('form'))
    expect(await screen.findByText('Please enter your password.')).toBeInTheDocument()
  })

  it('calls loginWithRole with the selected role and password', async () => {
    mockLoginWith.mockResolvedValue(true)
    goToStep2('Admin')
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in as/i }))
    await waitFor(() => {
      expect(mockLoginWith).toHaveBeenCalledWith('secret', 'Admin', expect.any(Object))
    })
  })

  it('calls loginAsStaff with username and password for Staff role', async () => {
    mockLoginAsStaff.mockResolvedValue(true)
    goToStep2('Staff')
    fireEvent.change(screen.getByPlaceholderText('Enter your username'), { target: { value: 'jdelacruz' } })
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in as/i }))
    await waitFor(() => {
      expect(mockLoginAsStaff).toHaveBeenCalledWith('jdelacruz', 'secret', expect.any(Object))
    })
  })

  it('sets the selected role and navigates to / on successful login', async () => {
    mockLoginWith.mockResolvedValue(true)
    goToStep2('Admin')
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in as/i }))
    await waitFor(() => {
      expect(mockSetRole).toHaveBeenCalledWith('Admin')
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
    })
  })

  it('shows incorrect password error on failed login', async () => {
    mockLoginWith.mockResolvedValue(false)
    goToStep2('Admin')
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in as/i }))
    expect(await screen.findByText('Incorrect password for Admin.')).toBeInTheDocument()
  })

  it('shows connection error when loginWithRole throws', async () => {
    mockLoginWith.mockRejectedValue(new Error('Network error'))
    goToStep2('Admin')
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in as/i }))
    expect(await screen.findByText('Network error')).toBeInTheDocument()
  })

  it('goes back to step 1 on "Change role"', () => {
    goToStep2('Admin')
    fireEvent.click(screen.getByText('Change role'))
    expect(screen.getByText('Select your role to continue')).toBeInTheDocument()
  })
})
