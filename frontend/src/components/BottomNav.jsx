import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Home, Compass, Search, Bookmark, User } from 'lucide-react'

export default function BottomNav() {
  const location = useLocation()
  const navItems = [
    { to: '/home', label: 'Home', icon: Home },
    { to: '/browse', label: 'Browse', icon: Compass },
    { to: '/search', label: 'Search', icon: Search },
    { to: '/profile?tab=watchlist', label: 'Watchlist', icon: Bookmark, match: '/profile' },
    { to: '/profile', label: 'Profile', icon: User },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-paper-3/90 backdrop-blur-md border-t border-rule px-4 py-2 flex justify-around items-center max-w-lg mx-auto">
      {navItems.map((item) => {
        const Icon = item.icon
        return (
          <NavLink
            key={item.label}
            to={item.to}
            className={({ isActive }) => {
              const active = item.match ? location.pathname.startsWith(item.match) : isActive
              return `flex flex-col items-center gap-1 py-1 px-3 text-xs transition-colors font-display ${
                active ? 'text-accent font-semibold' : 'text-neutral2 hover:text-ink'
              }`
            }}
          >
            <Icon size={18} />
            <span>{item.label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}
