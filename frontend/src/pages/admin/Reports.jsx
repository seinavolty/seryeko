import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Flag, Check, Eye, X, RotateCcw, Copy, CheckCheck, ExternalLink, RefreshCw } from 'lucide-react'
import {
  fetchAdminVideoReports,
  updateAdminVideoReport,
  fetchAdminReportProbe,
} from '../../api/client'
import { Loading, ErrorState, EmptyState, Chip, StatusBadge, fmtDate, SaveToast } from './shared'

const FILTERS = [
  { id: 'open', label: 'Open' },
  { id: 'reviewing', label: 'Reviewing' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'dismissed', label: 'Dismissed' },
  { id: 'all', label: 'All' },
]

function extractUrls(text = '') {
  if (!text) return []
  const matches = String(text).match(/https?:\/\/[^\s"'<>]+/gi) || []
  return [...new Set(matches.map((u) => u.replace(/[),.;]+$/, '')))]
}

function parseStreamFromDetails(details = '') {
  const raw = String(details || '')
  const m = raw.match(/(?:^|[;\s])stream=(https?:\/\/\S+)/i)
  if (m?.[1]) return m[1].replace(/[),.;]+$/, '')
  return extractUrls(raw)[0] || ''
}

async function copyText(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  if (!text) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

function CopyButton({ value, label = 'Copy' }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await copyText(value)
        if (!ok) return
        setDone(true)
        setTimeout(() => setDone(false), 1600)
      }}
      className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-rule bg-paper-3 text-[10px] font-bold text-neutral2 hover:text-ink hover:border-accent/40 shrink-0"
    >
      {done ? <CheckCheck size={11} className="text-success" /> : <Copy size={11} />}
      {done ? 'Copied' : label}
    </button>
  )
}

function MonoBlock({ label, value, href }) {
  if (!value) return null
  return (
    <div className="col-span-2 min-w-0 rounded-md bg-paper-3/80 border border-rule p-2">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[10px] font-outlier uppercase text-muted">{label}</span>
        <div className="flex items-center gap-1.5">
          {href && (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-rule text-[10px] font-bold text-neutral2 hover:text-accent"
            >
              <ExternalLink size={11} /> Open
            </a>
          )}
          <CopyButton value={value} />
        </div>
      </div>
      <p className="font-mono text-[10px] leading-relaxed text-ink break-all whitespace-pre-wrap">
        {value}
      </p>
    </div>
  )
}

function ReportCard({ r, busyId, noteDraft, setNoteDraft, onAction, onSaved }) {
  const [probe, setProbe] = useState(null)
  const [probeBusy, setProbeBusy] = useState(false)
  const [probeErr, setProbeErr] = useState('')
  const [openProbe, setOpenProbe] = useState(false)

  const streamUrl = useMemo(() => {
    return (r.video_url || '').trim() || parseStreamFromDetails(r.details)
  }, [r.video_url, r.details])

  const detailText = useMemo(() => {
    const raw = String(r.details || '').trim()
    if (!raw) return ''
    // If details is only stream=URL and we already show Stream, skip duplicate
    if (streamUrl && raw.replace(/\s+/g, '') === `stream=${streamUrl}`) return ''
    return raw
  }, [r.details, streamUrl])

  const dramaMeta = r.drama || null

  const loadProbe = async () => {
    setProbeBusy(true)
    setProbeErr('')
    setOpenProbe(true)
    try {
      const data = await fetchAdminReportProbe(r.drama_id, r.episode_num || 1)
      setProbe(data)
    } catch (err) {
      setProbeErr(err?.response?.data?.detail || 'Could not load API detail.')
      setProbe(null)
    } finally {
      setProbeBusy(false)
    }
  }

  const copyProbe = async () => {
    if (!probe) return
    const ok = await copyText(probe)
    if (ok) onSaved?.('API payload copied.')
  }

  return (
    <div className="bg-paper-2 border border-rule rounded-lg p-3.5 overflow-hidden">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-ink break-words">
            {r.title || dramaMeta?.title || r.drama_id}
          </div>
          <div className="text-[11px] text-muted">
            Ep {r.episode_num} · <span className="capitalize">{r.provider || dramaMeta?.provider || 'unknown'}</span>
          </div>
        </div>
        <StatusBadge status={r.status} />
      </div>

      {dramaMeta?.cover && (
        <div className="flex gap-3 mb-3 min-w-0">
          <img
            src={dramaMeta.cover}
            alt=""
            className="w-14 h-20 object-cover rounded-md bg-paper-3 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-ink break-words">{dramaMeta.title}</div>
            {dramaMeta.summary && (
              <p className="text-[11px] text-muted mt-1 line-clamp-3 break-words">{dramaMeta.summary}</p>
            )}
            <div className="text-[10px] text-muted mt-1">
              {dramaMeta.episodes ? `${dramaMeta.episodes} eps` : '—'} · {dramaMeta.original_id}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-[11px] text-muted mb-2 min-w-0">
        <div className="col-span-2 min-w-0">
          Drama:{' '}
          <Link to={`/drama/${r.drama_id}`} className="text-accent font-medium break-all">
            {r.drama_id}
          </Link>
        </div>
        <div className="col-span-2 break-words">
          Reporter: <span className="text-ink">{r.user_email}</span>
        </div>
        <div>
          Reason:{' '}
          <span className="text-ink capitalize">{(r.reason || '').replace(/_/g, ' ')}</span>
        </div>
        <div>Submitted: {fmtDate(r.created_at)}</div>

        {detailText && <MonoBlock label="Details" value={detailText} />}
        {streamUrl && <MonoBlock label="Stream URL" value={streamUrl} href={streamUrl} />}
        {r.admin_note && (
          <div className="col-span-2 break-words">
            Note: <span className="text-ink">{r.admin_note}</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-2">
        <button
          type="button"
          onClick={loadProbe}
          disabled={probeBusy}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-accent/40 text-accent bg-accent/5 text-[11px] font-bold disabled:opacity-50"
        >
          <RefreshCw size={12} className={probeBusy ? 'animate-spin' : ''} />
          {probeBusy ? 'Loading API…' : openProbe && probe ? 'Refresh API detail' : 'Load movie API'}
        </button>
        {probe && (
          <button
            type="button"
            onClick={copyProbe}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-rule text-neutral2 bg-paper-3 text-[11px] font-bold"
          >
            <Copy size={12} /> Copy API JSON
          </button>
        )}
      </div>

      {probeErr && (
        <p className="text-[11px] text-error mb-2 break-words">{probeErr}</p>
      )}

      {openProbe && probe && (
        <div className="mb-3 rounded-md border border-rule bg-black/30 p-2.5 min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] font-outlier uppercase text-muted">Movie API detail</span>
            <CopyButton value={probe} label="Copy all" />
          </div>
          {probe.detail && !probe.detail.error && (
            <div className="mb-2 text-[11px] text-muted space-y-0.5 min-w-0">
              <div className="text-ink font-bold break-words">
                {probe.detail.title || probe.detail.name || r.drama_id}
              </div>
              <div className="break-all">
                provider={probe.provider} · id={probe.original_id} · eps={probe.episodes_total}
              </div>
              {(probe.episode?.video_url || probe.detail.cover) && (
                <div className="pt-1">
                  {probe.episode?.video_url && (
                    <MonoBlock
                      label={`Episode ${probe.episode.episode_num || r.episode_num} stream`}
                      value={probe.episode.video_url}
                      href={probe.episode.video_url}
                    />
                  )}
                </div>
              )}
            </div>
          )}
          <pre className="max-h-56 overflow-auto text-[10px] leading-relaxed font-mono text-neutral2 whitespace-pre-wrap break-all">
            {JSON.stringify(probe, null, 2)}
          </pre>
        </div>
      )}

      {(r.status === 'open' || r.status === 'reviewing') && (
        <>
          <input
            value={noteDraft[r.id] || ''}
            onChange={(e) => setNoteDraft((d) => ({ ...d, [r.id]: e.target.value }))}
            placeholder="Optional admin note…"
            className="w-full px-3 py-2 mb-2 rounded-md bg-paper-3 border border-rule text-xs text-ink focus:border-accent outline-none"
          />
          <div className="flex flex-wrap gap-2">
            {r.status === 'open' && (
              <ActionButton icon={Eye} label="Reviewing" disabled={busyId === r.id} onClick={() => onAction(r.id, 'reviewing')} />
            )}
            <ActionButton icon={Check} label="Resolved" tone="success" disabled={busyId === r.id} onClick={() => onAction(r.id, 'resolved')} />
            <ActionButton icon={X} label="Dismiss" tone="error" disabled={busyId === r.id} onClick={() => onAction(r.id, 'dismissed')} />
          </div>
        </>
      )}

      {(r.status === 'resolved' || r.status === 'dismissed') && (
        <ActionButton icon={RotateCcw} label="Reopen" disabled={busyId === r.id} onClick={() => onAction(r.id, 'reopen')} />
      )}
    </div>
  )
}

export default function Reports() {
  const [status, setStatus] = useState('open')
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [saved, setSaved] = useState('')
  const [noteDraft, setNoteDraft] = useState({})

  const load = () => {
    setError('')
    fetchAdminVideoReports(status)
      .then((res) => setRows(res.reports))
      .catch(() => setError('Could not load video reports.'))
  }

  useEffect(() => { setRows(null); load() }, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAction = async (id, action) => {
    setBusyId(id)
    try {
      await updateAdminVideoReport(id, action, noteDraft[id] || '')
      setSaved(
        action === 'resolved' ? 'Marked resolved.' :
        action === 'dismissed' ? 'Report dismissed.' :
        action === 'reviewing' ? 'Marked as reviewing.' :
        'Report reopened.'
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
      <h1 className="font-display font-black text-xl mb-1">Video reports</h1>
      <p className="text-xs text-muted mb-4">
        Playback failures reported by viewers when an episode won’t play.
      </p>

      <SaveToast message={saved} />

      <div className="flex gap-1.5 mb-4 overflow-x-auto no-scrollbar">
        {FILTERS.map((f) => (
          <Chip key={f.id} active={status === f.id} onClick={() => setStatus(f.id)}>{f.label}</Chip>
        ))}
      </div>

      {error && <ErrorState message={error} onRetry={load} />}
      {!error && !rows && <Loading label="Loading reports…" />}
      {!error && rows && rows.length === 0 && (
        <EmptyState icon={Flag} title="No reports here" hint="Nothing in this filter right now." />
      )}

      {!error && rows && rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((r) => (
            <ReportCard
              key={r.id}
              r={r}
              busyId={busyId}
              noteDraft={noteDraft}
              setNoteDraft={setNoteDraft}
              onAction={handleAction}
              onSaved={(msg) => {
                setSaved(msg)
                setTimeout(() => setSaved(''), 2000)
              }}
            />
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
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-[11px] font-bold disabled:opacity-50 ${toneClass}`}
    >
      <Icon size={12} /> {label}
    </button>
  )
}
