import { Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useRole } from '../../hooks/useRole.jsx'

/**
 * Auth guard for dashboard routes.
 * - Unauthenticated → /login
 * - Authenticated but wrong role (when requiredRole is given) → /
 */
export default function ProtectedRoute({ children, requiredRole }) {
  const { authenticated, loading } = useAuth()
  const { role } = useRole()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!authenticated) {
    return <Navigate to="/login" replace />
  }

  if (requiredRole && role !== requiredRole) {
    return <Navigate to="/" replace />
  }

  return children
}
