import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Wallet, Send } from 'lucide-react'
import { fetchMyWithdrawals, createWithdrawal } from '../api/client'
import { fmtDate, fmtPhp, StatusBadge } from './admin/shared'

const METHODS = [
  { id: 'gcash', label: 'GCash', hint: 'Mobile wallet' },
  { id: 'maya', label: 'Maya', hint: 'Mobile wallet' },
  { id: 'grabpay', label: 'GrabPay', hint: 'Mobile wallet' },
  { id: 'bank', label: 'Bank transfer', hint: 'InstaPay / PESONet' },
]

export default function Withdraw() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')

  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('gcash')
  const [accountName, setAccountName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [bankName, setBankName] = useState('')

  const load = () => {
    setLoading(true)
    setError('')
    fetchMyWithdrawals()
      .then(setData)
      .catch(() => setError('Could not load withdraw details.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const available = data?.available_balance_php ?? 0
  const minWithdraw = data?.min_withdraw_php ?? 100

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    const amt = parseFloat(amount)
    if (!amt || Number.isNaN(amt)) {
      setError('Enter a valid amount.')
      return
    }
    setSaving(true)
    try {
      const res = await createWithdrawal({
        amount_php: amt,
        method,
        account_name: accountName.trim(),
        account_number: accountNumber.trim(),
        bank_name: bankName.trim(),
      })
      setSuccess(res.message || 'Withdraw request submitted.')
      setAmount('')
      load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not submit withdraw request.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pb-24 max-w-lg mx-auto min-h-screen">
      <header className="sticky top-0 z-30 bg-paper/90 backdrop-blur-md border-b border-rule px-4 py-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="w-8 h-8 rounded-full bg-paper-3 flex items-center justify-center"
          aria-label="Back"
        >
          <ArrowLeft size={16} />
        </button>
        <h1 className="font-display font-bold text-base">Withdraw earnings</h1>
      </header>

      <div className="px-4 pt-5 space-y-5">
        <div className="bg-accent/10 border border-accent/30 rounded-xl p-4">
          <div className="text-[11px] text-neutral2 mb-1 flex items-center gap-1.5">
            <Wallet size={13} className="text-accent" /> Available to withdraw
          </div>
          <div className="font-display font-black text-3xl text-accent">{fmtPhp(available)}</div>
          <p className="text-[11px] text-muted mt-1">
            Only <span className="text-ink">approved</span> commissions count. Minimum withdraw {fmtPhp(minWithdraw)}.
            Payout via Philippine methods (GCash, Maya, GrabPay, bank).
          </p>
        </div>

        {error && <div className="bg-error/10 border border-error/30 text-error text-xs p-3 rounded-md">{error}</div>}
        {success && <div className="bg-success/15 border border-success/40 text-success text-xs p-3 rounded-md">{success}</div>}

        {!loading && (
          <form onSubmit={handleSubmit} className="bg-paper-2 border border-rule rounded-xl p-4 space-y-4">
            <div>
              <label className="block text-xs font-bold text-neutral2 mb-1">Amount (PHP ₱)</label>
              <input
                type="number"
                min={minWithdraw}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={String(minWithdraw)}
                className="w-full px-4 py-3 rounded-md bg-paper-3 border border-rule text-ink text-sm focus:border-accent outline-none"
              />
              <button
                type="button"
                onClick={() => setAmount(String(available))}
                disabled={available < minWithdraw}
                className="mt-1.5 text-[11px] text-accent font-bold disabled:opacity-40"
              >
                Withdraw all available
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral2 mb-1.5">Payment method</label>
              <div className="grid grid-cols-2 gap-2">
                {METHODS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMethod(m.id)}
                    className={`py-2.5 px-2 rounded-md border text-left transition-all ${
                      method === m.id ? 'border-accent bg-accent/10' : 'border-rule bg-paper-3'
                    }`}
                  >
                    <div className={`text-xs font-bold ${method === m.id ? 'text-accent' : 'text-ink'}`}>{m.label}</div>
                    <div className="text-[10px] text-muted">{m.hint}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral2 mb-1">Account name</label>
              <input
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="Full name on account"
                required
                className="w-full px-4 py-3 rounded-md bg-paper-3 border border-rule text-ink text-sm focus:border-accent outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral2 mb-1">
                {method === 'bank' ? 'Account number' : 'Mobile number'}
              </label>
              <input
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder={method === 'bank' ? 'e.g. 1234 5678 9012' : 'e.g. 09XXXXXXXXX'}
                required
                className="w-full px-4 py-3 rounded-md bg-paper-3 border border-rule text-ink text-sm focus:border-accent outline-none"
              />
            </div>

            {method === 'bank' && (
              <div>
                <label className="block text-xs font-bold text-neutral2 mb-1">Bank name</label>
                <input
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="e.g. BDO, BPI, UnionBank"
                  required
                  className="w-full px-4 py-3 rounded-md bg-paper-3 border border-rule text-ink text-sm focus:border-accent outline-none"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={saving || available < minWithdraw}
              className="w-full py-3.5 bg-accent text-black font-display font-extrabold text-xs rounded-pill flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Send size={14} /> {saving ? 'Submitting…' : 'Submit withdraw request'}
            </button>
          </form>
        )}

        <div>
          <h2 className="font-display font-bold text-sm mb-2">Request history</h2>
          {loading && <p className="text-xs text-muted py-6 text-center">Loading…</p>}
          {!loading && (data?.withdrawals || []).length === 0 && (
            <p className="text-xs text-muted py-6 text-center">No withdraw requests yet.</p>
          )}
          <div className="space-y-2">
            {(data?.withdrawals || []).map((w) => (
              <div key={w.id} className="bg-paper-2 border border-rule rounded-lg p-3.5">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="font-display font-bold text-sm text-ink">{fmtPhp(w.amount_php)}</div>
                  <StatusBadge status={w.status} />
                </div>
                <div className="text-[11px] text-muted capitalize">
                  {w.method}{w.bank_name ? ` · ${w.bank_name}` : ''} · {w.account_number}
                </div>
                <div className="text-[11px] text-muted mt-0.5">Submitted {fmtDate(w.created_at)}</div>
                {w.admin_note && <div className="text-[11px] text-neutral2 mt-1">Note: {w.admin_note}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
