/**
 * @file useLiveTickets.jsx
 * @description Live tickets list — single fetch + Supabase realtime updates.
 *
 * Mirrors the useNotifications pattern: initial fetch, then INSERT/UPDATE/
 * DELETE events keep the array in sync without refetching, plus a 60s
 * polling fallback in case the realtime channel drops.
 *
 * Requires the tickets table in the realtime publication
 * (run tickets-realtime-setup.sql once).
 *
 * Used by DashboardHome and TicketListPage so stat counts and the list
 * reflect progress changes instantly without a page refresh.
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { DASHBOARD_POLL_INTERVAL_MS } from '../lib/constants'

export function useLiveTickets() {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  /** Fetch all tickets, newest first (same query the pages used before). */
  const fetchTickets = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      setTickets(data || [])
      setError(null)
    } catch (err) {
      console.error('useLiveTickets: fetch failed', err)
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    fetchTickets()

    const channel = supabase
      .channel('tickets-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tickets' },
        ({ new: row }) => {
          // Prepend — list is ordered newest-first
          setTickets(prev => (prev.some(t => t.id === row.id) ? prev : [row, ...prev]))
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tickets' },
        ({ new: row }) => {
          setTickets(prev => prev.map(t => (t.id === row.id ? { ...t, ...row } : t)))
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'tickets' },
        ({ old: row }) => {
          // DELETE payloads only carry the primary key by default
          setTickets(prev => prev.filter(t => t.id !== row.id))
        }
      )
      .subscribe()

    const interval = setInterval(fetchTickets, DASHBOARD_POLL_INTERVAL_MS)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [fetchTickets])

  return { tickets, loading, error, refetch: fetchTickets }
}
