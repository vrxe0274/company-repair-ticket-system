import { describe, it, expect, vi } from 'vitest'

// notifications.js loads the supabase client at module level.
// Mock it so the module resolves without real network credentials.
vi.mock('../../lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

import { buildStatusNotification, NOTIFY_ROLES } from '../../lib/notifications'

// ─── NOTIFY_ROLES ─────────────────────────────────────────────────────────────

describe('NOTIFY_ROLES', () => {
  it('defines Staff constant', () => {
    expect(NOTIFY_ROLES.STAFF).toBe('Staff')
  })

  it('defines Technician constant', () => {
    expect(NOTIFY_ROLES.TECHNICIAN).toBe('Technician')
  })
})

// ─── buildStatusNotification ─────────────────────────────────────────────────
//
// Routing rule: the queue side is "Staff". An Admin actor is normalized to
// Staff (Admin operates the Staff queue), so it routes identically to a Staff
// actor and the Admin reads the Staff notification stream.

describe('buildStatusNotification', () => {
  const label = "Juan Dela Cruz's Meta Quest 3"

  it('Inspection & Quote: notifies Technician regardless of actor', () => {
    const result = buildStatusNotification({
      actorRole: 'Staff',
      newStatus: 'Inspection & Quote',
      ticketLabel: label,
    })
    expect(result.recipientRole).toBe('Technician')
    expect(result.message).toBe(`Inspection & Quote: ${label}`)
  })

  it('Denied: no notification (matches server trigger — RETURN NEW)', () => {
    const result = buildStatusNotification({
      actorRole: 'Staff',
      newStatus: 'Denied',
      ticketLabel: label,
    })
    expect(result).toBeNull()
  })

  it('Repair in Progress (Technician actor): notifies Staff (the other side)', () => {
    const result = buildStatusNotification({
      actorRole: 'Technician',
      newStatus: 'Repair in Progress',
      ticketLabel: label,
    })
    expect(result.recipientRole).toBe('Staff')
    expect(result.message).toBe(`Repair in Progress: ${label}`)
  })

  it('Repair in Progress (Staff actor): notifies Technician (the other side)', () => {
    const result = buildStatusNotification({
      actorRole: 'Staff',
      newStatus: 'Repair in Progress',
      ticketLabel: label,
    })
    expect(result.recipientRole).toBe('Technician')
    expect(result.message).toBe(`Repair in Progress: ${label}`)
  })

  it('Repair in Progress (Admin actor): normalized to Staff → notifies Technician', () => {
    const result = buildStatusNotification({
      actorRole: 'Admin',
      newStatus: 'Repair in Progress',
      ticketLabel: label,
    })
    expect(result.recipientRole).toBe('Technician')
  })

  it('Done: always notifies Staff (ready for pickup)', () => {
    const result = buildStatusNotification({
      actorRole: 'Technician',
      newStatus: 'Done',
      ticketLabel: label,
    })
    expect(result.recipientRole).toBe('Staff')
    expect(result.message).toBe(`Done: ${label}`)
  })

  it('Paid: notifies Staff', () => {
    const result = buildStatusNotification({
      actorRole: 'Staff',
      newStatus: 'Paid',
      ticketLabel: label,
    })
    expect(result.recipientRole).toBe('Staff')
    expect(result.message).toBe(`Paid: ${label}`)
  })

  it('uses "Unnamed Ticket" when ticketLabel is empty string', () => {
    const result = buildStatusNotification({
      actorRole: 'Staff',
      newStatus: 'Paid',
      ticketLabel: '',
    })
    expect(result.message).toBe('Paid: Unnamed Ticket')
  })

  it('uses "Unnamed Ticket" when ticketLabel is null', () => {
    const result = buildStatusNotification({
      actorRole: 'Staff',
      newStatus: 'Paid',
      ticketLabel: null,
    })
    expect(result.message).toBe('Paid: Unnamed Ticket')
  })

  it('unknown status falls through to generic message with other-side recipient', () => {
    const result = buildStatusNotification({
      actorRole: 'Staff',
      newStatus: 'Some Future Status',
      ticketLabel: label,
    })
    expect(result.message).toBe(`Some Future Status: ${label}`)
    expect(result.recipientRole).toBe('Technician')
  })

  it('never sends notification to the actor themselves for Inspection & Quote', () => {
    const result = buildStatusNotification({
      actorRole: 'Staff',
      newStatus: 'Inspection & Quote',
      ticketLabel: label,
    })
    expect(result.recipientRole).not.toBe('Staff')
  })
})
