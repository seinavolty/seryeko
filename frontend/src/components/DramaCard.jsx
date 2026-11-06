import React from 'react'
import { Link } from 'react-router-dom'
import { Play } from 'lucide-react'
import LazyImage from './LazyImage'

export default function DramaCard({ drama, variant = 'grid' }) {
  if (!drama) return null

  if (variant === 'row') {
    return (
      <Link
        to={`/drama/${drama.id}`}
        className="flex-shrink-0 w-32 bg-paper-2 border border-rule rounded-lg overflow-hidden flex flex-col group hover:border-accent/50 transition-all"
      >
        <div className="relative aspect-[3/4] overflow-hidden bg-paper-3">
          <LazyImage
            src={drama.cover}
            alt={drama.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          {drama.badge && (
            <div className="absolute top-1.5 left-1.5 bg-accent text-black font-bold text-[9px] uppercase px-1.5 py-0.5 rounded-pill">
              {drama.badge}
            </div>
          )}
        </div>
        <div className="p-2">
          <h4 className="font-display font-bold text-[11px] text-ink line-clamp-1">{drama.title}</h4>
          <p className="text-[10px] text-muted font-outlier">{drama.episodes} eps</p>
        </div>
      </Link>
    )
  }

  return (
    <Link
      to={`/drama/${drama.id}`}
      className="bg-paper-2 border border-rule rounded-xl overflow-hidden flex flex-col group hover:border-accent/50 transition-all"
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-paper-3">
        <LazyImage
          src={drama.cover}
          alt={drama.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        {drama.badge && (
          <div className="absolute top-2 left-2 bg-accent text-black font-bold text-[9px] uppercase px-1.5 py-0.5 rounded-pill">
            {drama.badge}
          </div>
        )}
        <div className="absolute bottom-1 right-2 text-[10px] text-white/90 bg-black/60 px-1.5 py-0.5 rounded font-outlier">
          {drama.episodes} eps
        </div>
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
          <div className="w-9 h-9 rounded-full bg-ink/90 flex items-center justify-center">
            <Play size={14} className="text-paper" fill="currentColor" />
          </div>
        </div>
      </div>
      <div className="p-2.5 flex-1 flex flex-col justify-between">
        <div>
          <h4 className="font-display font-bold text-xs text-ink line-clamp-1 mb-1">{drama.title}</h4>
          <p className="text-[10px] text-muted line-clamp-2">{drama.summary}</p>
        </div>
        <div className="mt-2 pt-2 border-t border-rule flex items-center justify-between text-[10px] text-muted">
          <span className="capitalize">{drama.provider}</span>
          <span className="text-success font-semibold">Free 3 Eps</span>
        </div>
      </div>
    </Link>
  )
}
