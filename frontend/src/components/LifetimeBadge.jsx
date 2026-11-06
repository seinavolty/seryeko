import React from 'react'
import { Sparkles } from 'lucide-react'

export default function LifetimeBadge({ isLifetime, episodesWatched = 0, freeLimit = 3, size = 'sm' }) {
  const sizeClasses = size === 'sm' ? 'text-[10px] px-2.5 py-0.5' : 'text-xs px-3 py-1'

  if (isLifetime) {
    return (
      <span className={`bg-success/20 text-success border border-success/40 font-bold uppercase rounded-pill font-outlier inline-flex items-center gap-1 ${sizeClasses}`}>
        <Sparkles size={11} /> Lifetime Member
      </span>
    )
  }

  return (
    <span className={`bg-amber-500/20 text-amber-400 border border-amber-500/30 font-bold uppercase rounded-pill font-outlier inline-flex items-center gap-1 ${sizeClasses}`}>
      Free Trial · {episodesWatched}/{freeLimit}
    </span>
  )
}
