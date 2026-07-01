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
import { Sun, Moon, Trash2, X, ShieldAlert, Lock, FileText, RotateCcw, Eye, EyeOff, Pencil, User, Bell } from 'lucide-react'
import { useRole } from '../../hooks/useRole.jsx'
import { useNotifications } from '../../hooks/useNotifications.jsx'
import { useTheme } from '../../hooks/useTheme.jsx'
import { adminFlushDatabase } from '../../lib/adminDelete'
import { getTerms, saveTerms, resetTerms, hasCustomTerms, DEFAULT_TERMS } from '../../lib/terms'
import { changePassword } from '../../lib/changePassword'
import { supabase, fnErrorMessage } from '../../lib/supabase'

/** How long the "flushed" success toast stays up. */
const FLUSH_SUCCESS_MS = 4000

export default function SettingsPage() {
  const { isAdmin, isManager, isStaff, isTechnician, role, staffUsername, staffName, setStaffName, setStaffUsername } = useRole()
  const { clearAll } = useNotifications()
  const { isDark, toggleTheme } = useTheme()

  // Flush DB state (admin only)
  const [showFlush,    setShowFlush]    = useState(false)
  const [flushConfirm, setFlushConfirm] = useState('')  // must type "DELETE"
  const [flushInput,   setFlushInput]   = useState('')  // admin password
  const [flushError,   setFlushError]   = useState('')
  const [flushing,     setFlushing]     = useState(false)
  const [flushDone,    setFlushDone]    = useState(false)

  // Change password state — Admin shared role password
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

  // Change personal password — Staff / Technician individual accounts
  const [showPersonalPw,    setShowPersonalPw]    = useState(false)
  const [personalPwCurrent, setPersonalPwCurrent] = useState('')
  const [personalPwNew,     setPersonalPwNew]     = useState('')
  const [personalPwConfirm, setPersonalPwConfirm] = useState('')
  const [personalPwError,   setPersonalPwError]   = useState('')
  const [personalPwSaving,  setPersonalPwSaving]  = useState(false)
  const [personalPwDone,    setPersonalPwDone]    = useState(false)
  const [personalPwShowC,   setPersonalPwShowC]   = useState(false)
  const [personalPwShowN,   setPersonalPwShowN]   = useState(false)
  const [personalPwShowCf,  setPersonalPwShowCf]  = useState(false)

  function closePersonalPw() {
    setShowPersonalPw(false)
    setPersonalPwCurrent(''); setPersonalPwNew(''); setPersonalPwConfirm('')
    setPersonalPwError('')
    setPersonalPwShowC(false); setPersonalPwShowN(false); setPersonalPwShowCf(false)
  }

  async function handlePersonalPw() {
    if (!personalPwCurrent)                        { setPersonalPwError('Enter your current password.'); return }
    if (personalPwNew.length < 8)                  { setPersonalPwError('New password must be at least 8 characters.'); return }
    if (personalPwNew !== personalPwConfirm)        { setPersonalPwError('Passwords do not match.'); return }
    if (personalPwNew === personalPwCurrent)        { setPersonalPwError('New password must differ from current.'); return }

    setPersonalPwSaving(true); setPersonalPwError('')
    try {
      const fn = isTechnician ? 'tech-manage' : 'staff-manage'
      const { data, error } = await supabase.functions.invoke(fn, {
        body: {
          action:          'change-password',
          username:        staffUsername,
          currentPassword: personalPwCurrent,
          newPassword:     personalPwNew,
        },
      })
      if (error) throw new Error(await fnErrorMessage(error))
      if (!data?.ok) throw new Error(data?.error || 'Failed to change password.')
      setPersonalPwDone(true)
      closePersonalPw()
      setTimeout(() => setPersonalPwDone(false), 4000)
    } catch (err) {
      setPersonalPwError(err.message)
    } finally {
      setPersonalPwSaving(false)
    }
  }

  // Edit name state — Staff / Technician
  const [showEditName,  setShowEditName]  = useState(false)
  const [nameInput,     setNameInput]     = useState('')
  const [nameError,     setNameError]     = useState('')
  const [nameSaving,    setNameSaving]    = useState(false)
  const [nameDone,      setNameDone]      = useState(false)

  function openEditName() { setNameInput(staffName ?? ''); setNameError(''); setShowEditName(true) }
  function closeEditName() { setShowEditName(false); setNameInput(''); setNameError('') }

  async function handleEditName() {
    const trimmed = nameInput.trim()
    if (!trimmed)          { setNameError('Name is required.'); return }
    if (trimmed.length > 80) { setNameError('Name must be 80 characters or fewer.'); return }
    setNameSaving(true); setNameError('')
    try {
      const fn = isTechnician ? 'tech-manage' : 'staff-manage'
      const { data, error } = await supabase.functions.invoke(fn, {
        body: { action: 'set-name', username: staffUsername, name: trimmed },
      })
      if (error || !data?.ok) throw new Error(data?.error || 'Failed to save name.')
      setStaffName(trimmed)
      setNameDone(true)
      closeEditName()
      setTimeout(() => setNameDone(false), 3500)
    } catch (err) { setNameError(err.message) }
    finally { setNameSaving(false) }
  }

  // Edit username state — Staff / Technician
  const [showEditUsername,  setShowEditUsername]  = useState(false)
  const [newUsernameInput,  setNewUsernameInput]  = useState('')
  const [usernamePwInput,   setUsernamePwInput]   = useState('')
  const [showUsernamePw,    setShowUsernamePw]    = useState(false)
  const [usernameError,     setUsernameError]     = useState('')
  const [usernameSaving,    setUsernameSaving]    = useState(false)
  const [usernameDone,      setUsernameDone]      = useState(false)

  function openEditUsername() { setNewUsernameInput(staffUsername ?? ''); setUsernamePwInput(''); setUsernameError(''); setShowEditUsername(true) }
  function closeEditUsername() { setShowEditUsername(false); setNewUsernameInput(''); setUsernamePwInput(''); setUsernameError('') }

  async function handleEditUsername() {
    if (!newUsernameInput.trim()) { setUsernameError('New username is required.'); return }
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(newUsernameInput.trim())) {
      setUsernameError('3–30 characters, letters, digits, underscores only.')
      return
    }
    if (!usernamePwInput) { setUsernameError('Current password is required.'); return }
    setUsernameSaving(true); setUsernameError('')
    try {
      const fn = isTechnician ? 'tech-manage' : 'staff-manage'
      const { data, error } = await supabase.functions.invoke(fn, {
        body: { action: 'change-username', username: staffUsername, newUsername: newUsernameInput.trim().toLowerCase(), currentPassword: usernamePwInput },
      })
      if (error) throw new Error(await fnErrorMessage(error))
      if (!data?.ok) throw new Error(data?.error || 'Failed to update username.')
      setStaffUsername(newUsernameInput.trim().toLowerCase())
      setUsernameDone(true)
      closeEditUsername()
      setTimeout(() => setUsernameDone(false), 3500)
    } catch (err) { setUsernameError(err.message) }
    finally { setUsernameSaving(false) }
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

  // Clear all notifications, role-wide (admin only). Permanently deletes every
  // Staff + Technician notification for everyone — distinct from the per-account
  // "Clear all" on the Notifications page, which only hides one's own inbox.
  const [showClearNotifs,  setShowClearNotifs]  = useState(false)
  const [clearingNotifs,   setClearingNotifs]   = useState(false)
  const [clearNotifsDone,  setClearNotifsDone]  = useState(false)
  const [clearNotifsError, setClearNotifsError] = useState('')

  async function handleClearNotifs() {
    setClearingNotifs(true)
    setClearNotifsError('')
    try {
      const { ok } = await clearAll()
      if (!ok) {
        setClearNotifsError('Could not clear notifications. Please try again.')
        return
      }
      setShowClearNotifs(false)
      setClearNotifsDone(true)
      setTimeout(() => setClearNotifsDone(false), 4000)
    } finally {
      setClearingNotifs(false)
    }
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

        {/* Change shared role password — Admin only */}
        {isAdmin && (
          <div className="card p-5">
            <p className="section-title flex items-center gap-2 mb-3">
              <Lock className="w-3.5 h-3.5" /> Password
            </p>
            <p className="text-sm font-body text-gray-500 mb-4">
              Change the shared password for the <span className="font-semibold text-gray-700">Admin</span> role.
              All Admin logins use this password.
            </p>
            <button onClick={() => setShowChangePw(true)} className="btn-primary text-sm">
              <Lock className="w-3.5 h-3.5" /> Change Password
            </button>
          </div>
        )}

        {/* Profile — Staff / Technician */}
        {(isStaff || isTechnician) && (
          <div className="card p-5">
            <p className="section-title flex items-center gap-2 mb-4">
              <User className="w-3.5 h-3.5" /> Profile
            </p>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Display name</p>
                  <p className="text-sm font-sans font-semibold text-gray-800 truncate">{staffName || <span className="text-gray-400 font-normal">Not set</span>}</p>
                </div>
                <button onClick={openEditName} className="btn-secondary text-xs py-1.5 px-3 shrink-0">
                  <Pencil className="w-3 h-3" /> Edit
                </button>
              </div>
              <div className="border-t border-gray-100" />
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Username</p>
                  <p className="text-sm font-mono text-gray-800 truncate">{staffUsername}</p>
                </div>
                <button onClick={openEditUsername} className="btn-secondary text-xs py-1.5 px-3 shrink-0">
                  <Pencil className="w-3 h-3" /> Edit
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Change personal password — Staff / Technician individual accounts */}
        {(isStaff || isTechnician) && (
          <div className="card p-5">
            <p className="section-title flex items-center gap-2 mb-3">
              <Lock className="w-3.5 h-3.5" /> Password
            </p>
            <p className="text-sm font-body text-gray-500 mb-4">Change your personal password.</p>
            <button onClick={() => setShowPersonalPw(true)} className="btn-primary text-sm">
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

        {/* Notifications — admin only (role-wide clear) */}
        {isAdmin && (
          <div className="card p-5">
            <p className="section-title flex items-center gap-2 mb-3">
              <Bell className="w-3.5 h-3.5" /> Notifications
            </p>
            <p className="text-sm font-body text-gray-500 mb-4">
              Permanently delete <span className="font-semibold text-gray-700">all Staff and Technician notifications</span> for
              everyone. This clears the shared inbox across every account — not just yours. This cannot be undone.
            </p>
            <button onClick={() => { setClearNotifsError(''); setShowClearNotifs(true) }} className="btn-secondary text-sm text-red-600 hover:bg-red-50 hover:border-red-200">
              <Trash2 className="w-3.5 h-3.5" /> Clear All Notifications
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

      {/* Password changed toast — Admin shared */}
      {pwDone && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-brand-700 text-white text-sm font-sans font-semibold px-5 py-3 rounded-xl shadow-lg flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-brand-300 inline-block" /> Password changed successfully
        </div>
      )}

      {/* Personal password changed toast — Staff / Technician */}
      {personalPwDone && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-brand-700 text-white text-sm font-sans font-semibold px-5 py-3 rounded-xl shadow-lg flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-brand-300 inline-block" /> Password changed successfully
        </div>
      )}

      {nameDone && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-brand-700 text-white text-sm font-sans font-semibold px-5 py-3 rounded-xl shadow-lg flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-brand-300 inline-block" /> Display name updated
        </div>
      )}

      {usernameDone && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-brand-700 text-white text-sm font-sans font-semibold px-5 py-3 rounded-xl shadow-lg flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-brand-300 inline-block" /> Username updated
        </div>
      )}

      {/* Terms saved toast */}
      {termsSaved && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-brand-700 text-white text-sm font-sans font-semibold px-5 py-3 rounded-xl shadow-lg flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-brand-300 inline-block" /> Terms &amp; Conditions updated
        </div>
      )}

      {/* Notifications cleared toast */}
      {clearNotifsDone && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-brand-700 text-white text-sm font-sans font-semibold px-5 py-3 rounded-xl shadow-lg flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-brand-300 inline-block" /> All notifications cleared
        </div>
      )}

      {/* Flush success toast */}
      {flushDone && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-green-700 text-white text-sm font-sans font-semibold px-5 py-3 rounded-xl shadow-lg flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-300 inline-block" /> Database flushed successfully
        </div>
      )}

      {/* Edit name modal */}
      {showEditName && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="card w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-brand-50 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-brand-600" />
                </div>
                <h2 className="font-sans font-bold text-gray-900">Edit Display Name</h2>
              </div>
              <button onClick={closeEditName} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors" aria-label="Cancel">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide">Display name</label>
              <input
                type="text"
                value={nameInput}
                onChange={e => { setNameInput(e.target.value); setNameError('') }}
                onKeyDown={e => { if (e.key === 'Enter' && !nameSaving) handleEditName() }}
                className="input-field"
                placeholder="Your full name"
                autoFocus
                autoComplete="name"
                maxLength={80}
              />
              {nameError && <p className="text-xs text-red-500 font-sans">{nameError}</p>}
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={closeEditName} disabled={nameSaving} className="btn-secondary flex-1 justify-center">Cancel</button>
              <button
                onClick={handleEditName}
                disabled={nameSaving || !nameInput.trim()}
                className="btn-primary flex-1 justify-center"
              >
                {nameSaving
                  ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : 'Save'
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit username modal */}
      {showEditUsername && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="card w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-brand-50 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-brand-600" />
                </div>
                <h2 className="font-sans font-bold text-gray-900">Edit Username</h2>
              </div>
              <button onClick={closeEditUsername} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors" aria-label="Cancel">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide">New username</label>
                <input
                  type="text"
                  value={newUsernameInput}
                  onChange={e => { setNewUsernameInput(e.target.value); setUsernameError('') }}
                  className="input-field font-mono"
                  placeholder="e.g. juan_dela_cruz"
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                />
                <p className="text-xs font-body text-gray-400">3–30 chars · letters, digits, underscores</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide">Current password</label>
                <div className="relative">
                  <input
                    type={showUsernamePw ? 'text' : 'password'}
                    value={usernamePwInput}
                    onChange={e => { setUsernamePwInput(e.target.value); setUsernameError('') }}
                    onKeyDown={e => { if (e.key === 'Enter' && !usernameSaving) handleEditUsername() }}
                    className="input-field pr-9"
                    placeholder="Confirm with your password"
                    autoComplete="current-password"
                  />
                  <button type="button" onClick={() => setShowUsernamePw(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={showUsernamePw ? 'Hide' : 'Show'}
                  >
                    {showUsernamePw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {usernameError && <p className="text-xs text-red-500 font-sans">{usernameError}</p>}
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={closeEditUsername} disabled={usernameSaving} className="btn-secondary flex-1 justify-center">Cancel</button>
              <button
                onClick={handleEditUsername}
                disabled={usernameSaving || !newUsernameInput.trim() || !usernamePwInput}
                className="btn-primary flex-1 justify-center"
              >
                {usernameSaving
                  ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : 'Save'
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Personal password modal — Staff / Technician */}
      {showPersonalPw && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="card w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-brand-50 flex items-center justify-center shrink-0">
                  <Lock className="w-4 h-4 text-brand-600" />
                </div>
                <h2 className="font-sans font-bold text-gray-900">Change Password</h2>
              </div>
              <button onClick={closePersonalPw} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors" aria-label="Cancel">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm font-body text-gray-700">Your password only.</p>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide">Current password</label>
                <div className="relative">
                  <input
                    type={personalPwShowC ? 'text' : 'password'}
                    value={personalPwCurrent}
                    onChange={e => { setPersonalPwCurrent(e.target.value); setPersonalPwError('') }}
                    className="input-field pr-9"
                    placeholder="Enter current password"
                    autoFocus
                    autoComplete="current-password"
                  />
                  <button type="button" onClick={() => setPersonalPwShowC(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={personalPwShowC ? 'Hide' : 'Show'}
                  >
                    {personalPwShowC ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide">New password</label>
                <div className="relative">
                  <input
                    type={personalPwShowN ? 'text' : 'password'}
                    value={personalPwNew}
                    onChange={e => { setPersonalPwNew(e.target.value); setPersonalPwError('') }}
                    className="input-field pr-9"
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                  />
                  <button type="button" onClick={() => setPersonalPwShowN(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={personalPwShowN ? 'Hide' : 'Show'}
                  >
                    {personalPwShowN ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide">Confirm new password</label>
                <div className="relative">
                  <input
                    type={personalPwShowCf ? 'text' : 'password'}
                    value={personalPwConfirm}
                    onChange={e => { setPersonalPwConfirm(e.target.value); setPersonalPwError('') }}
                    onKeyDown={e => { if (e.key === 'Enter' && !personalPwSaving) handlePersonalPw() }}
                    className="input-field pr-9"
                    placeholder="Repeat new password"
                    autoComplete="new-password"
                  />
                  <button type="button" onClick={() => setPersonalPwShowCf(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={personalPwShowCf ? 'Hide' : 'Show'}
                  >
                    {personalPwShowCf ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {personalPwError && <p className="text-xs text-red-500 font-sans">{personalPwError}</p>}
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={closePersonalPw} disabled={personalPwSaving} className="btn-secondary flex-1 justify-center">Cancel</button>
              <button
                onClick={handlePersonalPw}
                disabled={personalPwSaving || !personalPwCurrent || !personalPwNew || !personalPwConfirm}
                className="btn-primary flex-1 justify-center"
              >
                {personalPwSaving
                  ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <><Lock className="w-3.5 h-3.5" /> Save</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change password modal — Admin shared role */}
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

      {/* Clear notifications confirmation modal — admin role-wide */}
      {showClearNotifs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="card w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <Bell className="w-4 h-4 text-red-600" />
                </div>
                <h2 className="font-sans font-bold text-gray-900">Clear All Notifications</h2>
              </div>
              <button onClick={() => { setShowClearNotifs(false); setClearNotifsError('') }} disabled={clearingNotifs} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50" aria-label="Cancel">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm font-body text-gray-600 leading-relaxed">
              This permanently deletes <span className="font-semibold text-gray-900">all Staff and Technician notifications</span> for
              every account. This cannot be undone.
            </p>
            {clearNotifsError && (
              <p className="text-sm font-body text-red-600">{clearNotifsError}</p>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setShowClearNotifs(false); setClearNotifsError('') }} disabled={clearingNotifs} className="btn-secondary flex-1 justify-center">Cancel</button>
              <button
                onClick={handleClearNotifs}
                disabled={clearingNotifs}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-sans font-semibold transition-colors disabled:opacity-50"
              >
                {clearingNotifs
                  ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <><Trash2 className="w-3.5 h-3.5" /> Delete All</>
                }
              </button>
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
