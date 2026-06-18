/**
 * @file SettingsPage.jsx
 * @description Staff settings: appearance (light/dark) for everyone, and an
 * admin-only danger zone holding the "Flush Database" action that used to live
 * in the All Tickets kebab menu.
 *
 * Flush no longer deletes via the anon client — the public DELETE policy was
 * removed. It calls the `admin-delete` Edge Function, which validates the
 * destructive password server-side (see lib/adminDelete.js).
 */

import { useState } from 'react'
import { Sun, Moon, Trash2, X, ShieldAlert, Lock } from 'lucide-react'
import { useRole } from '../../hooks/useRole.jsx'
import { useTheme } from '../../hooks/useTheme.jsx'
import { adminFlushDatabase } from '../../lib/adminDelete'

/** How long the "flushed" success toast stays up. */
const FLUSH_SUCCESS_MS = 4000

export default function SettingsPage() {
  const { isAdmin } = useRole()
  const { isDark, toggleTheme } = useTheme()

  // Flush DB state (admin only)
  const [showFlush, setShowFlush]   = useState(false)
  const [flushInput, setFlushInput] = useState('')
  const [flushError, setFlushError] = useState('')
  const [flushing, setFlushing]     = useState(false)
  const [flushDone, setFlushDone]   = useState(false)

  async function handleFlush() {
    if (!flushInput) { setFlushError('Enter the admin password.'); return }
    setFlushing(true)
    setFlushError('')
    try {
      await adminFlushDatabase(flushInput)
      setFlushDone(true)
      setShowFlush(false)
      setFlushInput('')
      setTimeout(() => setFlushDone(false), FLUSH_SUCCESS_MS)
    } catch (err) {
      setFlushError(err.message)
    } finally {
      setFlushing(false)
    }
  }

  function closeFlush() {
    setShowFlush(false)
    setFlushInput('')
    setFlushError('')
  }

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="-mx-5 -mt-5 lg:-mx-7 lg:-mt-7 bg-white border-b border-gray-200 mb-1">
        <div className="h-1 bg-gradient-to-r from-brand-500 to-accent-500" />
        <div className="px-5 lg:px-7 py-5">
          <p className="text-[11px] font-sans font-semibold tracking-[0.14em] text-brand-600 uppercase mb-2 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500 inline-block" />Preferences
          </p>
          <h1 className="font-display text-4xl sm:text-5xl tracking-wide text-gray-900 leading-none">SETTINGS</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto w-full space-y-5">

        {/* Appearance — available to all staff */}
        <div className="card p-5">
          <p className="section-title mb-4">Appearance</p>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                {isDark ? <Moon className="w-4 h-4 text-brand-500" /> : <Sun className="w-4 h-4 text-amber-500" />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-sans font-semibold text-gray-900">Dark mode</p>
                <p className="text-xs font-body text-gray-500">
                  {isDark ? 'Dark theme is on.' : 'Light theme (default).'}
                </p>
              </div>
            </div>

            {/* Toggle switch */}
            <button
              type="button"
              role="switch"
              aria-checked={isDark}
              aria-label="Toggle dark mode"
              onClick={toggleTheme}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2
                ${isDark ? 'bg-brand-600' : 'bg-gray-300'}`}
            >
              <span
                style={{ backgroundColor: '#ffffff' }}
                className={`inline-block h-5 w-5 transform rounded-full shadow transition-transform
                  ${isDark ? 'translate-x-5' : 'translate-x-0.5'}`}
              />
            </button>
          </div>
        </div>

        {/* Danger zone — admin only */}
        {isAdmin ? (
          <div className="card border border-red-100 p-5">
            <p className="section-title text-red-400 flex items-center gap-2 mb-3">
              <ShieldAlert className="w-3.5 h-3.5" /> Danger Zone
            </p>
            <p className="text-sm font-body text-gray-500 mb-4">
              Permanently delete <span className="font-semibold text-gray-700">all tickets and repair photos</span>.
              This cannot be undone.
            </p>
            <button onClick={() => setShowFlush(true)} className="btn-danger text-sm">
              <Trash2 className="w-3.5 h-3.5" /> Flush Database
            </button>
          </div>
        ) : (
          <div className="card p-5">
            <p className="section-title flex items-center gap-2 mb-3">
              <Lock className="w-3.5 h-3.5" /> Danger Zone
            </p>
            <p className="text-sm font-body text-gray-500">Database actions are restricted to the Admin role.</p>
          </div>
        )}
      </div>

      {/* Flush success toast */}
      {flushDone && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-green-700 text-white text-sm font-sans font-semibold px-5 py-3 rounded-xl shadow-lg flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-300 inline-block" /> Database flushed successfully
        </div>
      )}

      {/* Flush confirmation modal */}
      {showFlush && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="card w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <Trash2 className="w-4 h-4 text-red-600" />
                </div>
                <h2 className="font-sans font-bold text-gray-900">Flush Database</h2>
              </div>
              <button onClick={closeFlush} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors" aria-label="Cancel">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm font-body text-gray-600 leading-relaxed">
              This will permanently delete <span className="font-semibold text-gray-900">all tickets and repair photos</span>. This action cannot be undone.
            </p>
            <div className="space-y-2">
              <label className="text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide">Admin password</label>
              <input
                type="password"
                value={flushInput}
                onChange={e => { setFlushInput(e.target.value); setFlushError('') }}
                onKeyDown={e => { if (e.key === 'Enter' && flushInput && !flushing) handleFlush() }}
                className="input-field"
                placeholder="Enter admin password to confirm"
                autoFocus
              />
              {flushError && <p className="text-xs text-red-500 font-sans">{flushError}</p>}
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={closeFlush} className="btn-secondary flex-1 justify-center">Cancel</button>
              <button
                onClick={handleFlush}
                disabled={flushing || !flushInput}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-sans font-semibold transition-colors disabled:opacity-50"
              >
                {flushing
                  ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <><Trash2 className="w-3.5 h-3.5" /> Delete All Tickets</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
