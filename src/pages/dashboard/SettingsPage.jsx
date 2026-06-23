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
import { format } from 'date-fns'
import { Sun, Moon, Trash2, X, ShieldAlert, Lock, FileText, RotateCcw, Eye, EyeOff } from 'lucide-react'
import { useRole } from '../../hooks/useRole.jsx'
import { useTheme } from '../../hooks/useTheme.jsx'
import { adminFlushDatabase } from '../../lib/adminDelete'
import { getTerms, saveTerms, resetTerms, hasCustomTerms, DEFAULT_TERMS } from '../../lib/terms'
import { changePassword } from '../../lib/changePassword'

/** How long the "flushed" success toast stays up. */
const FLUSH_SUCCESS_MS = 4000

export default function SettingsPage() {
  const { isAdmin, isManager, isTechnician, role } = useRole()
  const { isDark, toggleTheme } = useTheme()

  // Flush DB state (admin only)
  const [showFlush,    setShowFlush]    = useState(false)
  const [flushConfirm, setFlushConfirm] = useState('')  // must type "DELETE"
  const [flushInput,   setFlushInput]   = useState('')  // admin password
  const [flushError,   setFlushError]   = useState('')
  const [flushing,     setFlushing]     = useState(false)
  const [flushDone,    setFlushDone]    = useState(false)

  // Change password state (admin + technician)
  const [showChangePw,    setShowChangePw]    = useState(false)
  const [pwCurrent,       setPwCurrent]       = useState('')
  const [pwNew,           setPwNew]           = useState('')
  const [pwConfirm,       setPwConfirm]       = useState('')
  const [pwError,         setPwError]         = useState('')
  const [pwSaving,        setPwSaving]        = useState(false)
  const [pwDone,          setPwDone]          = useState(false)
  const [pwShowCurrent,   setPwShowCurrent]   = useState(false)
  const [pwShowNew,       setPwShowNew]       = useState(false)
  const [pwShowConfirm,   setPwShowConfirm]   = useState(false)

  function closeChangePw() {
    setShowChangePw(false)
    setPwCurrent(''); setPwNew(''); setPwConfirm(''); setPwError('')
    setPwShowCurrent(false); setPwShowNew(false); setPwShowConfirm(false)
  }

  async function handleChangePw() {
    if (!pwCurrent)                { setPwError('Enter your current password.');           return }
    if (pwNew.length < 8)          { setPwError('New password must be at least 8 characters.'); return }
    if (pwNew !== pwConfirm)       { setPwError('Passwords do not match.');                return }
    if (pwNew === pwCurrent)       { setPwError('New password must differ from current.'); return }
    setPwSaving(true); setPwError('')
    try {
      await changePassword(role, pwCurrent, pwNew)
      setPwDone(true)
      closeChangePw()
      setTimeout(() => setPwDone(false), 4000)
    } catch (err) {
      setPwError(err.message)
    } finally {
      setPwSaving(false)
    }
  }

  // Terms editor state (admin only)
  const [showTerms, setShowTerms]     = useState(false)
  const [termsDraft, setTermsDraft]   = useState([])
  const [termsCustom, setTermsCustom] = useState(false)
  const [termsSaved, setTermsSaved]   = useState(false)
  const [termsLoading, setTermsLoading] = useState(false)
  const [termsSaving, setTermsSaving]   = useState(false)

  async function openTermsEditor() {
    setTermsLoading(true)
    setShowTerms(true)
    const [sections, custom] = await Promise.all([getTerms(), hasCustomTerms()])
    setTermsDraft(sections.map(s => ({ ...s })))
    setTermsCustom(custom)
    setTermsLoading(false)
  }

  function handleTermsChange(idx, value) {
    setTermsDraft(prev => prev.map((s, i) => i === idx ? { ...s, content: value } : s))
  }

  async function handleTermsSave() {
    setTermsSaving(true)
    await saveTerms(termsDraft)
    setTermsSaving(false)
    setTermsCustom(true)
    setShowTerms(false)
    setTermsSaved(true)
    setTimeout(() => setTermsSaved(false), 3000)
  }

  async function handleTermsReset() {
    setTermsLoading(true)
    await resetTerms()
    setTermsCustom(false)
    setTermsDraft(DEFAULT_TERMS.map(s => ({ ...s })))
    setTermsLoading(false)
  }

  function closeTermsEditor() {
    setShowTerms(false)
  }

  async function handleFlush() {
    if (flushConfirm !== 'DELETE') { setFlushError('Type DELETE to confirm.'); return }
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
    setFlushConfirm('')
    setFlushInput('')
    setFlushError('')
  }

  return (
    <div className="flex flex-col flex-1 animate-fade-in">

      {/* Header */}
      <div className="-mx-5 -mt-5 lg:-mx-7 lg:-mt-7 bg-white border-b border-gray-200">
        <div className="h-0.5 bg-gradient-to-r from-brand-500 to-accent-500" />
        <div className="px-5 lg:px-7 py-5">
          <h1 className="font-display text-4xl sm:text-5xl tracking-widest text-gray-900 leading-none">SETTINGS</h1>
          <p className="text-sm font-body text-gray-400 mt-2">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
        </div>
      </div>

      {/* Settings container */}
      <div className="max-w-2xl mx-auto w-full flex-1 flex flex-col gap-5 bg-gray-50 border border-gray-200 p-5 -mb-5 lg:-mb-7">

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

        {/* Change password — admin + technician */}
        {(isAdmin || isTechnician) && (
          <div className="card p-5">
            <p className="section-title flex items-center gap-2 mb-3">
              <Lock className="w-3.5 h-3.5" /> Password
            </p>
            <p className="text-sm font-body text-gray-500 mb-4">
              Change the shared password for the <span className="font-semibold text-gray-700">{role}</span> role.
              All {role} logins use this password.
            </p>
            <button onClick={() => setShowChangePw(true)} className="btn-primary text-sm">
              <Lock className="w-3.5 h-3.5" /> Change Password
            </button>
          </div>
        )}

        {/* Terms & Conditions editor — admin only */}
        {isAdmin && (
          <div className="card p-5">
            <p className="section-title flex items-center gap-2 mb-3">
              <FileText className="w-3.5 h-3.5" /> Terms &amp; Conditions
            </p>
            <p className="text-sm font-body text-gray-500 mb-4">
              Edit the terms and conditions displayed on the Submit Ticket page.
              {termsCustom && <span className="ml-1 text-brand-600 font-semibold">Custom terms are active.</span>}
            </p>
            <button onClick={openTermsEditor} className="btn-primary text-sm">
              <FileText className="w-3.5 h-3.5" /> Edit Terms
            </button>
          </div>
        )}

        {/* Danger zone — admin only */}
        {isAdmin && (
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
        )}
      </div>

      {/* Password changed toast */}
      {pwDone && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-brand-700 text-white text-sm font-sans font-semibold px-5 py-3 rounded-xl shadow-lg flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-brand-300 inline-block" /> Password changed successfully
        </div>
      )}

      {/* Terms saved toast */}
      {termsSaved && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-brand-700 text-white text-sm font-sans font-semibold px-5 py-3 rounded-xl shadow-lg flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-brand-300 inline-block" /> Terms &amp; Conditions updated
        </div>
      )}

      {/* Flush success toast */}
      {flushDone && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-green-700 text-white text-sm font-sans font-semibold px-5 py-3 rounded-xl shadow-lg flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-300 inline-block" /> Database flushed successfully
        </div>
      )}

      {/* Change password modal */}
      {showChangePw && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="card w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-brand-50 flex items-center justify-center shrink-0">
                  <Lock className="w-4 h-4 text-brand-600" />
                </div>
                <h2 className="font-sans font-bold text-gray-900">Change Password</h2>
              </div>
              <button onClick={closeChangePw} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors" aria-label="Cancel">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm font-body text-gray-500">
              Updating the <span className="font-semibold text-gray-700">{role}</span> password affects all logins for this role.
            </p>

            <div className="space-y-3">
              {/* Current password */}
              <div className="space-y-1.5">
                <label className="text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide">Current password</label>
                <div className="relative">
                  <input
                    type={pwShowCurrent ? 'text' : 'password'}
                    value={pwCurrent}
                    onChange={e => { setPwCurrent(e.target.value); setPwError('') }}
                    className="input-field pr-9"
                    placeholder="Enter current password"
                    autoFocus
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setPwShowCurrent(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label={pwShowCurrent ? 'Hide password' : 'Show password'}
                  >
                    {pwShowCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* New password */}
              <div className="space-y-1.5">
                <label className="text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide">New password</label>
                <div className="relative">
                  <input
                    type={pwShowNew ? 'text' : 'password'}
                    value={pwNew}
                    onChange={e => { setPwNew(e.target.value); setPwError('') }}
                    className="input-field pr-9"
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setPwShowNew(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label={pwShowNew ? 'Hide password' : 'Show password'}
                  >
                    {pwShowNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm new password */}
              <div className="space-y-1.5">
                <label className="text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide">Confirm new password</label>
                <div className="relative">
                  <input
                    type={pwShowConfirm ? 'text' : 'password'}
                    value={pwConfirm}
                    onChange={e => { setPwConfirm(e.target.value); setPwError('') }}
                    onKeyDown={e => { if (e.key === 'Enter' && !pwSaving) handleChangePw() }}
                    className="input-field pr-9"
                    placeholder="Repeat new password"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setPwShowConfirm(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label={pwShowConfirm ? 'Hide password' : 'Show password'}
                  >
                    {pwShowConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {pwError && <p className="text-xs text-red-500 font-sans">{pwError}</p>}
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={closeChangePw} disabled={pwSaving} className="btn-secondary flex-1 justify-center">Cancel</button>
              <button
                onClick={handleChangePw}
                disabled={pwSaving || !pwCurrent || !pwNew || !pwConfirm}
                className="btn-primary flex-1 justify-center"
              >
                {pwSaving
                  ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <><Lock className="w-3.5 h-3.5" /> Save</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Terms editor modal */}
      {showTerms && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="card w-full max-w-2xl flex flex-col" style={{ maxHeight: '90vh' }}>
            <div className="flex items-center justify-between p-6 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-brand-50 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-brand-600" />
                </div>
                <h2 className="font-sans font-bold text-gray-900">Edit Terms &amp; Conditions</h2>
              </div>
              <button onClick={closeTermsEditor} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors" aria-label="Cancel">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-6 space-y-5">
              {termsLoading
                ? <div className="flex items-center justify-center py-12">
                    <span className="w-6 h-6 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
                  </div>
                : termsDraft.map((section, idx) => (
                    <div key={section.title}>
                      <label className="block text-xs font-sans font-semibold uppercase tracking-widest text-gray-400 mb-1.5">
                        {section.title}
                      </label>
                      <textarea
                        value={section.content}
                        onChange={e => handleTermsChange(idx, e.target.value)}
                        rows={3}
                        className="input-field resize-y text-sm font-body leading-relaxed w-full"
                      />
                    </div>
                  ))
              }
            </div>

            <div className="flex items-center justify-between gap-2 p-6 border-t border-gray-100 shrink-0">
              <button
                onClick={handleTermsReset}
                disabled={termsLoading || termsSaving || !termsCustom}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-sans font-semibold text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reset to Default
              </button>
              <div className="flex gap-2">
                <button onClick={closeTermsEditor} disabled={termsSaving} className="btn-secondary text-sm">Cancel</button>
                <button
                  onClick={handleTermsSave}
                  disabled={termsLoading || termsSaving}
                  className="btn-primary text-sm"
                >
                  {termsSaving
                    ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : 'Save'
                  }
                </button>
              </div>
            </div>
          </div>
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
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide">
                  Type <span className="text-red-600 font-mono">DELETE</span> to confirm
                </label>
                <input
                  type="text"
                  value={flushConfirm}
                  onChange={e => { setFlushConfirm(e.target.value); setFlushError('') }}
                  className="input-field font-mono"
                  placeholder="DELETE"
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide">Admin password</label>
                <input
                  type="password"
                  value={flushInput}
                  onChange={e => { setFlushInput(e.target.value); setFlushError('') }}
                  onKeyDown={e => { if (e.key === 'Enter' && flushConfirm === 'DELETE' && flushInput && !flushing) handleFlush() }}
                  className="input-field"
                  placeholder="Enter admin password to confirm"
                />
              </div>
              {flushError && <p className="text-xs text-red-500 font-sans">{flushError}</p>}
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={closeFlush} className="btn-secondary flex-1 justify-center">Cancel</button>
              <button
                onClick={handleFlush}
                disabled={flushing || flushConfirm !== 'DELETE' || !flushInput}
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
