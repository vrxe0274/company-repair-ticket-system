import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useRole } from './useRole.jsx'

const NotificationsContext = createContext(null)

export function NotificationsProvider({ children }) {
  const { role, isAdmin } = useRole()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(false)

  // Compute the roles to watch. Recalculates whenever role or isAdmin changes.
  // Admin sees both Staff and Technician notifications.
  const targetRoles = !role ? [] : isAdmin ? ['Staff', 'Technician'] : [role]

  const fetchNotifications = useCallback(async () => {
    if (!role) { setNotifications([]); return }
    const roles = isAdmin ? ['Staff', 'Technician'] : [role]
    setLoading(true)
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .in('recipient_role', roles)
      .order('created_at', { ascending: false })
      .limit(100)
    if (!error) setNotifications(data || [])
    setLoading(false)
  }, [role, isAdmin])

  useEffect(() => {
    if (!role) { setNotifications([]); return }

    fetchNotifications()

    const roles = isAdmin ? ['Staff', 'Technician'] : [role]

    const channels = roles.map(r =>
      supabase
        .channel(`notifications-${r}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_role=eq.${r}` },
          (payload) => {
            setNotifications(prev =>
              prev.some(n => n.id === payload.new.id) ? prev : [payload.new, ...prev]
            )
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `recipient_role=eq.${r}` },
          (payload) => {
            setNotifications(prev => prev.map(n => n.id === payload.new.id ? payload.new : n))
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

  const unseenCount = notifications.filter(n => !n.seen).length

  const markAllSeen = useCallback(async () => {
    if (!role) return
    const roles = isAdmin ? ['Staff', 'Technician'] : [role]
    setNotifications(prev => prev.map(n => (n.seen ? n : { ...n, seen: true })))
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
