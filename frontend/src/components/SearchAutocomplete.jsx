import React from 'react'
import { Clock, X, TrendingUp } from 'lucide-react'
import LazyImage from './LazyImage'

export default function SearchAutocomplete({ recent, onSelectRecent, onClearRecent, suggestions, onSelectSuggestion }) {
  return (
    <div className="px-4">
      {suggestions && suggestions.length > 0 && (
        <div className="mb-4 bg-paper-2 border border-rule rounded-md overflow-hidden">
          {suggestions.map((s) => (
            <button
              key={s.id}
              onClick={() => onSelectSuggestion(s)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-paper-3 border-b border-rule last:border-b-0"
            >
              <LazyImage src={s.cover} alt="" className="w-8 h-10 object-cover rounded-sm flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-ink line-clamp-1">{s.title}</div>
                <div className="text-[10px] text-muted capitalize">{s.provider}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {recent && recent.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-neutral2 font-outlier uppercase flex items-center gap-1.5">
              <Clock size={12} /> Recent Searches
            </span>
            <button onClick={onClearRecent} className="text-[11px] text-muted hover:text-ink">
              Clear
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {recent.map((r, i) => (
              <button
                key={i}
                onClick={() => onSelectRecent(r)}
                className="px-3 py-1.5 bg-paper-3 rounded-pill text-xs text-neutral2 flex items-center gap-1.5"
              >
                {r} <X size={10} />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-1.5 text-xs font-bold text-neutral2 font-outlier uppercase mb-2">
        <TrendingUp size={12} className="text-accent" /> Trending Searches
      </div>
    </div>
  )
}
