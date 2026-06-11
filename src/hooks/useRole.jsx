import { createContext, useContext, useState, useEffect } from 'react'
import { getSession, updateSessionRole } from '../lib/session'

// ─────────────────────────────────────────────────────────────────────────────
// Role definitions
// ─────────────────────────────────────────────────────────────────────────────
export const ROLES = {
  ADMIN:      'Admin',
  TECHNICIAN: 'Technician',
}

/**
 * Which status transitions each role is allowed to trigger.
 * Updated to match simplified status workflow.
 */
export const ROLE_TRANSITIONS = {
  [ROLES.ADMIN]: {
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
    if (session?.role === ROLES.ADMIN || session?.role === ROLES.TECHNICIAN) {
      setRoleState(session.role)
    }
  }, [])

  function setRole(r) {
    if (r === ROLES.ADMIN || r === ROLES.TECHNICIAN) {
      updateSessionRole(r)
      setRoleState(r)
    }
  }

  function clearRole() {
    // The session record itself is cleared by useAuth.logout();
    // here we only reset the in-memory role.
    setRoleState(null)
  }

  /** Returns the list of next statuses this role can move `currentStatus` to */
  function getAllowedTransitions(currentStatus) {
    if (!role) return []
    return ROLE_TRANSITIONS[role]?.[currentStatus] || []
  }

  const isAdmin      = role === ROLES.ADMIN
  const isTechnician = role === ROLES.TECHNICIAN

  return (
    <RoleContext.Provider value={{ role, setRole, clearRole, getAllowedTransitions, isAdmin, isTechnician }}>
      {children}
    </RoleContext.Provider>
  )
}

export function useRole() {
  return useContext(RoleContext)
}
