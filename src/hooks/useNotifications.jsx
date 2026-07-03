import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useRole } from './useRole.jsx'

const NotificationsContext = createContext(null)

// ─────────────────────────────────────────────────────────────────────────────
// Per-account "cleared up to" watermark
//
// Notifications are role-broadcast: a single row keyed by recipient_role is
// shared by every account in that role (all Staff share one inbox, all Techs
// share another). So an individual clearing THEIR inbox must not delete the
// shared row — that would wipe it for every teammate. Instead we remember a
// per-account timestamp and hide everything created at or before it. New
// notifications (created after the watermark) still come through.
//
// Stored in localStorage keyed by the account: the username for individual
// Staff/Technician accounts, or the role for the shared-password Admin login.
// The role-wide hard delete (clearAll) remains, exposed to Admin via Settings.
// ─────────────────────────────────────────────────────────────────────────────
const CLEARED_PREFIX = 'vrxe_notif_cleared:'

function accountKey(role, username) {
  if (!role) return null
  // Namespace by role AND account so a username that exists under two roles
  // (e.g. a Staff and a Technician sharing one username) doesn't collide on a
  // single watermark. Admin has no username → keyed by role alone.
  return `${CLEARED_PREFIX}${role}:${username || role}`
}

function readClearedAt(role, username) {
  const key = accountKey(role, username)
  if (!key) return null
  return localStorage.getItem(key) // ISO string or null
}

export function NotificationsProvider({ children }) {
  const { role, isAdmin, staffUsername } = useRole()
  const [allNotifications, setAllNotifications] = useState([])
  const [loading, setLoading] = useState(false)
  const [clearedAt, setClearedAt] = useState(null)

  // Compute the roles to watch. Recalculates whenever role or isAdmin changes.
  // Admin sees both Staff and Technician notifications.
  const targetRoles = !role ? [] : isAdmin ? ['Staff', 'Technician'] : [role]

  // Hydrate the per-account watermark whenever the active account changes.
  useEffect(() => {
    setClearedAt(readClearedAt(role, staffUsername))
  }, [role, staffUsername])

  const fetchNotifications = useCallback(async () => {
    if (!role) { setAllNotifications([]); return }
    const roles = isAdmin ? ['Staff', 'Technician'] : [role]
    setLoading(true)
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .in('recipient_role', roles)
      .order('created_at', { ascending: false })
      .limit(100)
    if (!error) setAllNotifications(data || [])
    setLoading(false)
  }, [role, isAdmin])

  useEffect(() => {
    if (!role) { setAllNotifications([]); return }

    fetchNotifications()

    const roles = isAdmin ? ['Staff', 'Technician'] : [role]

    const channels = roles.map(r =>
      supabase
        .channel(`notifications-${r}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_role=eq.${r}` },
          (payload) => {
            setAllNotifications(prev =>
              prev.some(n => n.id === payload.new.id) ? prev : [payload.new, ...prev]
            )
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `recipient_role=eq.${r}` },
          (payload) => {
            setAllNotifications(prev => prev.map(n => n.id === payload.new.id ? payload.new : n))
          }
        )
        .subscribe()
    )

    const interval = setInterval(fetchNotifications, 60000)

    return () => {
      channels.forEach(ch => supabase.removeChannel(ch))
      clearInterval(interval)
    }
  }, [role, isAdmin, fetchNotifications])

  // Visible inbox: everything created after this account's clear watermark.
  const notifications = useMemo(() => {
    if (!clearedAt) return allNotifications
    const cutoff = new Date(clearedAt).getTime()
    return allNotifications.filter(n => new Date(n.created_at).getTime() > cutoff)
  }, [allNotifications, clearedAt])

  const unseenCount = notifications.filter(n => !n.seen).length

  const markAllSeen = useCallback(async () => {
    if (!role) return
    const roles = isAdmin ? ['Staff', 'Technician'] : [role]
    setAllNotifications(prev => prev.map(n => (n.seen ? n : { ...n, seen: true })))
    await Promise.all(
      roles.map(r =>
        supabase
          .from('notifications')
          .update({ seen: true })
          .eq('recipient_role', r)
          .eq('seen', false)
      )
    )
  }, [role, isAdmin])

  const markSeen = useCallback(async (id) => {
    setAllNotifications(prev => prev.map(n => (n.id === id ? { ...n, seen: true } : n)))
    await supabase.from('notifications').update({ seen: true }).eq('id', id)
  }, [])

  // Per-account clear: hides the current inbox for THIS account only by moving
  // the watermark to now. Shared rows are left intact for teammates.
  const clearForMe = useCallback(() => {
    const key = accountKey(role, staffUsername)
    if (!key) return
    // Watermark = newest loaded notification's SERVER timestamp, not the client
    // clock. Deriving it from created_at hides exactly what's in the inbox now
    // and can't swallow genuinely new rows when the device clock runs fast/slow.
    const newestTs = allNotifications.reduce((max, n) => {
      const t = new Date(n.created_at).getTime()
      return t > max ? t : max
    }, 0)
    const ts = newestTs > 0 ? new Date(newestTs).toISOString() : new Date().toISOString()
    localStorage.setItem(key, ts)
    setClearedAt(ts)
  }, [role, staffUsername, allNotifications])

  // Role-wide hard delete: permanently removes every notification for the
  // watched roles, for ALL accounts. Admin-only — exposed via Settings.
  const clearAll = useCallback(async () => {
    if (!role) return { ok: false }
    const roles = isAdmin ? ['Staff', 'Technician'] : [role]
    setAllNotifications([])

    // Confirm each role independently. A delete blocked by row-level security
    // returns no error AND removes nothing, and so does deleting an
    // already-empty role — indistinguishable from the delete alone. When a
    // delete reports zero rows we do a follow-up count: rows still present means
    // it was silently refused (failure); zero present means it's genuinely
    // clear (success). Per-role so one blocked role can't hide behind another's
    // successful delete.
    const outcomes = await Promise.all(
      roles.map(async (r) => {
        const { data, error } = await supabase
          .from('notifications').delete().eq('recipient_role', r).select('id')
        if (error) return false
        if (data && data.length > 0) return true
        const { count, error: countError } = await supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('recipient_role', r)
        if (countError) return false
        return count === 0
      })
    )

    const ok = outcomes.every(Boolean)
    // Roll back the optimistic clear if any role failed to fully clear.
    if (!ok) await fetchNotifications()
    return { ok }
  }, [role, isAdmin, fetchNotifications])

  return (
    <NotificationsContext.Provider
      value={{ notifications, unseenCount, loading, fetchNotifications, markAllSeen, markSeen, clearForMe, clearAll }}
    >
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext)
  if (!ctx) {
    return {
      notifications: [],
      unseenCount: 0,
      loading: false,
      fetchNotifications: async () => {},
      markAllSeen: async () => {},
      markSeen: async () => {},
      clearForMe: () => {},
      clearAll: async () => ({ ok: false }),
    }
  }
  return ctx
}
