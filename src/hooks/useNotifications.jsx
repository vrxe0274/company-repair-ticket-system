import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useRole } from './useRole.jsx'

const NotificationsContext = createContext(null)

export function NotificationsProvider({ children }) {
  const { role } = useRole()
  // Admin shares the Staff queue's notifications (Admin is a superset of Staff).
  const notifyRole = role === 'Admin' ? 'Staff' : role
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(false)

  // ── Fetch this user's notification stream ──────────────────────────────────
  const fetchNotifications = useCallback(async () => {
    if (!notifyRole) { setNotifications([]); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_role', notifyRole)
      .order('created_at', { ascending: false })
      .limit(100)
    if (!error) setNotifications(data || [])
    setLoading(false)
  }, [notifyRole])

  // ── Initial load + live subscription ───────────────────────────────────────
  useEffect(() => {
    if (!notifyRole) {
      setNotifications([])
      return
    }

    fetchNotifications()

    const channel = supabase
      .channel(`notifications-${notifyRole}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_role=eq.${notifyRole}` },
        (payload) => {
          setNotifications(prev =>
            prev.some(n => n.id === payload.new.id) ? prev : [payload.new, ...prev]
          )
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `recipient_role=eq.${notifyRole}` },
        (payload) => {
          setNotifications(prev => prev.map(n => (n.id === payload.new.id ? payload.new : n)))
        }
      )
      .subscribe()

    // Polling fallback — refetch every 60s in case the realtime channel drops
    const interval = setInterval(fetchNotifications, 60000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [notifyRole, fetchNotifications])

  // ── Derived ────────────────────────────────────────────────────────────────
  const unseenCount = notifications.filter(n => !n.seen).length

  // ── Mark actions (optimistic, then persist) ─────────────────────────────────
  const markAllSeen = useCallback(async () => {
    if (!notifyRole) return
    setNotifications(prev => prev.map(n => (n.seen ? n : { ...n, seen: true })))
    await supabase
      .from('notifications')
      .update({ seen: true })
      .eq('recipient_role', notifyRole)
      .eq('seen', false)
  }, [notifyRole])

  const markSeen = useCallback(async (id) => {
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, seen: true } : n)))
    await supabase.from('notifications').update({ seen: true }).eq('id', id)
  }, [])

  return (
    <NotificationsContext.Provider
      value={{ notifications, unseenCount, loading, fetchNotifications, markAllSeen, markSeen }}
    >
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext)
  // Safe fallback if the provider isn't mounted (e.g. on a public page)
  if (!ctx) {
    return {
      notifications: [],
      unseenCount: 0,
      loading: false,
      fetchNotifications: async () => {},
      markAllSeen: async () => {},
      markSeen: async () => {},
    }
  }
  return ctx
}
