import React, { useEffect, useState } from 'react'
import { Radio, RefreshCw } from 'lucide-react'
import { fetchAdminProviders, updateAdminProvider, refreshAdminProviderStatus } from '../../api/client'
import { Loading, ErrorState, EmptyState, SaveToast, fmtDate } from './shared'

export default function Providers() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [saved, setSaved] = useState('')

  const load = () => {
    setError('')
    fetchAdminProviders().then((res) => setRows(res.providers)).catch(() => setError('Could not load providers.'))
  }
  useEffect(() => { load() }, [])

  const toggle = async (id, isEnabled) => {
    setBusyId(id)
    try {
      await updateAdminProvider(id, isEnabled)
      setSaved(`Provider ${isEnabled ? 'enabled' : 'disabled'}.`)
      setTimeout(() => setSaved(''), 2000)
      load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Action failed.')
    } finally {
      setBusyId(null)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await refreshAdminProviderStatus()
      setSaved('Provider statuses refreshed from DramaBuzz.')
      setTimeout(() => setSaved(''), 2500)
      load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Refresh failed.')
    } finally {
      setRefreshing(false)
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />

  return (
    <div className="pb-10">
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display font-black text-xl">Providers</h1>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-pill border border-rule bg-paper-2 text-xs font-display font-bold text-neutral2 disabled:opacity-60"
        >
          <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Refresh status
        </button>
      </div>
      <p className="text-xs text-muted mb-4">Disabled providers are excluded from browse/search/trending catalog aggregation.</p>

      <SaveToast message={saved} />

      {!rows && <Loading label="Loading providers…" />}
      {rows && rows.length === 0 && <EmptyState icon={Radio} title="No providers found" />}

      {rows && rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((p) => (
            <div key={p.id} className="bg-paper-2 border border-rule rounded-lg p-3.5 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-ink">{p.name}</div>
                <div className="text-[11px] text-muted">
                  status: <span className={p.status === 'active' ? 'text-success' : 'text-amber-400'}>{p.status}</span> · updated {fmtDate(p.updated_at)}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={p.is_enabled}
                disabled={busyId === p.id}
                onClick={() => toggle(p.id, !p.is_enabled)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full p-0.5 transition-colors disabled:opacity-50 ${p.is_enabled ? 'bg-accent' : 'bg-paper-4'}`}
              >
                <span className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${p.is_enabled ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
