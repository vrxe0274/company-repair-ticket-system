/**
 * @file AccountsPage.jsx
 * @description Admin-only page for managing individual Staff accounts.
 *
 * Admins can:
 *   - View all staff accounts (username + creation date)
 *   - Create a new staff account (username + password, requires admin password)
 *   - Delete a staff account (requires admin password)
 *
 * Non-admins are redirected by the ProtectedRoute / DashboardLayout before
 * this page renders, but we also guard here defensively via isAdmin.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { format } from 'date-fns'
import { Users, Plus, Trash2, X, Lock, Eye, EyeOff, Search } from 'lucide-react'
import { useRole } from '../../hooks/useRole.jsx'
import { supabase } from '../../lib/supabase'

// ── Helpers ────────────────────────────────────────────────────────────────────

async function callStaffManage(body) {
  const { data, error } = await supabase.functions.invoke('staff-manage', { body })
  if (error) throw new Error('Connection error. Check your network and try again.')
  if (!data?.ok) throw new Error(data?.error || 'Operation failed.')
  return data
}

// ── Page component ─────────────────────────────────────────────────────────────

export default function AccountsPage() {
  const { isAdmin } = useRole()

  const [accounts, setAccounts]   = useState([])
  const [listLoading, setListLoading] = useState(true)
  const [listError,   setListError]   = useState('')

  // Create modal state
  const [showCreate,     setShowCreate]     = useState(false)
  const [newUsername,    setNewUsername]    = useState('')
  const [newPassword,    setNewPassword]    = useState('')
  const [newPwConfirm,   setNewPwConfirm]   = useState('')
  const [createAdminPw,  setCreateAdminPw]  = useState('')
  const [showCreatePw,   setShowCreatePw]   = useState(false)
  const [showCreateAdmin, setShowCreateAdmin] = useState(false)
  const [creating,       setCreating]       = useState(false)
  const [createError,    setCreateError]    = useState('')

  // Delete modal state
  const [deleteTarget,   setDeleteTarget]   = useState(null) // username string
  const [deleteAdminPw,  setDeleteAdminPw]  = useState('')
  const [showDeleteAdmin, setShowDeleteAdmin] = useState(false)
  const [deleting,       setDeleting]       = useState(false)
  const [deleteError,    setDeleteError]    = useState('')

  // Search
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return accounts
    return accounts.filter(acc =>
      acc.username.toLowerCase().includes(q) ||
      (acc.name ?? '').toLowerCase().includes(q)
    )
  }, [accounts, query])

  // Toast
  const [toast, setToast] = useState('')

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  const loadAccounts = useCallback(async () => {
    setListLoading(true)
    setListError('')
    try {
      const { data, error } = await supabase.functions.invoke('staff-manage', {
        body: { action: 'list' },
      })
      if (error || !data?.ok) throw new Error(data?.error || 'Failed to load accounts.')
      setAccounts(data.accounts ?? [])
    } catch (err) {
      setListError(err.message)
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => { loadAccounts() }, [loadAccounts])

  // ── Create ──────────────────────────────────────────────────────────────────

  function openCreate() {
    setNewUsername(''); setNewPassword(''); setNewPwConfirm('')
    setCreateAdminPw(''); setCreateError('')
    setShowCreatePw(false); setShowCreateAdmin(false)
    setShowCreate(true)
  }

  function closeCreate() {
    setShowCreate(false)
  }

  async function handleCreate() {
    if (!newUsername.trim())                  { setCreateError('Username is required.'); return }
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(newUsername.trim())) {
      setCreateError('Username: 3–30 chars, letters, digits, underscores only.')
      return
    }
    if (newPassword.length < 8)              { setCreateError('Password must be at least 8 characters.'); return }
    if (newPassword !== newPwConfirm)        { setCreateError('Passwords do not match.'); return }
    if (!createAdminPw)                      { setCreateError('Admin password is required.'); return }

    setCreating(true); setCreateError('')
    try {
      await callStaffManage({
        action:        'create',
        adminPassword: createAdminPw,
        username:      newUsername.trim().toLowerCase(),
        password:      newPassword,
      })
      closeCreate()
      showToast(`Account "${newUsername.trim().toLowerCase()}" created.`)
      loadAccounts()
    } catch (err) {
      setCreateError(err.message)
    } finally {
      setCreating(false)
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  function openDelete(username) {
    setDeleteTarget(username)
    setDeleteAdminPw(''); setDeleteError('')
    setShowDeleteAdmin(false)
  }

  function closeDelete() {
    setDeleteTarget(null)
    setDeleteAdminPw(''); setDeleteError('')
  }

  async function handleDelete() {
    if (!deleteAdminPw) { setDeleteError('Admin password is required.'); return }

    setDeleting(true); setDeleteError('')
    try {
      await callStaffManage({
        action:        'delete',
        adminPassword: deleteAdminPw,
        username:      deleteTarget,
      })
      closeDelete()
      showToast(`Account "${deleteTarget}" deleted.`)
      loadAccounts()
    } catch (err) {
      setDeleteError(err.message)
    } finally {
      setDeleting(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!isAdmin) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center text-gray-400 font-body text-sm">
        Admin access required.
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="-mx-5 -mt-5 lg:-mx-7 lg:-mt-7 bg-white border-b border-gray-200 mb-1">
        <div className="h-1 bg-gradient-to-r from-brand-500 to-accent-500" />
        <div className="px-5 lg:px-7 py-5 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-sans font-semibold tracking-[0.14em] text-brand-600 uppercase mb-2 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500 inline-block" />Admin
            </p>
            <h1 className="font-display text-4xl sm:text-5xl tracking-wide text-gray-900 leading-none">ACCOUNTS</h1>
            {!listLoading && (
              <p className="text-sm font-body text-gray-400 mt-2">
                {accounts.length === 0
                  ? 'No staff accounts'
                  : `${accounts.length} staff account${accounts.length !== 1 ? 's' : ''}`}
              </p>
            )}
          </div>
          <button onClick={openCreate} className="btn-primary text-sm shrink-0">
            <Plus className="w-4 h-4" /> Add Account
          </button>
        </div>
      </div>

      <div className="card overflow-hidden max-w-2xl mx-auto w-full">

        {/* Search */}
        <div className="px-5 py-3 border-b border-gray-100">
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

          {listLoading && (
            <div className="flex items-center justify-center py-14">
              <span className="w-6 h-6 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {listError && !listLoading && (
            <p className="text-sm text-red-500 font-body py-8 text-center px-5">{listError}</p>
          )}

          {!listLoading && !listError && accounts.length === 0 && (
            <div className="text-center py-14 px-5">
              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <Users className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-sm font-sans font-semibold text-gray-700">No staff accounts yet</p>
              <p className="text-xs font-body text-gray-400 mt-1">Add the first one using the button above.</p>
            </div>
          )}

          {!listLoading && !listError && accounts.length > 0 && filtered.length === 0 && (
            <div className="text-center py-14 px-5">
              <p className="text-sm font-sans font-semibold text-gray-700">No results for "{query}"</p>
              <p className="text-xs font-body text-gray-400 mt-1">Try a different name or username.</p>
            </div>
          )}

          {!listLoading && !listError && filtered.length > 0 && (
            <ul className="divide-y divide-gray-100">
              {filtered.map(acc => (
                <li
                  key={acc.id}
                  className="group flex items-center gap-4 px-5 py-4 hover:bg-gray-50/70 transition-colors"
                >
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                    <span className="text-sm font-sans font-bold text-emerald-700 uppercase leading-none">
                      {(acc.name ?? acc.username).charAt(0)}
                    </span>
                  </div>

                  {/* Identity */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-sans font-semibold text-gray-900 truncate">
                        {acc.name ?? acc.username}
                      </p>
                      {!acc.name && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-[10px] font-sans font-semibold text-amber-700 leading-none shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                          Setup pending
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-mono text-gray-400 mt-0.5 truncate">{acc.username}</p>
                  </div>

                  {/* Date — hidden on very small screens */}
                  <p className="hidden sm:block text-xs font-body text-gray-400 shrink-0 tabular-nums">
                    {format(new Date(acc.created_at), 'MMM d, yyyy')}
                  </p>

                  {/* Delete */}
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

      {/* ── Create account modal ── */}
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
              {/* Username */}
              <div className="space-y-1.5">
                <label className="text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide">Username</label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={e => { setNewUsername(e.target.value); setCreateError('') }}
                  className="input-field font-mono"
                  placeholder="e.g. juan_dela_cruz"
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                />
                <p className="text-xs font-body text-gray-400">3–30 chars · letters (A–Z, a–z), digits, underscore</p>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide">Password</label>
                <div className="relative">
                  <input
                    type={showCreatePw ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => { setNewPassword(e.target.value); setCreateError('') }}
                    className="input-field pr-9"
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                  />
                  <button type="button" onClick={() => setShowCreatePw(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={showCreatePw ? 'Hide' : 'Show'}
                  >
                    {showCreatePw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm password */}
              <div className="space-y-1.5">
                <label className="text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide">Confirm Password</label>
                <input
                  type="password"
                  value={newPwConfirm}
                  onChange={e => { setNewPwConfirm(e.target.value); setCreateError('') }}
                  className="input-field"
                  placeholder="Repeat password"
                  autoComplete="new-password"
                />
              </div>

              {/* Admin password gate */}
              <div className="space-y-1.5 pt-1 border-t border-gray-100">
                <label className="text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide">
                  Your Admin Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input
                    type={showCreateAdmin ? 'text' : 'password'}
                    value={createAdminPw}
                    onChange={e => { setCreateAdminPw(e.target.value); setCreateError('') }}
                    onKeyDown={e => { if (e.key === 'Enter' && !creating) handleCreate() }}
                    className="input-field pl-9 pr-9"
                    placeholder="Confirm with your password"
                    autoComplete="current-password"
                  />
                  <button type="button" onClick={() => setShowCreateAdmin(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={showCreateAdmin ? 'Hide' : 'Show'}
                  >
                    {showCreateAdmin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {createError && <p className="text-xs text-red-500 font-sans">{createError}</p>}
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={closeCreate} disabled={creating} className="btn-secondary flex-1 justify-center">Cancel</button>
              <button
                onClick={handleCreate}
                disabled={creating || !newUsername.trim() || !newPassword || !newPwConfirm || !createAdminPw}
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

      {/* ── Delete confirmation modal ── */}
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

            <div className="space-y-1.5">
              <label className="text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide">
                Your Admin Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type={showDeleteAdmin ? 'text' : 'password'}
                  value={deleteAdminPw}
                  onChange={e => { setDeleteAdminPw(e.target.value); setDeleteError('') }}
                  onKeyDown={e => { if (e.key === 'Enter' && deleteAdminPw && !deleting) handleDelete() }}
                  className="input-field pl-9 pr-9"
                  placeholder="Confirm with your password"
                  autoFocus
                  autoComplete="current-password"
                />
                <button type="button" onClick={() => setShowDeleteAdmin(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label={showDeleteAdmin ? 'Hide' : 'Show'}
                >
                  {showDeleteAdmin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {deleteError && <p className="text-xs text-red-500 font-sans">{deleteError}</p>}
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={closeDelete} disabled={deleting} className="btn-secondary flex-1 justify-center">Cancel</button>
              <button
                onClick={handleDelete}
                disabled={deleting || !deleteAdminPw}
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

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-brand-700 text-white text-sm font-sans font-semibold px-5 py-3 rounded-xl shadow-lg flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-brand-300 inline-block" /> {toast}
        </div>
      )}
    </div>
  )
}
