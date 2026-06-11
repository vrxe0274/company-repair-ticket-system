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
 * All route components are loaded eagerly. If the bundle grows, convert the
 * dashboard imports to React.lazy() + <Suspense> here without touching the
 * route definitions themselves.
 */

import { Routes, Route, Navigate } from 'react-router-dom'

// ── Public pages ──────────────────────────────────────────────────────────────
import SubmitTicketPage   from './pages/SubmitTicketPage.jsx'
import TrackTicketPage    from './pages/TrackTicketPage.jsx'
import LoginPage          from './pages/LoginPage.jsx'

// ── Protected dashboard pages ─────────────────────────────────────────────────
import DashboardLayout    from './pages/dashboard/DashboardLayout.jsx'
import DashboardHome      from './pages/dashboard/DashboardHome.jsx'
import TasksPage          from './pages/dashboard/TasksPage.jsx'
import TicketListPage     from './pages/dashboard/TicketListPage.jsx'
import TicketDetailPage   from './pages/dashboard/TicketDetailPage.jsx'
import NotificationsPage  from './pages/dashboard/NotificationsPage.jsx'

// ── Auth guard ────────────────────────────────────────────────────────────────
import ProtectedRoute     from './components/ui/ProtectedRoute.jsx'

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
       */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index                   element={<DashboardHome />} />
        <Route path="tasks"            element={<TasksPage />} />
        <Route path="tickets"          element={<TicketListPage />} />
        <Route path="tickets/:id"      element={<TicketDetailPage />} />
        <Route path="notifications"    element={<NotificationsPage />} />
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