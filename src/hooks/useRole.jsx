import { createContext, useContext, useState, useEffect } from 'react'
import { getSession, updateSessionRole, updateSessionName } from '../lib/session'

// ─────────────────────────────────────────────────────────────────────────────
// Role definitions
//
// Three tiers:
//   Admin      — exactly one in the system. Everything Staff can do, PLUS
//                account management and Terms & Conditions editing.
//   Staff      — the ticket-queue managers (formerly the "Admin" role).
//   Technician — repairs, notes, photos.
//
// `isManager` is the staff-level access predicate (Staff OR Admin) used by every
// queue/pricing permission check, so Admin transparently inherits all Staff
// powers. Admin-exclusive features check `isAdmin`.
// ─────────────────────────────────────────────────────────────────────────────
export const ROLES = {
  ADMIN:      'Admin',
  STAFF:      'Staff',
  TECHNICIAN: 'Technician',
}

/** Set of valid role strings — used to validate session/role inputs. */
export const VALID_ROLES = new Set(Object.values(ROLES))

/**
 * Which status transitions each role is allowed to trigger.
 * Admin inherits Staff's transitions (see getAllowedTransitions).
 */
export const ROLE_TRANSITIONS = {
  [ROLES.STAFF]: {
    'Pending':             ['Inspection & Quote', 'Denied'],
    'Inspection & Quote':  ['Repair in Progress'],
    'Done':                ['Paid'],
  },
  [ROLES.TECHNICIAN]: {
    'Inspection & Quote':  ['Repair in Progress'],
    'Repair in Progress':  ['Done'],
  },
}

const RoleContext = createContext(null)

export function RoleProvider({ children }) {
  const [role,          setRoleState]     = useState(null)
  const [staffUsername, setStaffUsername] = useState(null)
  const [staffName,     setStaffNameState] = useState(null)

  // Role is stored inside the shared session record (lib/session.js) so it
  // persists alongside auth — localStorage when "Remember me" / PWA,
  // sessionStorage otherwise.
  useEffect(() => {
    const session = getSession()
    if (session?.role && VALID_ROLES.has(session.role)) {
      setRoleState(session.role)
      if (session.username) setStaffUsername(session.username)
      if (session.name)     setStaffNameState(session.name)
    }
  }, [])

  function setRole(r) {
    if (VALID_ROLES.has(r)) {
      updateSessionRole(r)
      setRoleState(r)
    }
  }

  function clearRole() {
    // The session record itself is cleared by useAuth.logout();
    // here we only reset the in-memory role, username, and name.
    setRoleState(null)
    setStaffUsername(null)
    setStaffNameState(null)
  }

  /** Persist the staff member's chosen display name to session + DB. */
  function setStaffName(name) {
    updateSessionName(name)
    setStaffNameState(name)
  }

  const isAdmin      = role === ROLES.ADMIN
  const isStaff      = role === ROLES.STAFF
  const isTechnician = role === ROLES.TECHNICIAN
  // Staff-level access — Admin is a superset of Staff for every queue action.
  const isManager    = isStaff || isAdmin

  /**
   * Returns the list of next statuses this role can move the ticket to.
   * Accepts either a status string (for UI buttons) or a full ticket object
   * (for task-list filtering). When a ticket object is passed, additional
   * "already done their part" checks suppress the task:
   *   - Technician at Inspection & Quote: hidden once diagnosis_notes is saved
   *   - Staff/Admin at Inspection & Quote: hidden once quotation_amount is saved
   */
  function getAllowedTransitions(ticketOrStatus) {
    if (!role) return []
    const status = typeof ticketOrStatus === 'string' ? ticketOrStatus : ticketOrStatus?.status
    const ticket = typeof ticketOrStatus === 'object' ? ticketOrStatus : null
    const key = isAdmin ? ROLES.STAFF : role
    const transitions = ROLE_TRANSITIONS[key]?.[status] || []
    if (!transitions.length || !ticket) return transitions
    if (isTechnician && status === 'Inspection & Quote' && ticket.diagnosis_notes?.trim()) return []
    if (isManager   && status === 'Inspection & Quote' && ticket.quotation_amount != null) return []
    return transitions
  }

  return (
    <RoleContext.Provider
      value={{ role, setRole, clearRole, getAllowedTransitions,
               isAdmin, isStaff, isTechnician, isManager,
               staffUsername, staffName, setStaffName }}
    >
      {children}
    </RoleContext.Provider>
  )
}

export function useRole() {
  return useContext(RoleContext)
}
