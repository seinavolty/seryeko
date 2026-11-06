import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Share2, Wallet, X, Check, Ban, Send } from 'lucide-react'
import {
  fetchAdminReferrers, updateAdminReferralCode,
  fetchAdminCommissions, updateAdminCommission,
  fetchAdminWithdrawals, updateAdminWithdrawal,
} from '../../api/client'
import { Loading, ErrorState, EmptyState, Chip, StatusBadge, fmtDate, fmtPhp, SaveToast } from './shared'

const TABS = [
  { id: 'referrers', label: 'Referrers' },
  { id: 'commissions', label: 'Earnings' },
  { id: 'withdrawals', label: 'Payouts' },
]

const METHOD_LABELS = {
  gcash: 'GCash',
  maya: 'Maya',
  grabpay: 'GrabPay',
  bank: 'Bank transfer',
}

export default function Referrals() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab = TABS.some((t) => t.id === raw) ? raw : (raw === 'payouts' ? 'withdrawals' : 'referrers')

  const setTab = (id) => {
    const next = new URLSearchParams(params)
    next.set('tab', id)
    setParams(next, { replace: true })
  }

  return (
    <div className="pb-10">
      <h1 className="font-display font-black text-xl mb-1">Referrals</h1>
      <p className="text-xs text-muted mb-4">
        Earnings = approve commission. Payouts = send money (GCash / Maya / bank details).
      </p>

      <div className="flex gap-1.5 mb-4 overflow-x-auto no-scrollbar">
        {TABS.map((t) => (
          <Chip key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</Chip>
        ))}
      </div>

      {tab === 'referrers' && <ReferrersTab />}
      {tab === 'commissions' && <CommissionsTab onGoPayouts={() => setTab('withdrawals')} />}
      {tab === 'withdrawals' && <WithdrawalsTab />}
    </div>
  )
}

function ReferrersTab() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [saved, setSaved] = useState('')

  const load = () => {
    setError('')
    fetchAdminReferrers().then((res) => setRows(res.referrers)).catch(() => setError('Could not load referrers.'))
  }
  useEffect(() => { load() }, [])

  if (error) return <ErrorState message={error} onRetry={load} />
  if (!rows) return <Loading label="Loading referrers…" />
  if (rows.length === 0) return <EmptyState icon={Share2} title="No referral codes yet" hint="Codes are created automatically when users sign up." />

  return (
    <>
      <SaveToast message={saved} />
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.code_id} className="bg-paper-2 border border-rule rounded-lg p-3.5">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0">
                <div className="text-sm font-bold text-ink truncate">{r.user_email}</div>
                <div className="text-xs font-mono text-accent">{r.code}</div>
              </div>
              <span className={`text-[10px] font-outlier font-bold uppercase px-2 py-0.5 rounded-pill border ${r.is_enabled ? 'bg-success/15 text-success border-success/30' : 'bg-paper-3 text-muted border-rule'}`}>
                {r.is_enabled ? 'enabled' : 'disabled'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[11px] text-muted mb-3">
              <div>Signups: <span className="text-ink font-medium">{r.signups}</span></div>
              <div>Conversions: <span className="text-ink font-medium">{r.conversions}</span></div>
              <div>Unpaid: <span className="text-ink font-medium">{fmtPhp(r.unpaid_balance_php)}</span></div>
            </div>
            {(r.discount_type || r.commission_pct !== null) && (
              <div className="text-[11px] text-accent mb-2">
                Override: {r.discount_type ? `${r.discount_value}${r.discount_type === 'percent' ? '%' : ' PHP'} discount` : ''}
                {r.commission_pct !== null ? ` · ${r.commission_pct}% commission` : ''}
              </div>
            )}
            <button
              type="button"
              onClick={() => setEditing(r)}
              className="w-full py-2 rounded-md border border-accent/40 bg-accent/5 text-accent text-xs font-display font-bold"
            >
              Edit code
            </button>
          </div>
        ))}
      </div>

      {editing && (
        <EditCodeSheet
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setSaved('Referral code updated.'); setTimeout(() => setSaved(''), 2500); load() }}
        />
      )}
    </>
  )
}

function EditCodeSheet({ row, onClose, onSaved }) {
  const [isEnabled, setIsEnabled] = useState(row.is_enabled)
  const [discountType, setDiscountType] = useState(row.discount_type || '')
  const [discountValue, setDiscountValue] = useState(row.discount_value ?? '')
  const [commissionPct, setCommissionPct] = useState(row.commission_pct ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await updateAdminReferralCode(row.code_id, {
        is_enabled: isEnabled,
        discount_type: discountType || '',
        discount_value: discountValue === '' ? null : parseFloat(discountValue),
        commission_pct: commissionPct === '' ? null : parseFloat(commissionPct),
      })
      onSaved()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-paper-2 border-t border-rule rounded-t-2xl p-5 pb-8 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-bold text-base">Edit {row.code}</h3>
          <button type="button" onClick={onClose} className="w-7 h-7 rounded-full bg-paper-3 flex items-center justify-center text-muted"><X size={14} /></button>
        </div>

        {error && <div className="bg-error/10 border border-error/30 text-error text-xs p-2.5 rounded-md mb-3">{error}</div>}

        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-paper-3 rounded-md border border-rule">
            <span className="text-xs font-bold text-ink">Code enabled</span>
            <button
              type="button"
              role="switch"
              aria-checked={isEnabled}
              onClick={() => setIsEnabled((v) => !v)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full p-0.5 transition-colors ${isEnabled ? 'bg-accent' : 'bg-paper-4'}`}
            >
              <span className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${isEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral2 mb-1">Discount override (blank = use global default)</label>
            <div className="grid grid-cols-3 gap-2">
              {['', 'percent', 'fixed'].map((t) => (
                <button
                  key={t || 'none'}
                  type="button"
                  onClick={() => setDiscountType(t)}
                  className={`py-2 rounded-md border text-[11px] font-bold capitalize ${discountType === t ? 'border-accent bg-accent/10 text-accent' : 'border-rule bg-paper-3 text-neutral2'}`}
                >
                  {t === '' ? 'Default' : t}
                </button>
              ))}
            </div>
          </div>

          {discountType && (
            <input
              type="number"
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              placeholder={discountType === 'percent' ? 'e.g. 20 (%)' : 'e.g. 100 (PHP)'}
              className="w-full px-4 py-3 rounded-md bg-paper-3 border border-rule text-ink text-sm focus:border-accent outline-none"
            />
          )}

          <div>
            <label className="block text-xs font-bold text-neutral2 mb-1">Commission % override (blank = use global default)</label>
            <input
              type="number"
              value={commissionPct}
              onChange={(e) => setCommissionPct(e.target.value)}
              placeholder="e.g. 25"
              className="w-full px-4 py-3 rounded-md bg-paper-3 border border-rule text-ink text-sm focus:border-accent outline-none"
            />
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3.5 bg-accent text-black font-display font-extrabold text-xs rounded-pill disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save code'}
          </button>
        </div>
      </div>
    </div>
  )
}

const COMMISSION_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'paid', label: 'Paid' },
  { id: 'cancelled', label: 'Cancelled' },
]

function CommissionsTab({ onGoPayouts }) {
  const [status, setStatus] = useState('pending')
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [saved, setSaved] = useState('')

  const load = () => {
    setError('')
    fetchAdminCommissions(status).then((res) => setRows(res.commissions)).catch(() => setError('Could not load commissions.'))
  }
  useEffect(() => { setRows(null); load() }, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAction = async (id, action) => {
    setBusyId(id)
    try {
      await updateAdminCommission(id, action)
      setSaved(action === 'approve' ? 'Earning approved — user can withdraw it.' : 'Commission cancelled.')
      setTimeout(() => setSaved(''), 2500)
      load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Action failed.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <SaveToast message={saved} />
      <div className="mb-3 p-3 rounded-lg border border-rule bg-paper-2 text-[11px] text-muted leading-relaxed">
        This tab is <span className="text-ink font-bold">earnings only</span> (no GCash / bank details).
        Approve so the balance unlocks. When the user requests cash-out, open{' '}
        <button type="button" onClick={onGoPayouts} className="text-accent font-bold underline underline-offset-2">
          Payouts
        </button>
        {' '}to see account number and send money.
      </div>
      <div className="flex gap-1.5 mb-4 overflow-x-auto no-scrollbar">
        {COMMISSION_FILTERS.map((f) => (
          <Chip key={f.id} active={status === f.id} onClick={() => setStatus(f.id)}>{f.label}</Chip>
        ))}
      </div>

      {error && <ErrorState message={error} onRetry={load} />}
      {!error && !rows && <Loading label="Loading commissions…" />}
      {!error && rows && rows.length === 0 && (
        <EmptyState icon={Wallet} title="No commissions here" hint="Nothing in this filter right now." />
      )}

      {!error && rows && rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((c) => (
            <div key={c.id} className="bg-paper-2 border border-rule rounded-lg p-3.5">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-ink truncate">{c.referrer_email}</div>
                  <div className="text-[11px] text-muted truncate">referred {c.referred_email}</div>
                </div>
                <StatusBadge status={c.status} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-muted mb-3">
                <div>Code: <span className="text-accent font-mono">{c.referral_code}</span></div>
                <div>Rate: <span className="text-ink font-medium">{c.rate_pct}%</span></div>
                <div>Sale amount: <span className="text-ink font-medium">{fmtPhp(c.paid_php)}</span></div>
                <div>Earning: <span className="text-ink font-bold">{fmtPhp(c.amount_php)}</span></div>
                <div className="col-span-2">Created: {fmtDate(c.created_at)}</div>
              </div>
              {c.status === 'approved' && (
                <p className="text-[10px] text-muted mb-2">Waiting for user withdraw request → then pay from Payouts.</p>
              )}
              {c.status === 'pending' && (
                <div className="flex gap-2">
                  <ActionButton icon={Check} label="Approve earning" disabled={busyId === c.id} onClick={() => handleAction(c.id, 'approve')} />
                  <ActionButton icon={Ban} label="Cancel" tone="error" disabled={busyId === c.id} onClick={() => handleAction(c.id, 'cancel')} />
                </div>
              )}
              {c.status === 'approved' && (
                <div className="flex gap-2">
                  <ActionButton icon={Ban} label="Cancel" tone="error" disabled={busyId === c.id} onClick={() => handleAction(c.id, 'cancel')} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const WITHDRAW_FILTERS = [
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'sent', label: 'Sent' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'all', label: 'All' },
]

function WithdrawalsTab() {
  const [status, setStatus] = useState('pending')
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [saved, setSaved] = useState('')
  const [noteDraft, setNoteDraft] = useState({})

  const load = () => {
    setError('')
    fetchAdminWithdrawals(status)
      .then((res) => setRows(res.withdrawals))
      .catch(() => setError('Could not load withdraw requests.'))
  }
  useEffect(() => { setRows(null); load() }, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAction = async (id, action) => {
    setBusyId(id)
    try {
      await updateAdminWithdrawal(id, action, noteDraft[id] || '')
      setSaved(
        action === 'approve' ? 'Withdrawal approved.' :
        action === 'sent' ? 'Marked as sent — commissions marked paid.' :
        'Withdrawal cancelled.'
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
    <div>
      <SaveToast message={saved} />
      <div className="mb-3 p-3 rounded-lg border border-accent/30 bg-accent/5 text-[11px] text-muted leading-relaxed">
        <span className="text-ink font-bold">Payout requests</span> from Profile → Withdraw.
        Each card shows payment method + account / mobile number. Approve, send the money, then Mark sent.
      </div>
      <div className="flex gap-1.5 mb-4 overflow-x-auto no-scrollbar">
        {WITHDRAW_FILTERS.map((f) => (
          <Chip key={f.id} active={status === f.id} onClick={() => setStatus(f.id)}>{f.label}</Chip>
        ))}
      </div>

      {error && <ErrorState message={error} onRetry={load} />}
      {!error && !rows && <Loading label="Loading payouts…" />}
      {!error && rows && rows.length === 0 && (
        <EmptyState
          icon={Wallet}
          title="No payout requests yet"
          hint="Users submit GCash / Maya / bank details from Withdraw earnings. Approve earnings first."
        />
      )}

      {!error && rows && rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((w) => (
            <div key={w.id} className="bg-paper-2 border border-rule rounded-lg p-3.5">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-ink truncate">{w.user_email}</div>
                  <div className="text-base font-display font-black text-accent">{fmtPhp(w.amount_php)}</div>
                </div>
                <StatusBadge status={w.status} />
              </div>

              <div className="mb-3 p-3 rounded-md bg-paper-3 border border-rule space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-outlier uppercase text-muted">Payment method</span>
                  <span className="text-sm font-bold text-ink">{METHOD_LABELS[w.method] || w.method}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-outlier uppercase text-muted">Account name</span>
                  <span className="text-sm font-medium text-ink text-right">{w.account_name || '—'}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-outlier uppercase text-muted">
                    {w.method === 'bank' ? 'Account number' : 'Mobile number'}
                  </span>
                  <span className="text-sm font-mono font-bold text-accent text-right">{w.account_number || '—'}</span>
                </div>
                {w.method === 'bank' && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-outlier uppercase text-muted">Bank</span>
                    <span className="text-sm font-medium text-ink text-right">{w.bank_name || '—'}</span>
                  </div>
                )}
                <div className="text-[11px] text-muted pt-1">Submitted {fmtDate(w.created_at)}</div>
                {w.admin_note && <div className="text-[11px] text-muted">Note: <span className="text-ink">{w.admin_note}</span></div>}
              </div>

              {(w.status === 'pending' || w.status === 'approved') && (
                <>
                  <input
                    value={noteDraft[w.id] || ''}
                    onChange={(e) => setNoteDraft((d) => ({ ...d, [w.id]: e.target.value }))}
                    placeholder="Optional admin note…"
                    className="w-full px-3 py-2 mb-2 rounded-md bg-paper-3 border border-rule text-xs text-ink focus:border-accent outline-none"
                  />
                  <div className="flex gap-2">
                    {w.status === 'pending' && (
                      <ActionButton icon={Check} label="Approve" disabled={busyId === w.id} onClick={() => handleAction(w.id, 'approve')} />
                    )}
                    <ActionButton icon={Send} label="Mark sent" tone="success" disabled={busyId === w.id} onClick={() => handleAction(w.id, 'sent')} />
                    <ActionButton icon={Ban} label="Cancel" tone="error" disabled={busyId === w.id} onClick={() => handleAction(w.id, 'cancel')} />
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
      className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-md border text-[11px] font-display font-bold disabled:opacity-50 ${toneClass}`}
    >
      <Icon size={12} /> {label}
    </button>
  )
}
