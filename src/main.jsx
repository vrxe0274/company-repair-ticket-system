/**
 * @file main.jsx
 * @description React application entry point.
 *
 * Responsibilities:
 *   1. Mount the React root onto #root (defined in index.html).
 *   2. Wrap the app in React.StrictMode for development-time warnings.
 *   3. Provide the router (BrowserRouter) at the outermost level so all
 *      hooks and components can access navigation context.
 *   4. Compose the global context providers in dependency order:
 *        AuthProvider         — authentication state (login/logout)
 *          RoleProvider       — role state (Admin / Technician); depends on
 *                               auth being settled before role can be trusted
 *            NotificationsProvider — realtime notifications; depends on role
 *                                    to filter by recipient_role
 *
 * Provider ordering matters: a child provider must be nested inside any
 * provider whose context it reads. Changing this order without updating the
 * corresponding hooks will cause context-not-found errors at runtime.
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import App                    from './App.jsx'
import ErrorBoundary          from './components/ui/ErrorBoundary.jsx'
import { ThemeProvider }      from './hooks/useTheme.jsx'
import { AuthProvider }       from './hooks/useAuth.jsx'
import { RoleProvider }       from './hooks/useRole.jsx'
import { NotificationsProvider } from './hooks/useNotifications.jsx'

// Global styles — Tailwind base/components/utilities + design token classes.
import './index.css'

/**
 * Resolve the #root element once at startup.
 * Throws immediately if index.html is misconfigured rather than silently
 * failing later when React tries to render.
 */
const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error(
    '[main.jsx] Could not find #root element. ' +
    'Ensure index.html contains <div id="root"></div>.'
  )
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    {/*
     * BrowserRouter must be the outermost wrapper so that all providers
     * (and any hooks they contain) can safely call useNavigate / useLocation
     * if needed in the future without restructuring this tree.
     */}
    <BrowserRouter>
      {/* ErrorBoundary catches render-time crashes; ThemeProvider sets light/dark. */}
      <ErrorBoundary>
        <ThemeProvider>
          {/* Auth → Role → Notifications — see file-level comment for ordering rationale. */}
          <AuthProvider>
            <RoleProvider>
              <NotificationsProvider>
                <App />
              </NotificationsProvider>
            </RoleProvider>
          </AuthProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>
)