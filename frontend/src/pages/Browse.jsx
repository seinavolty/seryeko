import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Bookmark, SlidersHorizontal } from 'lucide-react'
import { fetchBrowse, fetchProviders, addToWatchlist, removeFromWatchlist, fetchWatchlist } from '../api/client'
import { useAuthStore } from '../store/authStore'
import FilterDrawer from '../components/FilterDrawer'
import LazyImage from '../components/LazyImage'

const GENRE_CHIPS = [
  { id: 'all', label: 'All', filter: {} },
  { id: 'romance', label: '❤️ Romance', filter: { genre: 'Romance' } },
  { id: 'action', label: '⚡ Action', filter: { genre: 'Action' } },
  { id: 'fantasy', label: '🔮 Fantasy', filter: { genre: 'Fantasy' } },
  { id: 'kr', label: '🇰🇷 Korean', filter: { country: 'KR' } },
  { id: 'cn', label: '🇨🇳 Chinese', filter: { country: 'CN' } },
]

function chipIdFromFilters({ genre, country }) {
  const match = GENRE_CHIPS.find((chip) => {
    if (chip.id === 'all') return false
    const f = chip.filter || {}
    if (f.genre) return genre === f.genre && !country
    if (f.country) return country === f.country && !genre
    return false
  })
  if (match) return match.id
  if (!genre && !country) return 'all'
  return null
}

function filtersFromSearchParams(params) {
  const filters = {}
  const provider = (params.get('provider') || '').trim()
  const genre = (params.get('genre') || '').trim()
  const country = (params.get('country') || '').trim()
  const status = (params.get('status') || '').trim()
  if (provider) filters.provider = provider
  if (genre) filters.genre = genre
  if (country) filters.country = country
  if (status) filters.status = status
  return {
    filters,
    activeProvider: provider,
    activeGenre: chipIdFromFilters({ genre, country }),
  }
}

function buildSearchParams({ provider, genre, country, status }) {
  const next = new URLSearchParams()
  if (provider) next.set('provider', provider)
  if (genre) next.set('genre', genre)
  if (country) next.set('country', country)
  if (status) next.set('status', status)
  return next
}

export default function Browse() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { isAuthenticated } = useAuthStore()

  const { filters, activeProvider, activeGenre } = useMemo(
    () => filtersFromSearchParams(searchParams),
    [searchParams],
  )

  const [providers, setProviders] = useState([])
  const [providerCounts, setProviderCounts] = useState({})
  const [items, setItems] = useState([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [watchlistIds, setWatchlistIds] = useState(new Set())
  const sentinelRef = useRef(null)
  const loadingRef = useRef(false)
  const filtersKey = useMemo(() => JSON.stringify(filters), [filters])

  const syncUrl = useCallback((nextFilters, { replace = true } = {}) => {
    setSearchParams(
      buildSearchParams({
        provider: nextFilters.provider || '',
        genre: nextFilters.genre || '',
        country: nextFilters.country || '',
        status: nextFilters.status || '',
      }),
      { replace },
    )
  }, [setSearchParams])

  const loadPage = useCallback(async (pageNum, currentFilters, reset = false) => {
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    try {
      const res = await fetchBrowse({ ...currentFilters, page: pageNum, pageSize: 12 })
      setItems((prev) => {
        if (reset) return res.items || []
        const seen = new Set(prev.map((i) => i.id))
        return [...prev, ...(res.items || []).filter((i) => !seen.has(i.id))]
      })
      setTotal(res.total || 0)
      setHasMore(Boolean(res.has_more))
      setPage(pageNum)
      if (res.providers) setProviderCounts(res.providers)
    } catch (err) {
      console.error(err)
      if (reset) setItems([])
      setHasMore(false)
    } finally {
      setLoading(false)
      setInitialLoading(false)
      loadingRef.current = false
    }
  }, [])

  useEffect(() => {
    fetchProviders()
      .then((data) => {
        const active = data.active || data.platforms?.filter((p) => p.status === 'active' && p.api) || []
        setProviders(active)
      })
      .catch(console.error)
  }, [])

  useEffect(() => {
    setInitialLoading(true)
    setItems([])
    setPage(1)
    setHasMore(true)
    loadPage(1, filters, true)
  }, [filtersKey, filters, loadPage])

  useEffect(() => {
    if (isAuthenticated) {
      fetchWatchlist().then((list) => setWatchlistIds(new Set(list.map((i) => i.drama_id)))).catch(() => {})
    }
  }, [isAuthenticated])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingRef.current) {
          loadPage(page + 1, filters)
        }
      },
      { rootMargin: '320px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [page, hasMore, filters, loadPage])

  const selectProvider = (providerId) => {
    const next = { ...filters }
    if (providerId) next.provider = providerId
    else delete next.provider
    syncUrl(next)
  }

  const selectGenre = (chip) => {
    const next = { ...(chip.filter || {}) }
    if (activeProvider) next.provider = activeProvider
    syncUrl(next)
  }

  const applyFilters = (next) => {
    syncUrl(next)
  }

  const toggleWatchlist = async (e, drama) => {
    e.preventDefault()
    if (!isAuthenticated) {
      navigate('/login')
      return
    }
    const inList = watchlistIds.has(drama.id)
    try {
      if (inList) {
        await removeFromWatchlist(drama.id)
        setWatchlistIds((prev) => {
          const s = new Set(prev)
          s.delete(drama.id)
          return s
        })
      } else {
        await addToWatchlist(drama)
        setWatchlistIds((prev) => new Set(prev).add(drama.id))
      }
    } catch (err) {
      console.error(err)
    }
  }

  const liveProviders = providers.filter((p) => {
    if (activeProvider && p.id === activeProvider) return true
    return Boolean(providerCounts[p.id])
  })

  return (
    <div className="pb-24 max-w-lg mx-auto min-h-screen">
      <header className="sticky top-0 z-40 bg-paper/90 backdrop-blur-md px-4 py-3 flex items-center gap-3 border-b border-rule">
        <button onClick={() => navigate(-1)} className="w-8 h-8 rounded-full bg-paper-3 flex items-center justify-center">
          <ArrowLeft size={16} />
        </button>
        <h1 className="font-display font-bold text-base flex-1">Browse Dramas</h1>
        <button
          onClick={() => setDrawerOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-pill bg-paper-3 text-xs font-semibold text-neutral2"
        >
          <SlidersHorizontal size={13} /> Filter
        </button>
      </header>

      <div className="flex gap-2 px-4 py-3 overflow-x-auto no-scrollbar border-b border-rule">
        <button
          onClick={() => selectProvider('')}
          className={`px-3.5 py-1.5 rounded-pill text-xs font-semibold whitespace-nowrap ${
            !activeProvider ? 'bg-accent text-black' : 'bg-paper-3 text-neutral2'
          }`}
        >
          All providers{total && !activeProvider ? ` · ${total}` : ''}
        </button>
        {liveProviders.map((p) => (
          <button
            key={p.id}
            onClick={() => selectProvider(p.id)}
            className={`px-3.5 py-1.5 rounded-pill text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 ${
              activeProvider === p.id ? 'bg-accent text-black' : 'bg-paper-3 text-neutral2'
            }`}
          >
            {p.logo && (
              <img
                src={p.logo}
                alt=""
                className="w-3.5 h-3.5 rounded-sm object-contain"
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
            )}
            {p.name || p.id}
            {providerCounts[p.id] ? ` · ${providerCounts[p.id]}` : ''}
          </button>
        ))}
      </div>

      <div className="flex gap-2 px-4 py-3 overflow-x-auto no-scrollbar border-b border-rule">
        {GENRE_CHIPS.map((chip) => (
          <button
            key={chip.id}
            onClick={() => selectGenre(chip)}
            className={`px-3.5 py-1.5 rounded-pill text-xs font-semibold whitespace-nowrap ${
              activeGenre === chip.id ? 'bg-ink text-paper' : 'bg-paper-3 text-neutral2'
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <div className="px-4 py-3 text-[11px] font-outlier text-muted uppercase">
        {initialLoading ? 'Loading catalog from DramaBuzz…' : `Showing ${items.length} of ${total} dramas · lazy load`}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 px-4">
        {items.map((drama) => (
          <Link key={drama.id} to={`/drama/${drama.id}`} className="bg-paper-2 border border-rule rounded-lg overflow-hidden group hover:border-accent/50">
            <div className="relative aspect-[3/4] bg-paper-3 overflow-hidden">
              {drama.cover ? (
                <LazyImage
                  src={drama.cover}
                  alt={drama.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[10px] text-muted font-outlier">NO COVER</div>
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/40" />
              {drama.badge && (
                <div className="absolute top-1.5 left-1.5 bg-accent text-black text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-pill">
                  {drama.badge}
                </div>
              )}
              <button
                onClick={(e) => toggleWatchlist(e, drama)}
                className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center backdrop-blur-sm ${
                  watchlistIds.has(drama.id) ? 'bg-accent text-black' : 'bg-black/50 text-white'
                }`}
                aria-label="Add to watchlist"
              >
                <Bookmark size={12} fill={watchlistIds.has(drama.id) ? 'currentColor' : 'none'} />
              </button>
              <div className="absolute bottom-1.5 left-1.5 text-[9px] text-white/90 bg-black/60 px-1.5 py-0.5 rounded font-outlier">
                {drama.provider}
              </div>
              <div className="absolute bottom-1.5 right-1.5 text-[9px] text-white/90 bg-black/60 px-1.5 py-0.5 rounded font-outlier">
                {drama.episodes || '—'} eps
              </div>
            </div>
            <div className="p-2">
              <div className="text-xs font-bold text-ink line-clamp-1 mb-0.5">{drama.title}</div>
              <div className="text-[10px] text-muted line-clamp-1">
                {(drama.tags || drama.genre || []).slice(0, 2).join(' · ') || drama.provider}
              </div>
            </div>
          </Link>
        ))}

        {initialLoading && Array.from({ length: 6 }).map((_, i) => (
          <div key={`sk-${i}`} className="bg-paper-2 border border-rule rounded-lg overflow-hidden animate-pulse">
            <div className="aspect-[3/4] bg-paper-3" />
            <div className="p-2 space-y-1.5">
              <div className="h-3 bg-paper-3 rounded w-4/5" />
              <div className="h-2 bg-paper-3 rounded w-2/5" />
            </div>
          </div>
        ))}
      </div>

      <div ref={sentinelRef} className="py-8 text-center">
        {loading && !initialLoading && <span className="text-xs text-muted font-outlier">LOADING MORE DRAMAS…</span>}
        {!hasMore && !loading && items.length > 0 && (
          <span className="text-xs text-muted font-outlier">ALL LOADED · {total} DRAMAS</span>
        )}
        {!initialLoading && !loading && items.length === 0 && (
          <span className="text-xs text-muted font-outlier">NO DRAMAS MATCH THIS FILTER</span>
        )}
      </div>

      <FilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        filters={filters}
        onApply={(f) => {
          const next = { ...f }
          if (activeProvider) next.provider = activeProvider
          applyFilters(next)
          setDrawerOpen(false)
        }}
      />
    </div>
  )
}
