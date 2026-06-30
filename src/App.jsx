/**
 * @file App.jsx
 * @description Root route tree for the VRXE Repair Ticket System.
 *
 * Route architecture:
 *   Public  — /submit, /track/:token, /login  (no auth required)
 *   Private — / (and nested)                  (wrapped in ProtectedRoute)
 *   Fallback — * → redirects to / (works correctly whether the user is
 *              authenticated or not; ProtectedRoute handles the /login redirect)
 *
 * Dashboard pages are code-split with React.lazy() + Suspense so the initial
 * bundle only includes the public pages. Each dashboard chunk loads on first
 * navigation to that route.
 */

import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'

// ── Public pages (eagerly loaded — always needed) ─────────────────────────────
import SubmitTicketPage from './pages/SubmitTicketPage.jsx'
import TrackTicketPage  from './pages/TrackTicketPage.jsx'
import LoginPage        from './pages/LoginPage.jsx'

// ── Protected dashboard pages (lazy — only loaded when navigated to) ──────────
const DashboardLayout   = lazy(() => import('./pages/dashboard/DashboardLayout.jsx'))
const DashboardHome     = lazy(() => import('./pages/dashboard/DashboardHome.jsx'))
const TasksPage         = lazy(() => import('./pages/dashboard/TasksPage.jsx'))
const TicketListPage    = lazy(() => import('./pages/dashboard/TicketListPage.jsx'))
const TicketDetailPage  = lazy(() => import('./pages/dashboard/TicketDetailPage.jsx'))
const NotificationsPage = lazy(() => import('./pages/dashboard/NotificationsPage.jsx'))
const SettingsPage      = lazy(() => import('./pages/dashboard/SettingsPage.jsx'))
const AccountsPage      = lazy(() => import('./pages/dashboard/AccountsPage.jsx'))
const AnalyticsPage     = lazy(() => import('./pages/dashboard/AnalyticsPage.jsx'))
const EarningsPage      = lazy(() => import('./pages/dashboard/EarningsPage.jsx'))
const PayrollPage       = lazy(() => import('./pages/dashboard/PayrollPage.jsx'))
const AttendancePage    = lazy(() => import('./pages/dashboard/AttendancePage.jsx'))
const MyAttendancePage  = lazy(() => import('./pages/dashboard/MyAttendancePage.jsx'))

// ── Auth guard ────────────────────────────────────────────────────────────────
import ProtectedRoute from './components/ui/ProtectedRoute.jsx'

function DashboardSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

/**
 * App — the root component rendered by main.jsx.
 *
 * Renders a flat <Routes> tree. The protected subtree uses a layout-route
 * pattern: ProtectedRoute wraps DashboardLayout, and all dashboard pages
 * are nested children rendered via <Outlet />.
 *
 * @returns {JSX.Element}
 */
export default function App() {
  return (
    <Routes>
      {/* ── Public routes (no authentication required) ── */}
      <Route path="/submit"        element={<SubmitTicketPage />} />
      <Route path="/track/:token"  element={<TrackTicketPage />} />
      <Route path="/login"         element={<LoginPage />} />

      {/*
       * ── Protected dashboard (authentication required) ──
       *
       * Layout-route pattern: ProtectedRoute + DashboardLayout is the
       * parent shell; child routes render into DashboardLayout's <Outlet />.
       * The index route (/) renders DashboardHome by default.
       *
       * Suspense wraps the entire lazy subtree so any chunk load shows the
       * spinner rather than a blank screen.
       */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Suspense fallback={<DashboardSpinner />}>
              <DashboardLayout />
            </Suspense>
          </ProtectedRoute>
        }
      >
        <Route index                   element={<DashboardHome />} />
        <Route path="tasks"            element={<TasksPage />} />
        <Route path="tickets"          element={<TicketListPage />} />
        <Route path="tickets/:id"      element={<TicketDetailPage />} />
        <Route path="notifications"    element={<NotificationsPage />} />
        <Route path="analytics"        element={<AnalyticsPage />} />
        <Route
          path="earnings"
          element={
            <ProtectedRoute blockedRole="Admin">
              <EarningsPage />
            </ProtectedRoute>
          }
        />
        <Route path="settings"         element={<SettingsPage />} />
        <Route
          path="accounts"
          element={
            <ProtectedRoute requiredRole="Admin">
              <AccountsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="payroll"
          element={
            <ProtectedRoute requiredRole="Admin">
              <PayrollPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="attendance"
          element={
            <ProtectedRoute requiredRole="Admin">
              <AttendancePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="my-attendance"
          element={
            <ProtectedRoute blockedRole="Admin">
              <MyAttendancePage />
            </ProtectedRoute>
          }
        />
      </Route>

      {/*
       * ── Catch-all fallback ──
       *
       * Any unknown path redirects to /. If the user is unauthenticated,
       * ProtectedRoute will then redirect them to /login.
       */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
