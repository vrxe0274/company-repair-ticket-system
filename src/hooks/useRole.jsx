import { createContext, useContext, useState, useEffect } from 'react'

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

const SESSION_KEY = 'vrxe_role'

const RoleContext = createContext(null)

export function RoleProvider({ children }) {
  const [role, setRoleState] = useState(null)

  useEffect(() => {
    const stored = sessionStorage.getItem(SESSION_KEY)
    if (stored === ROLES.ADMIN || stored === ROLES.TECHNICIAN) {
      setRoleState(stored)
    }
  }, [])

  function setRole(r) {
    if (r === ROLES.ADMIN || r === ROLES.TECHNICIAN) {
      sessionStorage.setItem(SESSION_KEY, r)
      setRoleState(r)
    }
  }

  function clearRole() {
    sessionStorage.removeItem(SESSION_KEY)
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
