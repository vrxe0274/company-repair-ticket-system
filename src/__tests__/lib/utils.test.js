import { describe, it, expect } from 'vitest'
import {
  generateTrackingToken,
  getTrackingUrl,
  formatUnitLabel,
  formatTicketLabel,
  formatClientUnitLabel,
  STATUS_ORDER,
  STATUS_COLORS,
  STATUS_DENIED,
  TASK_ACTIONS,
} from '../../lib/utils'

// ─── generateTrackingToken ────────────────────────────────────────────────────

describe('generateTrackingToken', () => {
  it('returns a 32-character lowercase hex string', () => {
    expect(generateTrackingToken()).toMatch(/^[0-9a-f]{32}$/)
  })

  it('returns a unique value on every call', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateTrackingToken()))
    expect(tokens.size).toBe(100)
  })
})

// ─── getTrackingUrl ───────────────────────────────────────────────────────────

describe('getTrackingUrl', () => {
  it('appends /track/:token to the base URL', () => {
    const url = getTrackingUrl('abc123def456')
    expect(url).toMatch(/\/track\/abc123def456$/)
  })
})

// ─── formatUnitLabel ─────────────────────────────────────────────────────────

describe('formatUnitLabel', () => {
  it('returns "Unnamed Ticket" for null', () => {
    expect(formatUnitLabel(null)).toBe('Unnamed Ticket')
  })

  it('returns "Unnamed Ticket" for empty object', () => {
    expect(formatUnitLabel({})).toBe('Unnamed Ticket')
  })

  it('combines brand, model, and type', () => {
    expect(formatUnitLabel({ unit_brand: 'Meta', unit_model: 'Quest 3', unit_type: 'VR Headset' }))
      .toBe('Meta Quest 3 (VR Headset)')
  })

  it('returns brand + model without type when type is absent', () => {
    expect(formatUnitLabel({ unit_brand: 'Meta', unit_model: 'Quest 3' }))
      .toBe('Meta Quest 3')
  })

  it('returns type alone when brand and model are absent', () => {
    expect(formatUnitLabel({ unit_type: 'VR Controller' }))
      .toBe('VR Controller')
  })

  it('falls back to ticket_id when all unit fields are absent', () => {
    expect(formatUnitLabel({ ticket_id: 'VR-2606-001' }))
      .toBe('VR-2606-001')
  })

  it('trims whitespace from unit fields', () => {
    expect(formatUnitLabel({ unit_brand: '  Meta  ', unit_model: '  Quest 3  ' }))
      .toBe('Meta Quest 3')
  })
})

// ─── formatTicketLabel ───────────────────────────────────────────────────────

describe('formatTicketLabel', () => {
  it('returns "Unnamed Ticket" for null', () => {
    expect(formatTicketLabel(null)).toBe('Unnamed Ticket')
  })

  it('returns "Unnamed Ticket" for empty object', () => {
    expect(formatTicketLabel({})).toBe('Unnamed Ticket')
  })

  it('combines name and unit with em-dash separator', () => {
    const ticket = { client_name: 'Maria Santos', unit_brand: 'Meta', unit_model: 'Quest 3', unit_type: 'VR Headset' }
    expect(formatTicketLabel(ticket)).toBe('Maria Santos — Meta Quest 3 (VR Headset)')
  })

  it('returns name only when unit fields are absent', () => {
    expect(formatTicketLabel({ client_name: 'Maria Santos' })).toBe('Maria Santos')
  })

  it('returns unit label only when client_name is absent', () => {
    expect(formatTicketLabel({ unit_brand: 'Meta', unit_model: 'Quest 3' })).toBe('Meta Quest 3')
  })

  it('falls back to ticket_id when nothing else is present', () => {
    expect(formatTicketLabel({ ticket_id: 'VR-2606-001' })).toBe('VR-2606-001')
  })
})

// ─── formatClientUnitLabel ───────────────────────────────────────────────────

describe('formatClientUnitLabel', () => {
  it('returns "Unnamed Ticket" for null', () => {
    expect(formatClientUnitLabel(null)).toBe('Unnamed Ticket')
  })

  it('returns "Unnamed Ticket" for empty object', () => {
    expect(formatClientUnitLabel({})).toBe('Unnamed Ticket')
  })

  it('returns possessive "name\'s brand model" format', () => {
    const ticket = { client_name: 'Juan Dela Cruz', unit_brand: 'Meta', unit_model: 'Quest 3' }
    expect(formatClientUnitLabel(ticket)).toBe("Juan Dela Cruz's Meta Quest 3")
  })

  it('does not include unit_type (no parenthetical in possessive label)', () => {
    const ticket = { client_name: 'Juan', unit_brand: 'Meta', unit_model: 'Quest 3', unit_type: 'VR Headset' }
    expect(formatClientUnitLabel(ticket)).not.toContain('VR Headset')
  })

  it('returns name only when unit fields are absent', () => {
    expect(formatClientUnitLabel({ client_name: 'Juan Dela Cruz' })).toBe('Juan Dela Cruz')
  })

  it('returns "brand model" (no possessive) when client_name is absent', () => {
    expect(formatClientUnitLabel({ unit_brand: 'Meta', unit_model: 'Quest 3' })).toBe('Meta Quest 3')
  })

  it('falls back to ticket_id when nothing else is present', () => {
    expect(formatClientUnitLabel({ ticket_id: 'VR-2606-001' })).toBe('VR-2606-001')
  })
})

// ─── STATUS_ORDER ─────────────────────────────────────────────────────────────

describe('STATUS_ORDER', () => {
  it('lists all 5 workflow statuses in correct order', () => {
    expect(STATUS_ORDER).toEqual([
      'Pending',
      'Inspection & Quote',
      'Repair in Progress',
      'Done',
      'Paid',
    ])
  })

  it('does not include Denied (terminal side-branch, not a workflow step)', () => {
    expect(STATUS_ORDER).not.toContain('Denied')
  })
})

// ─── STATUS_COLORS ────────────────────────────────────────────────────────────

describe('STATUS_COLORS', () => {
  const ALL_STATUSES = ['Pending', 'Inspection & Quote', 'Repair in Progress', 'Done', 'Paid', 'Denied']

  it('has an entry for every status including Denied', () => {
    ALL_STATUSES.forEach(s => {
      expect(STATUS_COLORS, `missing entry for "${s}"`).toHaveProperty(s)
    })
  })

  it('every entry has bg, text, and dot Tailwind class strings', () => {
    ALL_STATUSES.forEach(s => {
      expect(STATUS_COLORS[s]).toMatchObject({
        bg:   expect.any(String),
        text: expect.any(String),
        dot:  expect.any(String),
      })
    })
  })
})

// ─── STATUS_DENIED ────────────────────────────────────────────────────────────

describe('STATUS_DENIED', () => {
  it('equals the string "Denied"', () => {
    expect(STATUS_DENIED).toBe('Denied')
  })
})

// ─── TASK_ACTIONS ─────────────────────────────────────────────────────────────

describe('TASK_ACTIONS', () => {
  it('Admin has actionable tasks for Pending, Inspection & Quote, and Done', () => {
    expect(TASK_ACTIONS.Admin).toHaveProperty('Pending')
    expect(TASK_ACTIONS.Admin).toHaveProperty('Inspection & Quote')
    expect(TASK_ACTIONS.Admin).toHaveProperty('Done')
  })

  it('Technician has actionable tasks for Inspection & Quote and Repair in Progress', () => {
    expect(TASK_ACTIONS.Technician).toHaveProperty('Inspection & Quote')
    expect(TASK_ACTIONS.Technician).toHaveProperty('Repair in Progress')
  })

  it('Admin has no task entry for Repair in Progress (waiting state for Admin)', () => {
    expect(TASK_ACTIONS.Admin).not.toHaveProperty('Repair in Progress')
  })

  it('Technician has no task entry for Pending (waiting state for Technician)', () => {
    expect(TASK_ACTIONS.Technician).not.toHaveProperty('Pending')
  })

  it('all task action values are non-empty strings', () => {
    for (const actions of Object.values(TASK_ACTIONS)) {
      for (const label of Object.values(actions)) {
        expect(typeof label).toBe('string')
        expect(label.length).toBeGreaterThan(0)
      }
    }
  })
})
