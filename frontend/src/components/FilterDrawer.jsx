import React, { useState } from 'react'
import { X, SlidersHorizontal } from 'lucide-react'

const GENRES = ['Romance', 'Action', 'Comedy', 'Thriller', 'Fantasy', 'Family', 'Revenge', 'CEO']
const COUNTRIES = [
  { id: 'KR', label: 'Korea' },
  { id: 'CN', label: 'China' },
  { id: 'TH', label: 'Thailand' },
  { id: 'JP', label: 'Japan' },
]
const STATUSES = [
  { id: 'completed', label: 'Completed' },
  { id: 'ongoing', label: 'Ongoing' },
]

export default function FilterDrawer({ open, onClose, filters, onApply }) {
  const [local, setLocal] = useState(filters)

  if (!open) return null

  const toggle = (key, value) => {
    setLocal((prev) => ({ ...prev, [key]: prev[key] === value ? null : value }))
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center animate-fade-in">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-paper-2 w-full max-w-lg rounded-t-xl border-t border-rule max-h-[min(85dvh,calc(100dvh-4.5rem))] flex flex-col animate-slide-up">
        <div className="px-5 pt-5 pb-2 flex-shrink-0">
          <div className="w-10 h-1 bg-rule rounded-pill mx-auto mb-4" />
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-display font-bold text-lg flex items-center gap-2">
              <SlidersHorizontal size={16} className="text-accent" /> Filters
            </h3>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-paper-3 flex items-center justify-center">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="px-5 overflow-y-auto flex-1 min-h-0">
          <div className="mb-5">
            <div className="text-xs font-bold text-neutral2 font-outlier uppercase mb-2">Genre</div>
            <div className="flex flex-wrap gap-2">
              {GENRES.map((g) => (
                <button
                  key={g}
                  onClick={() => toggle('genre', g)}
                  className={`px-3 py-1.5 rounded-pill text-xs font-semibold ${
                    local.genre === g ? 'bg-accent text-black' : 'bg-paper-3 text-neutral2'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-5">
            <div className="text-xs font-bold text-neutral2 font-outlier uppercase mb-2">Country</div>
            <div className="flex flex-wrap gap-2">
              {COUNTRIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => toggle('country', c.id)}
                  className={`px-3 py-1.5 rounded-pill text-xs font-semibold ${
                    local.country === c.id ? 'bg-accent text-black' : 'bg-paper-3 text-neutral2'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <div className="text-xs font-bold text-neutral2 font-outlier uppercase mb-2">Status</div>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => toggle('status', s.id)}
                  className={`px-3 py-1.5 rounded-pill text-xs font-semibold ${
                    local.status === s.id ? 'bg-accent text-black' : 'bg-paper-3 text-neutral2'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] border-t border-rule flex-shrink-0 bg-paper-2">
          <button
            onClick={() => { setLocal({}); onApply({}); }}
            className="flex-1 py-3 rounded-pill border border-rule text-xs font-bold text-neutral2"
          >
            Reset
          </button>
          <button
            onClick={() => onApply(local)}
            className="flex-1 py-3 rounded-pill bg-accent text-black text-xs font-display font-extrabold"
          >
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  )
}
