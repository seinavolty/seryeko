import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, DollarSign, RotateCcw, Share2, TrendingUp, Wallet, Flag } from 'lucide-react'
import { fetchAdminOverview } from '../../api/client'
import { Loading, ErrorState } from './shared'

export default function Overview() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    setError('')
    fetchAdminOverview()
      .then(setData)
      .catch(() => setError('Could not load overview stats.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  if (loading) return <Loading label="Loading overview…" />
  if (error) return <ErrorState message={error} onRetry={load} />

  const stats = data?.stats || {}
  const maxSignup = Math.max(1, ...(data?.signups_7d || []).map((d) => d.count))

  return (
    <div className="space-y-5 pb-10">
      <div className="grid grid-cols-2 gap-3">
        <KpiCard icon={Users} iconColor="text-success" label="Lifetime subscribers" value={stats.lifetime_subscribers ?? 0} hint={`${stats.trial_users ?? 0} on trial`} />
        <KpiCard icon={DollarSign} iconColor="text-accent" label="Total revenue" value={`₱${(stats.total_revenue_php ?? 0).toLocaleString()}`} hint={`${stats.conversion_rate ?? 0}% conversion`} />
        <Link to="/admin/cancellations" className="block">
          <KpiCard icon={RotateCcw} iconColor="text-amber-400" label="Pending cancellations" value={stats.pending_cancellations ?? 0} hint="tap to review" />
        </Link>
        <Link to="/admin/reports" className="block">
          <KpiCard icon={Flag} iconColor="text-error" label="Open video reports" value={stats.open_video_reports ?? 0} hint="playback failures" />
        </Link>
        <Link to="/admin/referrals?tab=commissions" className="block">
          <KpiCard icon={Share2} iconColor="text-sky-400" label="Pending earnings" value={stats.pending_commissions ?? 0} hint="approve commissions" />
        </Link>
        <Link to="/admin/referrals?tab=withdrawals" className="block col-span-2">
          <KpiCard icon={Wallet} iconColor="text-accent" label="Pending payouts" value={stats.pending_withdrawals ?? 0} hint="Referrals → Payouts" />
        </Link>
      </div>

      <div className="bg-paper-2 border border-rule rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-bold text-sm flex items-center gap-1.5">
            <TrendingUp size={14} className="text-accent" /> Sign-ups · last 7 days
          </h2>
          <span className="text-xs text-muted">Total users: {stats.total_users ?? 0}</span>
        </div>
        <div className="flex items-stretch gap-1.5 h-28">
          {(data?.signups_7d || []).map((d) => {
            const barH = d.count > 0 ? Math.max(10, Math.round((d.count / maxSignup) * 72)) : 3
            return (
              <div key={d.date} className="flex-1 min-w-0 flex flex-col items-center">
                <div className="w-full flex-1 flex flex-col justify-end items-center">
                  {d.count > 0 && (
                    <span className="text-[9px] font-display font-bold text-accent leading-none mb-1">{d.count}</span>
                  )}
                  <div
                    className={`w-full max-w-[28px] rounded-t-sm transition-all ${d.count > 0 ? 'bg-accent' : 'bg-paper-4'}`}
                    style={{ height: `${barH}px` }}
                    title={`${d.count} sign-ups`}
                  />
                </div>
                <span className="text-[9px] text-muted font-outlier mt-1.5 whitespace-nowrap">{d.date.slice(5)}</span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="bg-paper-2 border border-rule rounded-xl p-4">
        <h2 className="font-display font-bold text-sm mb-2">Current pricing</h2>
        <p className="text-2xl font-display font-black text-accent">₱{data?.current_pricing?.lifetime_price_php ?? '—'}</p>
        <p className="text-xs text-muted">Lifetime access · edit in Settings</p>
      </div>
    </div>
  )
}

function KpiCard({ icon: Icon, iconColor, label, value, hint }) {
  return (
    <div className="bg-paper-2 border border-rule rounded-lg p-4 h-full">
      <div className="flex items-center justify-between text-muted mb-1.5">
        <span className="text-[11px]">{label}</span>
        <Icon size={14} className={iconColor} />
      </div>
      <div className="font-display font-black text-2xl text-ink">{value}</div>
      <div className="text-[10px] text-muted">{hint}</div>
    </div>
  )
}
