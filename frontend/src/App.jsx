import React from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import Landing from './pages/Landing'
import Home from './pages/Home'
import Browse from './pages/Browse'
import DramaDetail from './pages/DramaDetail'
import Watch from './pages/Watch'
import Search from './pages/Search'
import Upgrade from './pages/Upgrade'
import Register from './pages/Register'
import Login from './pages/Login'
import AdminShell from './pages/admin/AdminShell'
import AdminOverview from './pages/admin/Overview'
import AdminSettings from './pages/admin/Settings'
import AdminSubscriptions from './pages/admin/Subscriptions'
import AdminCancellations from './pages/admin/Cancellations'
import AdminReferrals from './pages/admin/Referrals'
import AdminProviders from './pages/admin/Providers'
import AdminCatalog from './pages/admin/Catalog'
import AdminReports from './pages/admin/Reports'
import AdminAnalytics from './pages/admin/Analytics'
import Profile from './pages/Profile'
import EditProfile from './pages/EditProfile'
import ChangePassword from './pages/ChangePassword'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import LinkedDevices from './pages/LinkedDevices'
import HelpSupport from './pages/HelpSupport'
import RequestRefund from './pages/RequestRefund'
import Withdraw from './pages/Withdraw'
import Dmca from './pages/legal/Dmca'
import Privacy from './pages/legal/Privacy'
import RefundPolicy from './pages/legal/RefundPolicy'
import Terms from './pages/legal/Terms'
import BottomNav from './components/BottomNav'
import RequireAuth from './components/RequireAuth'
import RequireAdmin from './components/RequireAdmin'

// Routes that render their own full-bleed layout (no shared bottom nav)
const NO_NAV_ROUTES = [
  '/', '/login', '/register', '/upgrade', '/forgot-password', '/reset-password',
  '/dmca', '/privacy', '/refund-policy', '/terms',
]
const isWatchRoute = (pathname) => pathname.startsWith('/watch/')
const isAdminRoute = (pathname) => pathname.startsWith('/admin')

function Shell({ children }) {
  const location = useLocation()
  const showNav = !NO_NAV_ROUTES.includes(location.pathname) && !isWatchRoute(location.pathname) && !isAdminRoute(location.pathname)

  return (
    <div className="bg-paper min-h-screen text-ink relative">
      {children}
      {showNav && <BottomNav />}
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/home" element={<Home />} />
          <Route path="/browse" element={<Browse />} />
          <Route path="/drama/:dramaId" element={<DramaDetail />} />
          <Route path="/search" element={<Search />} />
          <Route path="/watch/:dramaId" element={<RequireAuth><Watch /></RequireAuth>} />
          <Route path="/upgrade" element={<Upgrade />} />
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/dmca" element={<Dmca />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/refund-policy" element={<RefundPolicy />} />
          <Route path="/terms" element={<Terms />} />
          <Route
            path="/admin"
            element={(
              <RequireAdmin>
                <AdminShell />
              </RequireAdmin>
            )}
          >
            <Route index element={<AdminOverview />} />
            <Route path="subscriptions" element={<AdminSubscriptions />} />
            <Route path="cancellations" element={<AdminCancellations />} />
            <Route path="referrals" element={<AdminReferrals />} />
            <Route path="providers" element={<AdminProviders />} />
            <Route path="catalog" element={<AdminCatalog />} />
            <Route path="reports" element={<AdminReports />} />
            <Route path="analytics" element={<AdminAnalytics />} />
            <Route path="settings" element={<AdminSettings />} />
          </Route>
          <Route path="/profile" element={<Profile />} />
          <Route path="/profile/edit" element={<RequireAuth><EditProfile /></RequireAuth>} />
          <Route path="/profile/password" element={<RequireAuth><ChangePassword /></RequireAuth>} />
          <Route path="/profile/devices" element={<RequireAuth><LinkedDevices /></RequireAuth>} />
          <Route path="/help" element={<HelpSupport />} />
          <Route path="/refund" element={<RequireAuth><RequestRefund /></RequireAuth>} />
          <Route path="/withdraw" element={<RequireAuth><Withdraw /></RequireAuth>} />
        </Routes>
      </Shell>
    </BrowserRouter>
  )
}
