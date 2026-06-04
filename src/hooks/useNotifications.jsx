import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useRole } from './useRole.jsx'

const NotificationsContext = createContext(null)

export function NotificationsProvider({ children }) {
  const { role } = useRole()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(false)

  // ── Fetch current role's notifications ─────────────────────────────────────
  const fetchNotifications = useCallback(async () => {
    if (!role) { setNotifications([]); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_role', role)
      .order('created_at', { ascending: false })
      .limit(100)
    if (!error) setNotifications(data || [])
    setLoading(false)
  }, [role])

  // ── Initial load + live subscription ───────────────────────────────────────
  useEffect(() => {
    if (!role) {
      setNotifications([])
      return
    }

    fetchNotifications()

    const channel = supabase
      .channel(`notifications-${role}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_role=eq.${role}` },
        (payload) => {
          setNotifications(prev =>
            prev.some(n => n.id === payload.new.id) ? prev : [payload.new, ...prev]
          )
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `recipient_role=eq.${role}` },
        (payload) => {
          setNotifications(prev => prev.map(n => (n.id === payload.new.id ? payload.new : n)))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [role, fetchNotifications])

  // ── Derived ────────────────────────────────────────────────────────────────
  const unseenCount = notifications.filter(n => !n.seen).length

  // ── Mark actions (optimistic, then persist) ─────────────────────────────────
  const markAllSeen = useCallback(async () => {
    if (!role) return
    setNotifications(prev => prev.map(n => (n.seen ? n : { ...n, seen: true })))
    await supabase
      .from('notifications')
      .update({ seen: true })
      .eq('recipient_role', role)
      .eq('seen', false)
  }, [role])

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
