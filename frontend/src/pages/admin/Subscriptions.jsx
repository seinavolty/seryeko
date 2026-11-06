import React, { useEffect, useState } from 'react'
import { Search, Users, Gift, Ban, RotateCw } from 'lucide-react'
import { fetchAdminSubscribers, updateAdminSubscriber } from '../../api/client'
import { Loading, ErrorState, EmptyState, Chip, StatusBadge, fmtDate, fmtPhp, SaveToast } from './shared'

const STATUS_FILTERS = [
  { id: '', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'trial', label: 'Trial' },
  { id: 'cancelled', label: 'Cancelled' },
]

export default function Subscriptions() {
  const [subs, setSubs] = useState(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [saved, setSaved] = useState('')

  const load = () => {
    setError('')
    fetchAdminSubscribers({ q, status: status || undefined })
      .then((res) => setSubs(res.subscribers))
      .catch(() => setError('Could not load subscribers.'))
  }

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status])

  const handleAction = async (id, action) => {
    setBusyId(id)
    try {
      await updateAdminSubscriber(id, action)
      setSaved(`Subscriber ${action === 'grant' ? 'granted lifetime access' : action === 'deactivate' ? 'deactivated' : 'reactivated'}.`)
      setTimeout(() => setSaved(''), 2500)
      load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Action failed.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="pb-10">
      <h1 className="font-display font-black text-xl mb-4">Subscribers</h1>

      <SaveToast message={saved} />

      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by email…"
          className="w-full pl-9 pr-4 py-3 rounded-md bg-paper-2 border border-rule text-sm text-ink focus:border-accent outline-none"
        />
      </div>

      <div className="flex gap-1.5 mb-4 overflow-x-auto no-scrollbar">
        {STATUS_FILTERS.map((f) => (
          <Chip key={f.id} active={status === f.id} onClick={() => setStatus(f.id)}>{f.label}</Chip>
        ))}
      </div>

      {error && <ErrorState message={error} onRetry={load} />}
      {!error && !subs && <Loading label="Loading subscribers…" />}
      {!error && subs && subs.length === 0 && (
        <EmptyState icon={Users} title="No subscribers found" hint="Try a different search or filter." />
      )}

      {!error && subs && subs.length > 0 && (
        <div className="space-y-2">
          {subs.map((s) => (
            <div key={s.id} className="bg-paper-2 border border-rule rounded-lg p-3.5">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-ink truncate">{s.user_email}</div>
                  <div className="text-[11px] text-muted capitalize">{s.plan} plan</div>
                </div>
                <StatusBadge status={s.status} />
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] text-muted mb-3">
                <div>Paid: <span className="text-ink font-medium">{fmtPhp(s.amount_php)}</span></div>
                <div>Episodes: <span className="text-ink font-medium">{s.episodes_watched ?? 0}</span></div>
                <div>Activated: <span className="text-ink font-medium">{fmtDate(s.activated_at)}</span></div>
                <div>Joined: <span className="text-ink font-medium">{fmtDate(s.created_at)}</span></div>
                {s.referral_code_used && (
                  <div className="col-span-2">Referral: <span className="text-accent font-medium">{s.referral_code_used}</span> ({fmtPhp(s.discount_php)} off)</div>
                )}
                {s.paymongo_payment_id && (
                  <div className="col-span-2 truncate">Payment ID: <span className="text-ink font-mono">{s.paymongo_payment_id}</span></div>
                )}
              </div>

              <div className="flex gap-2">
                {s.plan !== 'lifetime' && (
                  <ActionButton icon={Gift} label="Grant lifetime" disabled={busyId === s.id} onClick={() => handleAction(s.id, 'grant')} />
                )}
                {s.status === 'active' && (
                  <ActionButton icon={Ban} label="Deactivate" tone="error" disabled={busyId === s.id} onClick={() => handleAction(s.id, 'deactivate')} />
                )}
                {s.status !== 'active' && s.plan === 'lifetime' && (
                  <ActionButton icon={RotateCw} label="Reactivate" tone="success" disabled={busyId === s.id} onClick={() => handleAction(s.id, 'reactivate')} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ActionButton({ icon: Icon, label, onClick, disabled, tone }) {
  const toneClass = tone === 'error'
    ? 'border-error/40 text-error bg-error/5'
    : tone === 'success'
      ? 'border-success/40 text-success bg-success/5'
      : 'border-accent/40 text-accent bg-accent/5'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md border text-[11px] font-display font-bold disabled:opacity-50 ${toneClass}`}
    >
      <Icon size={12} /> {label}
    </button>
  )
}
