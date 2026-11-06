import React, { useEffect, useState } from 'react'
import { BarChart3, Clock, Radio } from 'lucide-react'
import { fetchAdminAnalyticsContent, fetchAdminAnalyticsSignups, fetchAdminWebhooks } from '../../api/client'
import { Loading, ErrorState, EmptyState, Chip, fmtDate } from './shared'

const TABS = ['content', 'signups', 'webhooks']

export default function Analytics() {
  const [tab, setTab] = useState('content')

  return (
    <div className="pb-10">
      <h1 className="font-display font-black text-xl mb-4">Analytics</h1>
      <div className="flex gap-1.5 mb-4 overflow-x-auto no-scrollbar">
        {TABS.map((t) => (
          <Chip key={t} active={tab === t} onClick={() => setTab(t)}>
            {t === 'content' ? 'Content plays' : t === 'signups' ? 'Sign-ups' : 'Webhooks'}
          </Chip>
        ))}
      </div>
      {tab === 'content' && <ContentTab />}
      {tab === 'signups' && <SignupsTab />}
      {tab === 'webhooks' && <WebhooksTab />}
    </div>
  )
}

function ContentTab() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  const load = () => fetchAdminAnalyticsContent().then(setData).catch(() => setError('Could not load content analytics.'))
  useEffect(() => { load() }, [])

  if (error) return <ErrorState message={error} onRetry={load} />
  if (!data) return <Loading label="Loading content analytics…" />

  return (
    <div className="space-y-5">
      <section>
        <h2 className="font-display font-bold text-sm mb-2 flex items-center gap-1.5"><BarChart3 size={14} className="text-accent" /> Top played</h2>
        {data.top_played.length === 0 ? (
          <EmptyState title="No play data yet" />
        ) : (
          <div className="space-y-1.5">
            {data.top_played.map((d, i) => (
              <div key={d.drama_id} className="flex items-center gap-3 bg-paper-2 border border-rule rounded-md p-2.5">
                <span className="text-xs font-display font-black text-muted w-5">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-ink truncate">{d.title}</div>
                  <div className="text-[10px] text-muted capitalize">{d.provider}</div>
                </div>
                <div className="text-sm font-display font-black text-accent flex-shrink-0">{d.play_count}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-display font-bold text-sm mb-2 flex items-center gap-1.5"><Clock size={14} className="text-accent" /> Recently played</h2>
        {data.recently_played.length === 0 ? (
          <EmptyState title="No recent activity" />
        ) : (
          <div className="space-y-1.5">
            {data.recently_played.map((d) => (
              <div key={d.drama_id} className="flex items-center gap-3 bg-paper-2 border border-rule rounded-md p-2.5">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-ink truncate">{d.title}</div>
                  <div className="text-[10px] text-muted capitalize">{d.provider}</div>
                </div>
                <div className="text-[10px] text-muted flex-shrink-0">{fmtDate(d.last_played_at)}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function SignupsTab() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')

  const load = () => fetchAdminAnalyticsSignups(14).then((res) => setRows(res.signups)).catch(() => setError('Could not load sign-up data.'))
  useEffect(() => { load() }, [])

  if (error) return <ErrorState message={error} onRetry={load} />
  if (!rows) return <Loading label="Loading sign-ups…" />

  const max = Math.max(1, ...rows.map((r) => r.count))

  return (
    <div className="bg-paper-2 border border-rule rounded-xl p-4">
      <h2 className="font-display font-bold text-sm mb-3">Daily sign-ups · last 14 days</h2>
      <div className="flex items-stretch gap-1 h-32 overflow-x-auto">
        {rows.map((d) => {
          const barH = d.count > 0 ? Math.max(10, Math.round((d.count / max) * 88)) : 3
          return (
            <div key={d.date} className="flex-1 min-w-[18px] flex flex-col items-center">
              <div className="w-full flex-1 flex flex-col justify-end items-center">
                {d.count > 0 && (
                  <span className="text-[8px] font-display font-bold text-accent leading-none mb-0.5">{d.count}</span>
                )}
                <div
                  className={`w-full max-w-[22px] rounded-t-sm ${d.count > 0 ? 'bg-accent' : 'bg-paper-4'}`}
                  style={{ height: `${barH}px` }}
                  title={`${d.count} sign-ups`}
                />
              </div>
              <span className="text-[8px] text-muted font-outlier mt-1.5">{d.date.slice(8)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WebhooksTab() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')

  const load = () => fetchAdminWebhooks().then((res) => setRows(res.webhooks)).catch(() => setError('Could not load webhook logs.'))
  useEffect(() => { load() }, [])

  if (error) return <ErrorState message={error} onRetry={load} />
  if (!rows) return <Loading label="Loading webhooks…" />
  if (rows.length === 0) return <EmptyState icon={Radio} title="No webhook events yet" hint="QR Ph events (payment.paid, payment.failed, qrph.expired) appear here after the PayMongo webhook is registered." />

  return (
    <div className="space-y-2">
      {rows.map((w) => (
        <div key={w.id} className="bg-paper-2 border border-rule rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-ink">{w.event_type}</span>
            <span className="text-[10px] text-muted">{fmtDate(w.created_at)}</span>
          </div>
          <div className="text-[10px] text-muted font-outlier uppercase mb-1">{w.status}</div>
          <pre className="text-[10px] text-neutral2 bg-paper-3 rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-all">{w.payload?.slice(0, 300)}</pre>
        </div>
      ))}
    </div>
  )
}
