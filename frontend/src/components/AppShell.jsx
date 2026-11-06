import React from 'react'

export default function AppShell({ title, right, children, noHeader = false }) {
  return (
    <div className="pb-24 max-w-lg mx-auto min-h-screen">
      {!noHeader && (
        <header className="sticky top-0 z-40 bg-paper/80 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-rule">
          <div className="flex items-center gap-2">
            {title ? (
              <div className="w-2.5 h-2.5 rounded-full bg-accent" />
            ) : (
              <img src="/logo.png" alt="SeryeKo" className="w-6 h-6 rounded-full object-cover" />
            )}
            <h1 className="font-display font-black text-xl tracking-tight text-ink">
              {title || 'SeryeKo'}
            </h1>
          </div>
          {right && <div className="flex items-center gap-2">{right}</div>}
        </header>
      )}
      {children}
    </div>
  )
}
