import React, { useEffect, useState } from 'react'
import { RotateCcw, Check, X, Banknote } from 'lucide-react'
import { fetchAdminCancellations, updateAdminCancellation } from '../../api/client'
import { Loading, ErrorState, EmptyState, Chip, StatusBadge, fmtDate, fmtPhp, SaveToast } from './shared'

const FILTERS = [
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'refunded', label: 'Refunded' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'all', label: 'All' },
]

export default function Cancellations() {
  const [status, setStatus] = useState('pending')
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [saved, setSaved] = useState('')
  const [noteDraft, setNoteDraft] = useState({})

  const load = () => {
    setError('')
    fetchAdminCancellations(status)
      .then((res) => setRows(res.cancellations))
      .catch(() => setError('Could not load cancellation requests.'))
  }

  useEffect(() => { setRows(null); load() }, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAction = async (id, action) => {
    setBusyId(id)
    try {
      await updateAdminCancellation(id, action, noteDraft[id] || '')
      setSaved(
        action === 'approve' ? 'Cancellation approved — access revoked.' :
        action === 'refunded' ? 'Marked as refunded.' : 'Request rejected.'
      )
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
      <h1 className="font-display font-black text-xl mb-1">Cancellations</h1>
      <p className="text-xs text-muted mb-4">7-day money-back guarantee requests. Refunds are processed manually in the PayMongo dashboard — mark here once done.</p>

      <SaveToast message={saved} />

      <div className="flex gap-1.5 mb-4 overflow-x-auto no-scrollbar">
        {FILTERS.map((f) => (
          <Chip key={f.id} active={status === f.id} onClick={() => setStatus(f.id)}>{f.label}</Chip>
        ))}
      </div>

      {error && <ErrorState message={error} onRetry={load} />}
      {!error && !rows && <Loading label="Loading requests…" />}
      {!error && rows && rows.length === 0 && (
        <EmptyState icon={RotateCcw} title="No requests here" hint="Nothing in this filter right now." />
      )}

      {!error && rows && rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="bg-paper-2 border border-rule rounded-lg p-3.5">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-ink truncate">{r.user_email}</div>
                  <div className="text-[11px] text-muted capitalize">{r.reason.replace('_', ' ')}</div>
                </div>
                <StatusBadge status={r.status} />
              </div>

              {r.details && <p className="text-xs text-neutral2 mb-2 bg-paper-3 rounded-md p-2">{r.details}</p>}

              <div className="grid grid-cols-2 gap-2 text-[11px] text-muted mb-2">
                <div>Amount: <span className="text-ink font-medium">{fmtPhp(r.amount_php)}</span></div>
                <div>{r.status === 'pending' ? `Window: ${r.days_left ?? '—'}d left` : `Reviewed: ${fmtDate(r.reviewed_at)}`}</div>
                <div className="col-span-2">Submitted: {fmtDate(r.created_at)}</div>
                {r.paymongo_payment_id && <div className="col-span-2 truncate">Payment ID: <span className="font-mono text-ink">{r.paymongo_payment_id}</span></div>}
                {r.admin_note && <div className="col-span-2">Note: <span className="text-ink">{r.admin_note}</span></div>}
              </div>

              {r.status === 'pending' && (
                <>
                  <input
                    value={noteDraft[r.id] || ''}
                    onChange={(e) => setNoteDraft((d) => ({ ...d, [r.id]: e.target.value }))}
                    placeholder="Optional admin note…"
                    className="w-full px-3 py-2 mb-2 rounded-md bg-paper-3 border border-rule text-xs text-ink focus:border-accent outline-none"
                  />
                  <div className="flex gap-2">
                    <ActionButton icon={Check} label="Approve & refund" tone="success" disabled={busyId === r.id} onClick={() => handleAction(r.id, 'refunded')} />
                    <ActionButton icon={Banknote} label="Approve only" disabled={busyId === r.id} onClick={() => handleAction(r.id, 'approve')} />
                    <ActionButton icon={X} label="Reject" tone="error" disabled={busyId === r.id} onClick={() => handleAction(r.id, 'reject')} />
                  </div>
                </>
              )}
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
      className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-md border text-[10px] font-display font-bold disabled:opacity-50 ${toneClass}`}
    >
      <Icon size={11} /> {label}
    </button>
  )
}
