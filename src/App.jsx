// src/App.jsx
import { Routes, Route, Navigate } from 'react-router-dom'
import SubmitTicketPage from './pages/SubmitTicketPage.jsx'
import TrackTicketPage from './pages/TrackTicketPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import DashboardLayout from './pages/dashboard/DashboardLayout.jsx'
import DashboardHome from './pages/dashboard/DashboardHome.jsx'
import TicketListPage from './pages/dashboard/TicketListPage.jsx'
import TicketDetailPage from './pages/dashboard/TicketDetailPage.jsx'
import NotificationsPage from './pages/dashboard/NotificationsPage.jsx'
import ProtectedRoute from './components/ui/ProtectedRoute.jsx'

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/submit" element={<SubmitTicketPage />} />
      <Route path="/track/:token" element={<TrackTicketPage />} />
      <Route path="/login" element={<LoginPage />} />

      {/* Protected dashboard — now the root */}
      <Route path="/" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
        <Route index element={<DashboardHome />} />
        <Route path="tickets" element={<TicketListPage />} />
        <Route path="tickets/:id" element={<TicketDetailPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}