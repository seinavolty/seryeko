import React from 'react'
import { Loader2 } from 'lucide-react'

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-muted gap-2">
      <Loader2 size={20} className="animate-spin text-accent" />
      <span className="text-xs font-outlier">{label}</span>
    </div>
  )
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="text-center py-10">
      <p className="text-sm text-error mb-3">{message || 'Something went wrong.'}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="px-4 py-2 text-xs font-display font-bold bg-paper-3 border border-rule rounded-pill text-ink"
        >
          Try again
        </button>
      )}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, hint }) {
  return (
    <div className="text-center py-12 text-muted">
      {Icon && <Icon size={28} className="mx-auto mb-3 opacity-50" />}
      <p className="text-sm font-display font-bold text-neutral2">{title}</p>
      {hint && <p className="text-xs mt-1">{hint}</p>}
    </div>
  )
}

export function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-shrink-0 px-3 py-1.5 rounded-pill text-xs font-display font-bold whitespace-nowrap transition-colors ${
        active ? 'bg-accent text-black' : 'bg-paper-2 text-neutral2 border border-rule'
      }`}
    >
      {children}
    </button>
  )
}

export function StatusBadge({ status }) {
  const styles = {
    active: 'bg-success/15 text-success border-success/30',
    pending: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    approved: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
    paid: 'bg-success/15 text-success border-success/30',
    sent: 'bg-success/15 text-success border-success/30',
    rejected: 'bg-error/15 text-error border-error/30',
    cancelled: 'bg-error/15 text-error border-error/30',
    refunded: 'bg-error/15 text-error border-error/30',
    trial: 'bg-paper-3 text-muted border-rule',
  }
  return (
    <span className={`text-[10px] font-outlier font-bold uppercase px-2 py-0.5 rounded-pill border ${styles[status] || 'bg-paper-3 text-muted border-rule'}`}>
      {status}
    </span>
  )
}

export function SaveToast({ message }) {
  if (!message) return null
  return (
    <div className="bg-success/15 border border-success/40 text-success text-xs p-2.5 rounded-md mb-4 text-center animate-fade-in">
      {message}
    </div>
  )
}

function asUtcDate(iso) {
  if (iso instanceof Date) return iso
  if (typeof iso !== 'string') return new Date(iso)
  // Backend stores naive UTC; treat missing offset as UTC so GMT+8 display is correct.
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso)) return new Date(`${iso}Z`)
  return new Date(iso)
}

export function fmtDate(iso) {
  if (!iso) return '—'
  try {
    return asUtcDate(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'Asia/Manila',
    })
  } catch {
    return '—'
  }
}

export function fmtDateTime(iso) {
  if (!iso) return '—'
  try {
    return asUtcDate(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'Asia/Manila',
    })
  } catch {
    return '—'
  }
}

export function fmtPhp(n) {
  if (n === null || n === undefined) return '—'
  return `₱${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}
