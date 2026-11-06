import React from 'react'
import { Link } from 'react-router-dom'
import { Lock, CheckCircle2 } from 'lucide-react'

export default function PaywallSheet({ open, onClose, freeEpisodes = 3 }) {
  if (!open) return null

  const count = Number(freeEpisodes) > 0 ? Number(freeEpisodes) : 3

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end justify-center animate-fade-in">
      <div className="bg-paper-2 w-full max-w-lg rounded-t-xl border-t border-accent/40 p-6 flex flex-col animate-slide-up">
        <div className="w-12 h-1 bg-rule rounded-pill mx-auto mb-4" />
        <div className="text-center mb-5">
          <div className="w-12 h-12 rounded-full bg-accent/10 text-accent flex items-center justify-center mx-auto mb-3">
            <Lock size={24} />
          </div>
          <h3 className="font-display font-black text-xl mb-1 text-ink">
            You&apos;ve Finished Your {count} Free Episode{count === 1 ? '' : 's'}!
          </h3>
          <p className="text-xs text-muted max-w-xs mx-auto">
            Ready to watch the rest of this drama and 40+ providers? Get permanent lifetime access.
          </p>
        </div>

        <div className="bg-paper rounded-lg p-4 border border-rule mb-5 space-y-2">
          <div className="flex items-center gap-2 text-xs text-neutral2">
            <CheckCircle2 size={16} className="text-success" />
            <span>Unlimited episodes across 40+ providers</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-neutral2">
            <CheckCircle2 size={16} className="text-success" />
            <span>One-time payment · No monthly recurring fees</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-neutral2">
            <CheckCircle2 size={16} className="text-success" />
            <span>Pay with QR Ph via PayMongo (any bank or e-wallet)</span>
          </div>
        </div>

        <div className="space-y-2">
          <Link
            to="/upgrade"
            className="w-full block text-center py-3.5 bg-accent text-black font-display font-extrabold text-sm rounded-pill shadow-lg"
          >
            Unlock Lifetime Access Now →
          </Link>
          <button
            onClick={onClose}
            className="w-full py-2.5 text-xs text-muted hover:text-ink"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  )
}
