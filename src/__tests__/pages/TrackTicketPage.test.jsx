import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockSingle = vi.fn()

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ single: mockSingle }),
      }),
    }),
    channel: () => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    }),
    removeChannel: vi.fn(),
  },
}))

vi.mock('../../lib/receipt', () => ({ downloadReceiptPDF: vi.fn() }))
vi.mock('../../components/ui/StatusBadge.jsx', () => ({ default: ({ status }) => <span>{status}</span> }))
vi.mock('../../components/ui/Logo.jsx',        () => ({ default: () => <span>Logo</span> }))

import TrackTicketPage from '../../pages/TrackTicketPage'

const MOCK_TICKET = {
  id: 'uuid-1',
  ticket_id: 'VRX-0001',
  tracking_token: 'tok123',
  client_name: 'Ana Reyes',
  contact_number: '09171234567',
  email: 'ana@example.com',
  address: '1 Main St',
  platform: 'Walk-in',
  unit_brand: 'Apple',
  unit_model: 'iPhone 15',
  unit_type: 'Phone',
  issue_description: 'Screen cracked',
  status: 'Pending',
  created_at: '2025-01-01T00:00:00Z',
  labor_items: [],
  parts_items: [],
  quotation_amount: 800,
  discount_amount: null,
  final_price: null,
  diagnosis_notes: null,
  repair_notes: null,
  photos: [],
  mode_of_service: 'Walk-in',
}

function renderPage(token = 'tok123') {
  return render(
    <MemoryRouter initialEntries={[`/track/${token}`]}>
      <Routes>
        <Route path="/track/:token" element={<TrackTicketPage />} />
      </Routes>
    </MemoryRouter>
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TrackTicketPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows loading spinner while fetching', () => {
    mockSingle.mockReturnValue(new Promise(() => {})) // never resolves
    renderPage()
    expect(screen.getByText('Loading your ticket...')).toBeInTheDocument()
  })

  it('shows "Ticket Not Found" when fetch returns an error', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'not found' } })
    renderPage()
    await waitFor(() =>
      expect(screen.getByText('Ticket Not Found')).toBeInTheDocument()
    )
  })

  it('shows the catch-block message in the error paragraph', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'PGRST116' } })
    renderPage()
    await waitFor(() =>
      expect(
        screen.getByText('Ticket not found. Please check your tracking link.')
      ).toBeInTheDocument()
    )
  })

  it('renders ticket client initial in the avatar', async () => {
    mockSingle.mockResolvedValue({ data: MOCK_TICKET, error: null })
    renderPage()
    await waitFor(() =>
      // Avatar shows first letter of client_name
      expect(screen.getByText('A')).toBeInTheDocument()
    )
  })

  it('renders ticket ID', async () => {
    mockSingle.mockResolvedValue({ data: MOCK_TICKET, error: null })
    renderPage()
    await waitFor(() =>
      expect(screen.getByText('VRX-0001')).toBeInTheDocument()
    )
  })
})
