import React from 'react'
import { Lock } from 'lucide-react'

export default function EpisodeStrip({ episodes = [], activeIndex = 0, onSelect }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
      {episodes.map((ep, idx) => (
        <button
          key={ep.id}
          onClick={() => onSelect(idx)}
          className={`flex-shrink-0 w-16 h-12 rounded-md flex flex-col items-center justify-center border transition-all font-display ${
            activeIndex === idx
              ? 'bg-accent border-accent text-black font-extrabold'
              : ep.is_locked
              ? 'bg-paper-3 border-rule text-muted'
              : 'bg-paper-3 border-rule text-neutral2'
          }`}
        >
          <span className="text-xs">EP {ep.episode_num}</span>
          {ep.is_locked ? (
            <Lock size={11} className="mt-0.5 text-muted" />
          ) : (
            <span className="text-[9px] font-outlier opacity-80">FREE</span>
          )}
        </button>
      ))}
    </div>
  )
}
