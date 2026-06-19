import { describe, it, expect, vi } from 'vitest'

// notifications.js loads the supabase client at module level.
// Mock it so the module resolves without real network credentials.
vi.mock('../../lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

import { buildStatusNotification, NOTIFY_ROLES } from '../../lib/notifications'

// ─── NOTIFY_ROLES ─────────────────────────────────────────────────────────────

describe('NOTIFY_ROLES', () => {
  it('defines Admin constant', () => {
    expect(NOTIFY_ROLES.ADMIN).toBe('Admin')
  })

  it('defines Technician constant', () => {
    expect(NOTIFY_ROLES.TECHNICIAN).toBe('Technician')
  })
})

// ─── buildStatusNotification ─────────────────────────────────────────────────

describe('buildStatusNotification', () => {
  const label = "Juan Dela Cruz's Meta Quest 3"

  it('Inspection & Quote: notifies Technician regardless of actor', () => {
    const result = buildStatusNotification({
      actorRole: 'Admin',
      newStatus: 'Inspection & Quote',
      ticketLabel: label,
    })
    expect(result.recipientRole).toBe('Technician')
    expect(result.message).toBe(`Approved: ${label}`)
  })

  it('Denied: notifies Technician', () => {
    const result = buildStatusNotification({
      actorRole: 'Admin',
      newStatus: 'Denied',
      ticketLabel: label,
    })
    expect(result.recipientRole).toBe('Technician')
    expect(result.message).toBe(`Denied: ${label}`)
  })

  it('Repair in Progress (Technician actor): notifies Admin (the other role)', () => {
    const result = buildStatusNotification({
      actorRole: 'Technician',
      newStatus: 'Repair in Progress',
      ticketLabel: label,
    })
    expect(result.recipientRole).toBe('Admin')
    expect(result.message).toBe(`Repair started: ${label}`)
  })

  it('Repair in Progress (Admin actor): notifies Technician (the other role)', () => {
    const result = buildStatusNotification({
      actorRole: 'Admin',
      newStatus: 'Repair in Progress',
      ticketLabel: label,
    })
    expect(result.recipientRole).toBe('Technician')
    expect(result.message).toBe(`Repair started: ${label}`)
  })

  it('Done: always notifies Admin (ready for pickup)', () => {
    const result = buildStatusNotification({
      actorRole: 'Technician',
      newStatus: 'Done',
      ticketLabel: label,
    })
    expect(result.recipientRole).toBe('Admin')
    expect(result.message).toBe(`Ready for pickup: ${label}`)
  })

  it('Paid: notifies Technician', () => {
    const result = buildStatusNotification({
      actorRole: 'Admin',
      newStatus: 'Paid',
      ticketLabel: label,
    })
    expect(result.recipientRole).toBe('Technician')
    expect(result.message).toBe(`Paid: ${label}`)
  })

  it('uses "Unnamed Ticket" when ticketLabel is empty string', () => {
    const result = buildStatusNotification({
      actorRole: 'Admin',
      newStatus: 'Paid',
      ticketLabel: '',
    })
    expect(result.message).toBe('Paid: Unnamed Ticket')
  })

  it('uses "Unnamed Ticket" when ticketLabel is null', () => {
    const result = buildStatusNotification({
      actorRole: 'Admin',
      newStatus: 'Paid',
      ticketLabel: null,
    })
    expect(result.message).toBe('Paid: Unnamed Ticket')
  })

  it('unknown status falls through to generic message with other-role recipient', () => {
    const result = buildStatusNotification({
      actorRole: 'Admin',
      newStatus: 'Some Future Status',
      ticketLabel: label,
    })
    expect(result.message).toBe(`Some Future Status: ${label}`)
    expect(result.recipientRole).toBe('Technician')
  })

  it('never sends notification to the actor themselves for Inspection & Quote', () => {
    const result = buildStatusNotification({
      actorRole: 'Admin',
      newStatus: 'Inspection & Quote',
      ticketLabel: label,
    })
    expect(result.recipientRole).not.toBe('Admin')
  })
})
