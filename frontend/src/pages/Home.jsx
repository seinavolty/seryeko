import React, { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Search as SearchIcon, Play, Info, ChevronRight } from 'lucide-react'
import { fetchTrending, fetchBrowse, fetchContinueWatching, fetchDramaDetail } from '../api/client'
import { useAuthStore } from '../store/authStore'
import AppShell from '../components/AppShell'
import DramaCard from '../components/DramaCard'
import LazyImage from '../components/LazyImage'

const TABS = [
  { id: 'foryou', label: '🔥 For You', filter: {} },
  { id: 'kr', label: '🇰🇷 Korean', filter: { country: 'KR' } },
  { id: 'cn', label: '🇨🇳 Chinese', filter: { country: 'CN' } },
  { id: 'th', label: '🇹🇭 Thai', filter: { country: 'TH' } },
  { id: 'ph', label: '🇵🇭 Filipino', filter: { country: 'PH' } },
  { id: 'fantasy', label: '💫 Fantasy', filter: { genre: 'Fantasy' } },
  { id: 'romance', label: '💕 Romance', filter: { genre: 'Romance' } },
  { id: 'action', label: '⚡ Action', filter: { genre: 'Action' } },
  { id: 'comedy', label: '😂 Comedy', filter: { genre: 'Comedy' } },
]

const GENRES = [
  { emoji: '❤️', label: 'Romance' },
  { emoji: '⚡', label: 'Action' },
  { emoji: '😂', label: 'Comedy' },
  { emoji: '🔮', label: 'Fantasy' },
  { emoji: '🔪', label: 'Thriller' },
  { emoji: '👨‍👩‍👧', label: 'Family' },
  { emoji: '🕵️', label: 'Revenge' },
  { emoji: '💼', label: 'CEO' },
]

export default function Home() {
  const { user, isAuthenticated } = useAuthStore()
  const [activeTab, setActiveTab] = useState('foryou')
  const [activeGenre, setActiveGenre] = useState(null)
  const [trending, setTrending] = useState([])
  const [loading, setLoading] = useState(true)
  const [continueWatching, setContinueWatching] = useState([])
  const [providerPicks, setProviderPicks] = useState([])

  const loadTrending = useCallback(async (filter = {}) => {
    setLoading(true)
    try {
      const res = await fetchBrowse({ ...filter, pageSize: 12 })
      setTrending(res.items || [])
    } catch (err) {
      console.error(err)
      setTrending([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const tab = TABS.find((t) => t.id === activeTab)
    const filter = activeGenre ? { genre: activeGenre } : tab?.filter || {}
    loadTrending(filter)
  }, [activeTab, activeGenre, loadTrending])

  useEffect(() => {
    fetchTrending('dramabox').then(setProviderPicks).catch(() => {})
  }, [])

  useEffect(() => {
    if (!isAuthenticated) {
      setContinueWatching([])
      return
    }
    fetchContinueWatching()
      .then(async (items) => {
        const enriched = await Promise.all(
          items.slice(0, 4).map(async (item) => {
            try {
              const detail = await fetchDramaDetail(item.drama_id)
              return { ...item, title: detail.title, cover: detail.cover, provider: detail.provider }
            } catch {
              return { ...item, title: item.drama_id, cover: '', provider: '' }
            }
          })
        )
        setContinueWatching(enriched)
      })
      .catch(() => setContinueWatching([]))
  }, [isAuthenticated])

  const featured = trending[0]

  return (
    <AppShell
      right={
        <>
          <Link to="/search" className="w-9 h-9 rounded-full bg-paper-3 flex items-center justify-center text-neutral2 hover:text-ink">
            <SearchIcon size={16} />
          </Link>
          <Link to="/profile" className="w-9 h-9 rounded-full bg-accent text-black font-display font-black flex items-center justify-center">
            {user?.full_name ? user.full_name[0].toUpperCase() : 'G'}
          </Link>
        </>
      }
    >
      {/* Category tabs */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto no-scrollbar">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setActiveGenre(null) }}
            className={`px-4 py-1.5 rounded-pill text-xs font-semibold whitespace-nowrap font-display transition-all ${
              activeTab === tab.id && !activeGenre
                ? 'bg-accent text-black'
                : 'bg-paper-3 text-neutral2 hover:text-ink'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Featured banner */}
      {featured && (
        <section className="px-4 py-2">
          <Link
            to={`/drama/${featured.id}`}
            className="block relative rounded-xl overflow-hidden aspect-[16/10] group border border-rule"
          >
            <LazyImage
              src={featured.cover}
              alt={featured.title}
              priority
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-paper via-paper/40 to-transparent" />
            <div className="absolute top-3 left-3 bg-accent text-black font-bold text-[10px] uppercase px-2 py-0.5 rounded-pill">
              {featured.badge || 'Featured'}
            </div>
            <div className="absolute bottom-4 left-4 right-4">
              <p className="text-[10px] text-accent font-outlier uppercase mb-1">New episodes · {featured.provider}</p>
              <h2 className="font-display font-extrabold text-xl text-ink mb-2 line-clamp-1">{featured.title}</h2>
              <div className="flex items-center gap-2">
                <Link
                  to={isAuthenticated ? `/watch/${featured.id}` : `/login?next=${encodeURIComponent(`/watch/${featured.id}`)}`}
                  className="bg-accent text-black font-bold px-4 py-1.5 rounded-pill text-xs flex items-center gap-1.5"
                >
                  <Play size={12} fill="currentColor" /> Play now
                </Link>
                <Link to={`/drama/${featured.id}`} className="bg-paper-3/80 text-ink font-bold px-3 py-1.5 rounded-pill text-xs flex items-center gap-1.5">
                  <Info size={12} /> Details
                </Link>
              </div>
            </div>
          </Link>
        </section>
      )}

      {/* Continue Watching */}
      {isAuthenticated && continueWatching.length > 0 && (
        <section className="mt-6">
          <div className="flex items-center justify-between mb-3 px-4">
            <h3 className="font-display font-bold text-sm text-ink">Continue Watching</h3>
          </div>
          <div className="flex gap-3 px-4 overflow-x-auto no-scrollbar">
            {continueWatching.map((cw) => (
              <Link
                key={cw.drama_id}
                to={`/watch/${cw.drama_id}?ep=${cw.episode_num}`}
                className="flex-shrink-0 w-40 bg-paper-2 border border-rule rounded-lg overflow-hidden group hover:border-accent/50"
              >
                <div className="relative aspect-video bg-paper-3 overflow-hidden">
                  {cw.cover && <LazyImage src={cw.cover} alt="" className="w-full h-full object-cover" />}
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
                    <div className="h-full bg-accent" style={{ width: `${cw.progress_pct || 50}%` }} />
                  </div>
                </div>
                <div className="p-2 flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-ink truncate">{cw.title}</div>
                    <div className="text-[10px] text-muted">Ep {cw.episode_num}</div>
                  </div>
                  <Play size={14} className="text-accent flex-shrink-0" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Genre pills */}
      <section className="mt-6">
        <h3 className="font-display font-bold text-sm text-ink px-4 mb-3">Browse by Genre</h3>
        <div className="flex gap-2 px-4 overflow-x-auto no-scrollbar">
          {GENRES.map((g) => (
            <button
              key={g.label}
              onClick={() => setActiveGenre(activeGenre === g.label ? null : g.label)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-pill text-xs font-semibold whitespace-nowrap ${
                activeGenre === g.label ? 'bg-accent text-black' : 'bg-paper-3 text-neutral2'
              }`}
            >
              <span>{g.emoji}</span> {g.label}
            </button>
          ))}
        </div>
      </section>

      {/* Trending grid */}
      <section className="px-4 mt-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-bold text-sm text-ink">
            {activeGenre ? `${activeGenre} Dramas` : '🔥 Trending Now'}
          </h3>
          <Link to="/browse" className="text-xs text-accent font-semibold flex items-center gap-0.5">
            See all <ChevronRight size={12} />
          </Link>
        </div>

        {loading ? (
          <div className="text-center py-10 text-xs text-muted font-outlier">Loading catalog...</div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {trending.map((item) => (
              <DramaCard key={item.id} drama={item} />
            ))}
          </div>
        )}
      </section>

      {/* Top picks by provider */}
      {providerPicks.length > 0 && (
        <section className="mt-6">
          <div className="flex items-center justify-between mb-3 px-4">
            <h3 className="font-display font-bold text-sm text-ink">🎬 From DramaBox</h3>
            <Link to="/browse" className="text-xs text-accent font-semibold flex items-center gap-0.5">
              Browse all <ChevronRight size={12} />
            </Link>
          </div>
          <div className="flex gap-3 px-4 overflow-x-auto no-scrollbar">
            {providerPicks.map((item) => (
              <DramaCard key={item.id} drama={item} variant="row" />
            ))}
          </div>
        </section>
      )}

      {/* Swipe feed FAB */}
      {trending[0] && (
        <Link
          to={`/watch/${trending[0].id}`}
          className="fixed right-4 bottom-24 z-40 flex items-center gap-1.5 bg-accent text-black font-display font-bold text-xs px-4 py-2.5 rounded-pill shadow-xl"
        >
          <ChevronRight size={14} className="-rotate-90" /> Swipe feed
        </Link>
      )}
    </AppShell>
  )
}
