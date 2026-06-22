import { createContext, useContext, useState, useEffect } from 'react'
import { getSession, updateSessionRole } from '../lib/session'

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
  const [role, setRoleState] = useState(null)

  // Role is stored inside the shared session record (lib/session.js) so it
  // persists alongside auth — localStorage when "Remember me" / PWA,
  // sessionStorage otherwise.
  useEffect(() => {
    const session = getSession()
    if (session?.role && VALID_ROLES.has(session.role)) {
      setRoleState(session.role)
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
    // here we only reset the in-memory role.
    setRoleState(null)
  }

  const isAdmin      = role === ROLES.ADMIN
  const isStaff      = role === ROLES.STAFF
  const isTechnician = role === ROLES.TECHNICIAN
  // Staff-level access — Admin is a superset of Staff for every queue action.
  const isManager    = isStaff || isAdmin

  /** Returns the list of next statuses this role can move `currentStatus` to */
  function getAllowedTransitions(currentStatus) {
    if (!role) return []
    // Admin inherits Staff's transition table.
    const key = isAdmin ? ROLES.STAFF : role
    return ROLE_TRANSITIONS[key]?.[currentStatus] || []
  }

  return (
    <RoleContext.Provider
      value={{ role, setRole, clearRole, getAllowedTransitions,
               isAdmin, isStaff, isTechnician, isManager }}
    >
      {children}
    </RoleContext.Provider>
  )
}

export function useRole() {
  return useContext(RoleContext)
}
