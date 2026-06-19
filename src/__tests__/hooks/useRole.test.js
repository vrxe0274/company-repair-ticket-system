import { describe, it, expect } from 'vitest'
import { ROLES, ROLE_TRANSITIONS } from '../../hooks/useRole'

// Tests cover the pure data structures only — no React rendering.
// The hook's context/state logic is covered by E2E tests.

// ─── ROLES ───────────────────────────────────────────────────────────────────

describe('ROLES', () => {
  it('defines Admin', () => {
    expect(ROLES.ADMIN).toBe('Admin')
  })

  it('defines Technician', () => {
    expect(ROLES.TECHNICIAN).toBe('Technician')
  })
})

// ─── ROLE_TRANSITIONS — Admin ─────────────────────────────────────────────────

describe('ROLE_TRANSITIONS — Admin', () => {
  const admin = ROLE_TRANSITIONS[ROLES.ADMIN]

  it('can approve Pending → Inspection & Quote', () => {
    expect(admin['Pending']).toContain('Inspection & Quote')
  })

  it('can deny Pending → Denied', () => {
    expect(admin['Pending']).toContain('Denied')
  })

  it('can advance Inspection & Quote → Repair in Progress', () => {
    expect(admin['Inspection & Quote']).toContain('Repair in Progress')
  })

  it('can mark Done → Paid', () => {
    expect(admin['Done']).toContain('Paid')
  })

  it('has no transitions defined from Repair in Progress (not an Admin action)', () => {
    expect(admin['Repair in Progress']).toBeUndefined()
  })

  it('has no transitions defined from Paid (terminal state)', () => {
    expect(admin['Paid']).toBeUndefined()
  })

  it('has no transitions defined from Denied (terminal state)', () => {
    expect(admin['Denied']).toBeUndefined()
  })
})

// ─── ROLE_TRANSITIONS — Technician ───────────────────────────────────────────

describe('ROLE_TRANSITIONS — Technician', () => {
  const tech = ROLE_TRANSITIONS[ROLES.TECHNICIAN]

  it('can start repair: Inspection & Quote → Repair in Progress', () => {
    expect(tech['Inspection & Quote']).toContain('Repair in Progress')
  })

  it('can complete repair: Repair in Progress → Done', () => {
    expect(tech['Repair in Progress']).toContain('Done')
  })

  it('cannot act on Pending tickets', () => {
    expect(tech['Pending']).toBeUndefined()
  })

  it('cannot mark Paid — Admin-only action', () => {
    const allTechTargets = Object.values(tech).flat()
    expect(allTechTargets).not.toContain('Paid')
  })

  it('cannot deny tickets — Admin-only action', () => {
    const allTechTargets = Object.values(tech).flat()
    expect(allTechTargets).not.toContain('Denied')
  })

  it('has no transition from Done (waiting for Admin to collect payment)', () => {
    expect(tech['Done']).toBeUndefined()
  })
})

// ─── ROLE_TRANSITIONS — cross-role integrity ─────────────────────────────────

describe('ROLE_TRANSITIONS — cross-role integrity', () => {
  it('Admin cannot skip directly to Repair in Progress from Pending', () => {
    const fromPending = ROLE_TRANSITIONS[ROLES.ADMIN]['Pending'] ?? []
    expect(fromPending).not.toContain('Repair in Progress')
  })

  it('Technician cannot skip to Paid from any status', () => {
    const allTechTargets = Object.values(ROLE_TRANSITIONS[ROLES.TECHNICIAN]).flat()
    expect(allTechTargets).not.toContain('Paid')
  })

  it('no role defines a backwards transition (workflow only moves forward)', () => {
    const statusOrder = ['Pending', 'Inspection & Quote', 'Repair in Progress', 'Done', 'Paid']

    for (const transitions of Object.values(ROLE_TRANSITIONS)) {
      for (const [fromStatus, toStatuses] of Object.entries(transitions)) {
        const fromIdx = statusOrder.indexOf(fromStatus)
        if (fromIdx === -1) continue // Denied and similar — not in the linear order

        for (const toStatus of toStatuses) {
          const toIdx = statusOrder.indexOf(toStatus)
          if (toIdx !== -1) {
            expect(toIdx, `${fromStatus} → ${toStatus} is a backwards step`).toBeGreaterThan(fromIdx)
          }
        }
      }
    }
  })

  it('every defined transition target is a known status string', () => {
    const knownStatuses = new Set([
      'Pending', 'Inspection & Quote', 'Repair in Progress', 'Done', 'Paid', 'Denied',
    ])

    for (const transitions of Object.values(ROLE_TRANSITIONS)) {
      for (const toStatuses of Object.values(transitions)) {
        for (const s of toStatuses) {
          expect(knownStatuses.has(s), `Unknown status in transitions: "${s}"`).toBe(true)
        }
      }
    }
  })
})
