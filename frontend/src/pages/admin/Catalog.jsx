import React, { useEffect, useState } from 'react'
import { Search, LibraryBig, X, RefreshCw, Eye, EyeOff, Star } from 'lucide-react'
import { fetchAdminCatalog, updateAdminCatalogItem, refreshAdminCatalogItem } from '../../api/client'
import { Loading, ErrorState, EmptyState, SaveToast } from './shared'
import LazyImage from '../../components/LazyImage'

export default function Catalog() {
  const [q, setQ] = useState('')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [saved, setSaved] = useState('')

  const load = () => {
    setError('')
    fetchAdminCatalog({ q, pageSize: 24 }).then(setData).catch(() => setError('Could not load catalog.'))
  }

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  return (
    <div className="pb-10">
      <h1 className="font-display font-black text-xl mb-1">Catalog CMS</h1>
      <p className="text-xs text-muted mb-4">Edit cached metadata, hide/feature titles, or refresh from the provider. No custom uploads.</p>

      <SaveToast message={saved} />

      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search cached dramas…"
          className="w-full pl-9 pr-4 py-3 rounded-md bg-paper-2 border border-rule text-sm text-ink focus:border-accent outline-none"
        />
      </div>

      {error && <ErrorState message={error} onRetry={load} />}
      {!error && !data && <Loading label="Loading catalog…" />}
      {!error && data && data.items.length === 0 && (
        <EmptyState icon={LibraryBig} title="No cached dramas found" hint="Browse the app to populate the cache, or adjust your search." />
      )}

      {!error && data && data.items.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {data.items.map((item) => (
              <button
                key={item.drama_id}
                type="button"
                onClick={() => setEditing(item)}
                className="bg-paper-2 border border-rule rounded-lg overflow-hidden text-left relative"
              >
                <div className="relative aspect-[3/4] bg-paper-3">
                  {item.cover && <LazyImage src={item.cover} alt="" className="w-full h-full object-cover" />}
                  {item.is_hidden && (
                    <span className="absolute top-1.5 left-1.5 bg-black/70 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-pill flex items-center gap-1">
                      <EyeOff size={9} /> hidden
                    </span>
                  )}
                  {item.is_featured && (
                    <span className="absolute top-1.5 right-1.5 bg-accent text-black text-[9px] font-bold px-1.5 py-0.5 rounded-pill flex items-center gap-1">
                      <Star size={9} /> featured
                    </span>
                  )}
                </div>
                <div className="p-2">
                  <div className="text-xs font-bold text-ink truncate">{item.title}</div>
                  <div className="text-[10px] text-muted capitalize">{item.provider}</div>
                </div>
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted text-center mt-4">{data.items.length} of {data.total} cached dramas</p>
        </>
      )}

      {editing && (
        <EditDramaSheet
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); setSaved(msg); setTimeout(() => setSaved(''), 2500); load() }}
        />
      )}
    </div>
  )
}

function EditDramaSheet({ item, onClose, onSaved }) {
  const [title, setTitle] = useState(item.title || '')
  const [summary, setSummary] = useState(item.summary || item.synopsis || '')
  const [badge, setBadge] = useState(item.badge || '')
  const [isHidden, setIsHidden] = useState(!!item.is_hidden)
  const [isFeatured, setIsFeatured] = useState(!!item.is_featured)
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await updateAdminCatalogItem(item.drama_id, {
        title, summary, badge, is_hidden: isHidden, is_featured: isFeatured,
      })
      onSaved('Drama metadata updated.')
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    setError('')
    try {
      await refreshAdminCatalogItem(item.drama_id)
      onSaved('Refreshed from provider.')
    } catch (err) {
      setError(err.response?.data?.detail || 'Refresh failed — provider may be unavailable.')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-paper-2 border-t border-rule rounded-t-2xl p-5 pb-8 max-h-[85vh] overflow-y-auto animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-bold text-base truncate pr-2">Edit drama</h3>
          <button type="button" onClick={onClose} className="w-7 h-7 rounded-full bg-paper-3 flex items-center justify-center text-muted flex-shrink-0"><X size={14} /></button>
        </div>

        {error && <div className="bg-error/10 border border-error/30 text-error text-xs p-2.5 rounded-md mb-3">{error}</div>}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-neutral2 mb-1">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-4 py-3 rounded-md bg-paper-3 border border-rule text-ink text-sm focus:border-accent outline-none" />
          </div>
          <div>
            <label className="block text-xs font-bold text-neutral2 mb-1">Summary / synopsis</label>
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={4} className="w-full px-4 py-3 rounded-md bg-paper-3 border border-rule text-ink text-sm focus:border-accent outline-none resize-none" />
          </div>
          <div>
            <label className="block text-xs font-bold text-neutral2 mb-1">Badge (optional tag)</label>
            <input value={badge} onChange={(e) => setBadge(e.target.value)} placeholder="e.g. New, Trending" className="w-full px-4 py-3 rounded-md bg-paper-3 border border-rule text-ink text-sm focus:border-accent outline-none" />
          </div>

          <div className="flex items-center justify-between p-3 bg-paper-3 rounded-md border border-rule">
            <span className="text-xs font-bold text-ink flex items-center gap-1.5"><EyeOff size={13} /> Hidden from catalog</span>
            <button type="button" role="switch" aria-checked={isHidden} onClick={() => setIsHidden((v) => !v)} className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full p-0.5 transition-colors ${isHidden ? 'bg-accent' : 'bg-paper-4'}`}>
              <span className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${isHidden ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
          <div className="flex items-center justify-between p-3 bg-paper-3 rounded-md border border-rule">
            <span className="text-xs font-bold text-ink flex items-center gap-1.5"><Star size={13} /> Featured</span>
            <button type="button" role="switch" aria-checked={isFeatured} onClick={() => setIsFeatured((v) => !v)} className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full p-0.5 transition-colors ${isFeatured ? 'bg-accent' : 'bg-paper-4'}`}>
              <span className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${isFeatured ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-pill border border-rule bg-paper-3 text-xs font-display font-bold text-neutral2 disabled:opacity-60"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> Refresh from provider
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-3 bg-accent text-black font-display font-extrabold text-xs rounded-pill disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
