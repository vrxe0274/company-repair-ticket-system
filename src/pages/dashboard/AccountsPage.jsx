/**
 * @file AccountsPage.jsx
 * @description Admin-only page for managing individual Staff and Technician accounts.
 *
 * Admins can:
 *   - View all staff and technician accounts
 *   - Create new staff / technician accounts (username + password)
 *   - Delete accounts
 *     Staff:      simple confirm modal (Cancel / Delete)
 *     Technician: type-to-confirm modal (must type username to enable Delete)
 *
 * The page requires the admin password once on load (unlock gate). That
 * password is stored in component state for the session and reused for all
 * subsequent operations — no re-entry needed.
 */

import { useState, useCallback, useMemo, useEffect } from 'react'
import { format } from 'date-fns'
import {
  Plus, Trash2, X, Eye, EyeOff, Search,
  Shield, Wrench, KeyRound, Copy, Check,
} from 'lucide-react'
import { supabase, fnErrorMessage } from '../../lib/supabase'

// ── Helpers ────────────────────────────────────────────────────────────────────

async function callStaffManage(body) {
  const { data, error } = await supabase.functions.invoke('staff-manage', { body })
  if (error) throw new Error(await fnErrorMessage(error))
  if (!data?.ok) throw new Error(data?.error || 'Operation failed.')
  return data
}

async function callTechManage(body) {
  const { data, error } = await supabase.functions.invoke('tech-manage', { body })
  if (error) throw new Error(await fnErrorMessage(error))
  if (!data?.ok) throw new Error(data?.error || 'Operation failed.')
  return data
}

// ── Page component ─────────────────────────────────────────────────────────────

export default function AccountsPage() {
  // ── Staff state ───────────────────────────────────────────────────────────
  const [accounts,     setAccounts]     = useState([])
  const [listLoading,  setListLoading]  = useState(false)
  const [listError,    setListError]    = useState('')

  const [showCreate,   setShowCreate]   = useState(false)
  const [newUsername,  setNewUsername]  = useState('')
  const [newPassword,  setNewPassword]  = useState('')
  const [newPwConfirm, setNewPwConfirm] = useState('')
  const [showNewPw,    setShowNewPw]    = useState(false)
  const [creating,     setCreating]     = useState(false)
  const [createError,  setCreateError]  = useState('')

  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting,     setDeleting]     = useState(false)
  const [deleteError,  setDeleteError]  = useState('')

  // ── Technician state ──────────────────────────────────────────────────────
  const [techAccounts,    setTechAccounts]    = useState([])
  const [techListLoading, setTechListLoading] = useState(false)
  const [techListError,   setTechListError]   = useState('')

  const [showCreateTech,   setShowCreateTech]   = useState(false)
  const [newTechUsername,  setNewTechUsername]  = useState('')
  const [newTechPassword,  setNewTechPassword]  = useState('')
  const [newTechPwConfirm, setNewTechPwConfirm] = useState('')
  const [showNewTechPw,    setShowNewTechPw]    = useState(false)
  const [creatingTech,     setCreatingTech]     = useState(false)
  const [createTechError,  setCreateTechError]  = useState('')

  const [deleteTechTarget,  setDeleteTechTarget]  = useState(null)
  const [deletingTech,      setDeletingTech]      = useState(false)
  const [deleteTechError,   setDeleteTechError]   = useState('')

  // ── Reset password state ──────────────────────────────────────────────────
  // resetTarget: { username, type: 'staff' | 'tech' }
  const [resetTarget,   setResetTarget]   = useState(null)
  const [resetting,     setResetting]     = useState(false)
  const [resetError,    setResetError]    = useState('')
  const [tempPassword,  setTempPassword]  = useState('')  // shown once after reset
  const [copied,        setCopied]        = useState(false)

  // ── Search ────────────────────────────────────────────────────────────────
  const [query, setQuery] = useState('')

  const filteredStaff = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return accounts
    return accounts.filter(a =>
      a.username.toLowerCase().includes(q) || (a.name ?? '').toLowerCase().includes(q)
    )
  }, [accounts, query])

  const filteredTech = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return techAccounts
    return techAccounts.filter(a =>
      a.username.toLowerCase().includes(q) || (a.name ?? '').toLowerCase().includes(q)
    )
  }, [techAccounts, query])

  // ── Toast ─────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState('')
  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 3500) }

  // ── Load helpers ──────────────────────────────────────────────────────────
  const loadStaff = useCallback(async () => {
    setListLoading(true); setListError('')
    try {
      const { accounts: data } = await callStaffManage({ action: 'list' })
      setAccounts(data ?? [])
    } catch (err) { setListError(err.message) }
    finally { setListLoading(false) }
  }, [])

  const loadTech = useCallback(async () => {
    setTechListLoading(true); setTechListError('')
    try {
      const { accounts: data } = await callTechManage({ action: 'list' })
      setTechAccounts(data ?? [])
    } catch (err) { setTechListError(err.message) }
    finally { setTechListLoading(false) }
  }, [])

  useEffect(() => { loadStaff(); loadTech() }, [loadStaff, loadTech])

  // ── Staff create ──────────────────────────────────────────────────────────
  function openCreate() {
    setNewUsername(''); setNewPassword(''); setNewPwConfirm('')
    setShowNewPw(false); setCreateError('')
    setShowCreate(true)
  }
  function closeCreate() { setShowCreate(false) }

  async function handleCreate() {
    if (!newUsername.trim()) { setCreateError('Username is required.'); return }
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(newUsername.trim())) {
      setCreateError('Username: 3–30 chars, letters, digits, underscores only.')
      return
    }
    if (newPassword.length < 8)       { setCreateError('Password must be at least 8 characters.'); return }
    if (newPassword !== newPwConfirm) { setCreateError('Passwords do not match.'); return }

    setCreating(true); setCreateError('')
    try {
      await callStaffManage({
        action: 'create',
        username: newUsername.trim().toLowerCase(),
        password: newPassword,
      })
      closeCreate()
      showToast(`Staff account "${newUsername.trim().toLowerCase()}" created.`)
      loadStaff()
    } catch (err) {
      setCreateError(err.message)
    }
    finally { setCreating(false) }
  }

  // ── Staff delete ──────────────────────────────────────────────────────────
  function openDelete(username) {
    setDeleteTarget(username); setDeleteError('')
  }
  function closeDelete() { setDeleteTarget(null); setDeleteError('') }

  async function handleDelete() {
    setDeleting(true); setDeleteError('')
    try {
      await callStaffManage({ action: 'delete', username: deleteTarget })
      closeDelete()
      showToast(`Staff account "${deleteTarget}" deleted.`)
      loadStaff()
    } catch (err) {
      setDeleteError(err.message)
    }
    finally { setDeleting(false) }
  }

  // ── Tech create ───────────────────────────────────────────────────────────
  function openCreateTech() {
    setNewTechUsername(''); setNewTechPassword(''); setNewTechPwConfirm('')
    setShowNewTechPw(false); setCreateTechError('')
    setShowCreateTech(true)
  }
  function closeCreateTech() { setShowCreateTech(false) }

  async function handleCreateTech() {
    if (!newTechUsername.trim()) { setCreateTechError('Username is required.'); return }
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(newTechUsername.trim())) {
      setCreateTechError('Username: 3–30 chars, letters, digits, underscores only.')
      return
    }
    if (newTechPassword.length < 8)           { setCreateTechError('Password must be at least 8 characters.'); return }
    if (newTechPassword !== newTechPwConfirm) { setCreateTechError('Passwords do not match.'); return }

    setCreatingTech(true); setCreateTechError('')
    try {
      await callTechManage({
        action: 'create',
        username: newTechUsername.trim().toLowerCase(),
        password: newTechPassword,
      })
      closeCreateTech()
      showToast(`Technician account "${newTechUsername.trim().toLowerCase()}" created.`)
      loadTech()
    } catch (err) {
      setCreateTechError(err.message)
    }
    finally { setCreatingTech(false) }
  }

  // ── Tech delete ───────────────────────────────────────────────────────────
  function openDeleteTech(username) {
    setDeleteTechTarget(username); setDeleteTechError('')
  }
  function closeDeleteTech() { setDeleteTechTarget(null); setDeleteTechError('') }

  async function handleDeleteTech() {
    setDeletingTech(true); setDeleteTechError('')
    try {
      await callTechManage({ action: 'delete', username: deleteTechTarget })
      closeDeleteTech()
      showToast(`Technician account "${deleteTechTarget}" deleted.`)
      loadTech()
    } catch (err) {
      setDeleteTechError(err.message)
    }
    finally { setDeletingTech(false) }
  }

  // ── Reset password ────────────────────────────────────────────────────────
  function openReset(username, type) {
    setResetTarget({ username, type })
    setResetError('')
    setTempPassword('')
    setCopied(false)
  }
  function closeReset() { setResetTarget(null); setTempPassword(''); setResetError(''); setCopied(false) }

  async function handleReset() {
    setResetting(true); setResetError('')
    try {
      const fn     = resetTarget.type === 'tech' ? callTechManage : callStaffManage
      const result = await fn({ action: 'reset-password', username: resetTarget.username })
      setTempPassword(result.tempPassword)
    } catch (err) {
      setResetError(err.message)
    }
    finally { setResetting(false) }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(tempPassword)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard denied */ }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="-mx-5 -mt-5 lg:-mx-7 lg:-mt-7 bg-white border-b border-gray-200 mb-1">
        <div className="h-0.5 bg-gradient-to-r from-brand-500 to-accent-500" />
        <div className="px-5 lg:px-7 py-5">
          <h1 className="font-display text-4xl sm:text-5xl tracking-widest text-gray-900 leading-none">ACCOUNTS</h1>
          <p className="text-sm font-body text-gray-400 mt-2">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
        </div>
      </div>

      {/* Shared search */}
      <div className="max-w-2xl mx-auto w-full">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name or username…"
            className="input-field pl-9 py-2 text-sm"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>

      {/* ── Staff Section ── */}
      <div className="card overflow-hidden max-w-2xl mx-auto w-full">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-500" />
            <p className="text-sm font-sans font-semibold text-gray-700">Staff</p>
            <span className="text-xs font-mono text-gray-400">({accounts.length})</span>
          </div>
          <button onClick={openCreate} className="btn-primary text-xs py-1.5 px-3">
            <Plus className="w-3.5 h-3.5" /> Add Staff
          </button>
        </div>

        {listLoading && (
          <div className="flex items-center justify-center py-10">
            <span className="w-5 h-5 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {listError && !listLoading && (
          <p className="text-sm text-red-500 font-body py-8 text-center px-5">{listError}</p>
        )}
        {!listLoading && !listError && accounts.length === 0 && (
          <div className="text-center py-10 px-5">
            <p className="text-sm font-sans font-semibold text-gray-700">No staff accounts yet</p>
            <p className="text-xs font-body text-gray-400 mt-1">Add the first one using the button above.</p>
          </div>
        )}
        {!listLoading && !listError && accounts.length > 0 && filteredStaff.length === 0 && (
          <div className="text-center py-10 px-5">
            <p className="text-sm font-sans font-semibold text-gray-700">No results for "{query}"</p>
          </div>
        )}
        {!listLoading && !listError && filteredStaff.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {filteredStaff.map(acc => (
              <li key={acc.id} className="group flex items-center gap-4 px-5 py-4 hover:bg-gray-50/70 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                  <span className="text-sm font-sans font-bold text-emerald-700 uppercase leading-none">
                    {(acc.name ?? acc.username).charAt(0)}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-sans font-semibold text-gray-900 truncate">{acc.name ?? acc.username}</p>
                    {!acc.name && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-[10px] font-sans font-semibold text-amber-700 leading-none shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                        Setup pending
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-mono text-gray-400 mt-0.5 truncate">{acc.username}</p>
                </div>
                <p className="hidden sm:block text-xs font-body text-gray-400 shrink-0 tabular-nums">
                  {format(new Date(acc.created_at), 'MMM d, yyyy')}
                </p>
                <button
                  onClick={() => openReset(acc.username, 'staff')}
                  className="p-1.5 text-gray-300 group-hover:text-gray-400 hover:!text-amber-500 transition-colors shrink-0"
                  aria-label={`Reset password for ${acc.username}`}
                >
                  <KeyRound className="w-4 h-4" />
                </button>
                <button
                  onClick={() => openDelete(acc.username)}
                  className="p-1.5 text-gray-300 group-hover:text-gray-400 hover:!text-red-500 transition-colors shrink-0"
                  aria-label={`Delete ${acc.username}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Technician Section ── */}
      <div className="card overflow-hidden max-w-2xl mx-auto w-full">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench className="w-4 h-4 text-accent-500" />
            <p className="text-sm font-sans font-semibold text-gray-700">Technicians</p>
            <span className="text-xs font-mono text-gray-400">({techAccounts.length})</span>
          </div>
          <button onClick={openCreateTech} className="btn-primary text-xs py-1.5 px-3">
            <Plus className="w-3.5 h-3.5" /> Add Technician
          </button>
        </div>

        {techListLoading && (
          <div className="flex items-center justify-center py-10">
            <span className="w-5 h-5 border-2 border-accent-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {techListError && !techListLoading && (
          <p className="text-sm text-red-500 font-body py-8 text-center px-5">{techListError}</p>
        )}
        {!techListLoading && !techListError && techAccounts.length === 0 && (
          <div className="text-center py-10 px-5">
            <p className="text-sm font-sans font-semibold text-gray-700">No technician accounts yet</p>
            <p className="text-xs font-body text-gray-400 mt-1">Add the first one using the button above.</p>
          </div>
        )}
        {!techListLoading && !techListError && techAccounts.length > 0 && filteredTech.length === 0 && (
          <div className="text-center py-10 px-5">
            <p className="text-sm font-sans font-semibold text-gray-700">No results for "{query}"</p>
          </div>
        )}
        {!techListLoading && !techListError && filteredTech.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {filteredTech.map(acc => (
              <li key={acc.id} className="group flex items-center gap-4 px-5 py-4 hover:bg-gray-50/70 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-accent-100 flex items-center justify-center shrink-0">
                  <span className="text-sm font-sans font-bold text-accent-700 uppercase leading-none">
                    {(acc.name ?? acc.username).charAt(0)}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-sans font-semibold text-gray-900 truncate">{acc.name ?? acc.username}</p>
                    {!acc.name && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-[10px] font-sans font-semibold text-amber-700 leading-none shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                        Setup pending
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-mono text-gray-400 mt-0.5 truncate">{acc.username}</p>
                </div>
                <p className="hidden sm:block text-xs font-body text-gray-400 shrink-0 tabular-nums">
                  {format(new Date(acc.created_at), 'MMM d, yyyy')}
                </p>
                <button
                  onClick={() => openReset(acc.username, 'tech')}
                  className="p-1.5 text-gray-300 group-hover:text-gray-400 hover:!text-amber-500 transition-colors shrink-0"
                  aria-label={`Reset password for ${acc.username}`}
                >
                  <KeyRound className="w-4 h-4" />
                </button>
                <button
                  onClick={() => openDeleteTech(acc.username)}
                  className="p-1.5 text-gray-300 group-hover:text-gray-400 hover:!text-red-500 transition-colors shrink-0"
                  aria-label={`Delete ${acc.username}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Create Staff modal ── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="card w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                  <Plus className="w-4 h-4 text-emerald-600" />
                </div>
                <h2 className="font-sans font-bold text-gray-900">New Staff Account</h2>
              </div>
              <button onClick={closeCreate} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors" aria-label="Cancel">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide">Username</label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={e => { setNewUsername(e.target.value); setCreateError('') }}
                  className="input-field font-mono"
                  placeholder="e.g. juan_dela_cruz"
                  autoFocus autoComplete="off" spellCheck={false}
                />
                <p className="text-xs font-body text-gray-400">3–30 chars · letters (A–Z, a–z), digits, underscore</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide">Password</label>
                <div className="relative">
                  <input
                    type={showNewPw ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => { setNewPassword(e.target.value); setCreateError('') }}
                    className="input-field pr-9"
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                  />
                  <button type="button" onClick={() => setShowNewPw(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={showNewPw ? 'Hide' : 'Show'}
                  >
                    {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide">Confirm Password</label>
                <input
                  type="password"
                  value={newPwConfirm}
                  onChange={e => { setNewPwConfirm(e.target.value); setCreateError('') }}
                  className="input-field"
                  placeholder="Repeat password"
                  autoComplete="new-password"
                  onKeyDown={e => { if (e.key === 'Enter' && !creating) handleCreate() }}
                />
              </div>
              {createError && <p className="text-xs text-red-500 font-sans">{createError}</p>}
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={closeCreate} disabled={creating} className="btn-secondary flex-1 justify-center">Cancel</button>
              <button
                onClick={handleCreate}
                disabled={creating || !newUsername.trim() || !newPassword || !newPwConfirm}
                className="btn-primary flex-1 justify-center"
              >
                {creating
                  ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <><Plus className="w-3.5 h-3.5" /> Create</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create Technician modal ── */}
      {showCreateTech && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="card w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-accent-50 flex items-center justify-center shrink-0">
                  <Plus className="w-4 h-4 text-accent-600" />
                </div>
                <h2 className="font-sans font-bold text-gray-900">New Technician Account</h2>
              </div>
              <button onClick={closeCreateTech} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors" aria-label="Cancel">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide">Username</label>
                <input
                  type="text"
                  value={newTechUsername}
                  onChange={e => { setNewTechUsername(e.target.value); setCreateTechError('') }}
                  className="input-field font-mono"
                  placeholder="e.g. pedro_reyes"
                  autoFocus autoComplete="off" spellCheck={false}
                />
                <p className="text-xs font-body text-gray-400">3–30 chars · letters (A–Z, a–z), digits, underscore</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide">Password</label>
                <div className="relative">
                  <input
                    type={showNewTechPw ? 'text' : 'password'}
                    value={newTechPassword}
                    onChange={e => { setNewTechPassword(e.target.value); setCreateTechError('') }}
                    className="input-field pr-9"
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                  />
                  <button type="button" onClick={() => setShowNewTechPw(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={showNewTechPw ? 'Hide' : 'Show'}
                  >
                    {showNewTechPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide">Confirm Password</label>
                <input
                  type="password"
                  value={newTechPwConfirm}
                  onChange={e => { setNewTechPwConfirm(e.target.value); setCreateTechError('') }}
                  className="input-field"
                  placeholder="Repeat password"
                  autoComplete="new-password"
                  onKeyDown={e => { if (e.key === 'Enter' && !creatingTech) handleCreateTech() }}
                />
              </div>
              {createTechError && <p className="text-xs text-red-500 font-sans">{createTechError}</p>}
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={closeCreateTech} disabled={creatingTech} className="btn-secondary flex-1 justify-center">Cancel</button>
              <button
                onClick={handleCreateTech}
                disabled={creatingTech || !newTechUsername.trim() || !newTechPassword || !newTechPwConfirm}
                className="btn-primary flex-1 justify-center"
              >
                {creatingTech
                  ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <><Plus className="w-3.5 h-3.5" /> Create</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Staff modal (simple confirm) ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="card w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <Trash2 className="w-4 h-4 text-red-600" />
                </div>
                <h2 className="font-sans font-bold text-gray-900">Delete Account</h2>
              </div>
              <button onClick={closeDelete} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors" aria-label="Cancel">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm font-body text-gray-600 leading-relaxed">
              Delete staff account{' '}
              <span className="font-semibold font-mono text-gray-900">{deleteTarget}</span>?
              This immediately revokes their access and cannot be undone.
            </p>

            {deleteError && <p className="text-xs text-red-500 font-sans">{deleteError}</p>}

            <div className="flex gap-2 pt-1">
              <button onClick={closeDelete} disabled={deleting} className="btn-secondary flex-1 justify-center">Cancel</button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-sans font-semibold transition-colors disabled:opacity-50"
              >
                {deleting
                  ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <><Trash2 className="w-3.5 h-3.5" /> Delete</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Technician modal (type-to-confirm) ── */}
      {deleteTechTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="card w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <Trash2 className="w-4 h-4 text-red-600" />
                </div>
                <h2 className="font-sans font-bold text-gray-900">Delete Technician</h2>
              </div>
              <button onClick={closeDeleteTech} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors" aria-label="Cancel">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm font-body text-gray-600 leading-relaxed">
              Delete technician account{' '}
              <span className="font-semibold font-mono text-gray-900">{deleteTechTarget}</span>?
              This immediately revokes their access and cannot be undone.
            </p>

            {deleteTechError && <p className="text-xs text-red-500 font-sans">{deleteTechError}</p>}

            <div className="flex gap-2 pt-1">
              <button onClick={closeDeleteTech} disabled={deletingTech} className="btn-secondary flex-1 justify-center">Cancel</button>
              <button
                onClick={handleDeleteTech}
                disabled={deletingTech}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-sans font-semibold transition-colors disabled:opacity-50"
              >
                {deletingTech
                  ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <><Trash2 className="w-3.5 h-3.5" /> Delete</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reset Password modal ── */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="card w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
                  <KeyRound className="w-4 h-4 text-amber-600" />
                </div>
                <h2 className="font-sans font-bold text-gray-900">Reset Password</h2>
              </div>
              <button onClick={closeReset} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors" aria-label="Cancel">
                <X className="w-4 h-4" />
              </button>
            </div>

            {!tempPassword ? (
              <>
                <p className="text-sm font-body text-gray-600 leading-relaxed">
                  Generate a temporary password for{' '}
                  <span className="font-semibold font-mono text-gray-900">{resetTarget.username}</span>.
                  They will be required to change it on next login.
                </p>
                {resetError && <p className="text-xs text-red-500 font-sans">{resetError}</p>}
                <div className="flex gap-2 pt-1">
                  <button onClick={closeReset} disabled={resetting} className="btn-secondary flex-1 justify-center">Cancel</button>
                  <button
                    onClick={handleReset}
                    disabled={resetting}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-sans font-semibold transition-colors disabled:opacity-50"
                  >
                    {resetting
                      ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <><KeyRound className="w-3.5 h-3.5" /> Generate</>
                    }
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 space-y-2">
                  <p className="text-xs font-sans font-semibold text-amber-700 uppercase tracking-wide">Temporary password — shown once</p>
                  <div className="flex items-center gap-2">
                    <span className="flex-1 font-mono text-lg font-bold text-gray-900 tracking-widest break-all">{tempPassword}</span>
                    <button
                      onClick={handleCopy}
                      className="shrink-0 p-2 rounded-lg bg-white border border-amber-200 text-amber-600 hover:bg-amber-50 transition-colors"
                      aria-label="Copy"
                    >
                      {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-xs font-body text-amber-600">Share this with {resetTarget.username} verbally. It won't be shown again.</p>
                </div>
                <button onClick={closeReset} className="btn-primary w-full justify-center">Done</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-brand-700 text-white text-sm font-sans font-semibold px-5 py-3 rounded-xl shadow-lg flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-brand-300 inline-block" /> {toast}
        </div>
      )}
    </div>
  )
}
