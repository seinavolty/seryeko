import React from 'react'
import { NavLink, Outlet, Link } from 'react-router-dom'
import {
  LayoutGrid, Users, RotateCcw, Share2, Radio, LibraryBig, Flag, BarChart3, SlidersHorizontal, ArrowLeft,
} from 'lucide-react'

const SECTIONS = [
  { to: '/admin', label: 'Overview', icon: LayoutGrid, end: true },
  { to: '/admin/subscriptions', label: 'Subscribers', icon: Users },
  { to: '/admin/cancellations', label: 'Cancellations', icon: RotateCcw },
  { to: '/admin/referrals', label: 'Referrals', icon: Share2 },
  { to: '/admin/providers', label: 'Providers', icon: Radio },
  { to: '/admin/catalog', label: 'Catalog', icon: LibraryBig },
  { to: '/admin/reports', label: 'Reports', icon: Flag },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/admin/settings', label: 'Settings', icon: SlidersHorizontal },
]

export default function AdminShell() {
  return (
    <div className="min-h-screen bg-paper text-ink pb-16">
      {/* Sticky top brand */}
      <header className="sticky top-0 z-30 bg-paper/95 backdrop-blur-md border-b border-rule">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link to="/profile" className="w-8 h-8 rounded-full bg-paper-3 flex items-center justify-center text-neutral2 flex-shrink-0" aria-label="Back to profile">
              <ArrowLeft size={15} />
            </Link>
            <div>
              <div className="font-display font-black text-sm leading-tight flex items-center gap-1.5">
                <img src="/logo.png" alt="SeryeKo" className="w-4 h-4 rounded-full object-cover" /> SeryeKo
              </div>
              <div className="text-[10px] text-muted font-outlier uppercase tracking-wide -mt-0.5">Command Centre</div>
            </div>
          </div>
          <span className="text-[10px] bg-error/20 text-error border border-error/30 px-2 py-0.5 rounded-pill font-outlier font-bold flex-shrink-0">
            ADMIN
          </span>
        </div>

        {/* Horizontal section chips */}
        <nav className="max-w-lg mx-auto px-4 pb-2.5 flex gap-1.5 overflow-x-auto no-scrollbar">
          {SECTIONS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-xs font-display font-bold whitespace-nowrap transition-colors ${
                  isActive ? 'bg-accent text-black' : 'bg-paper-2 text-neutral2 border border-rule'
                }`
              }
            >
              <Icon size={12} /> {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="max-w-lg mx-auto px-4 pt-5 animate-fade-in">
        <Outlet />
      </main>
    </div>
  )
}
