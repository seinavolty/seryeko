import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Share2, Search as SearchIcon, Play, Bookmark, BookmarkCheck, Star } from 'lucide-react'
import { fetchDramaDetail, fetchEpisodes, addToWatchlist, removeFromWatchlist, fetchWatchlist } from '../api/client'
import { useAuthStore } from '../store/authStore'
import DramaCard from '../components/DramaCard'
import LazyImage from '../components/LazyImage'
import BrandSplashVideo from '../components/BrandSplashVideo'

// Helper: update <title> and <meta> tags dynamically for SEO
function useDramaSEO(drama) {
  useEffect(() => {
    if (!drama) return
    const title = `${drama.title} — Watch Online | SeryeKo.com`
    const description = `Watch ${drama.title} online on SeryeKo.com. ${drama.synopsis || drama.summary || ''} ${drama.totalEpisodes || drama.episodes || ''} episodes. ${drama.country || ''} drama streaming — no monthly subscription.`.trim().slice(0, 160)
    document.title = title
    const setMeta = (name, content, prop = false) => {
      const sel = prop ? `meta[property="${name}"]` : `meta[name="${name}"]`
      let el = document.querySelector(sel)
      if (!el) {
        el = document.createElement('meta')
        if (prop) el.setAttribute('property', name)
        else el.setAttribute('name', name)
        document.head.appendChild(el)
      }
      el.setAttribute('content', content)
    }
    setMeta('description', description)
    setMeta('og:title', title, true)
    setMeta('og:description', description, true)
    if (drama.coverImage || drama.cover) setMeta('og:image', drama.coverImage || drama.cover, true)
    setMeta('twitter:title', title)
    setMeta('twitter:description', description)
    return () => {
      document.title = 'SeryeKo.com — Watch Asian Short Dramas Online | Lifetime Access Philippines'
    }
  }, [drama])
}

export default function DramaDetail() {
  const { dramaId } = useParams()
  const navigate = useNavigate()
  const { isAuthenticated } = useAuthStore()

  const [drama, setDrama] = useState(null)
  const [episodes, setEpisodes] = useState([])
  const [detailLoading, setDetailLoading] = useState(true)
  const [episodesLoading, setEpisodesLoading] = useState(true)
  const [saved, setSaved] = useState(false)

  // Dynamic SEO per drama page
  useDramaSEO(drama)

  useEffect(() => {
    let active = true
    setDetailLoading(true)
    setEpisodesLoading(true)
    setDrama(null)
    setEpisodes([])

    // Paint hero/meta as soon as detail arrives — don't wait on episodes
    fetchDramaDetail(dramaId)
      .then((detail) => {
        if (!active) return
        setDrama(detail)
      })
      .catch(console.error)
      .finally(() => active && setDetailLoading(false))

    fetchEpisodes(dramaId)
      .then((res) => {
        if (!active) return
        setEpisodes(res?.episodes || [])
      })
      .catch(console.error)
      .finally(() => active && setEpisodesLoading(false))

    return () => { active = false }
  }, [dramaId])

  useEffect(() => {
    if (isAuthenticated) {
      fetchWatchlist().then((list) => setSaved(list.some((i) => i.drama_id === dramaId))).catch(() => {})
    }
  }, [isAuthenticated, dramaId])

  const toggleWatchlist = async () => {
    if (!isAuthenticated) {
      navigate('/login')
      return
    }
    try {
      if (saved) {
        await removeFromWatchlist(dramaId)
        setSaved(false)
      } else {
        await addToWatchlist(drama)
        setSaved(true)
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title: drama?.title, url: window.location.href }).catch(() => {})
    }
  }

  if (detailLoading) {
    return (
      <div className="relative min-h-dvh bg-black overflow-hidden">
        <BrandSplashVideo label="Loading drama…" />
      </div>
    )
  }

  if (!drama) {
    return <div className="min-h-screen flex items-center justify-center text-xs text-muted font-outlier">Drama not found.</div>
  }

  return (
    <div className="pb-24 max-w-2xl mx-auto min-h-screen">
      {/* TVSeries JSON-LD for Google Rich Results */}
      {drama && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'TVSeries',
              name: drama.title,
              description: drama.synopsis || drama.summary || '',
              image: drama.coverImage || drama.cover || '',
              countryOfOrigin: drama.country || '',
              inLanguage: 'en',
              numberOfEpisodes: drama.totalEpisodes || drama.episodes || undefined,
              genre: drama.genre || [],
              url: `https://seryeko.com/drama/${dramaId}`,
              potentialAction: {
                '@type': 'WatchAction',
                target: `https://seryeko.com/watch/${dramaId}?ep=1`,
              },
            }),
          }}
        />
      )}
      {/* Top nav */}
      <nav className="sticky top-0 z-40 bg-paper/80 backdrop-blur-md px-4 py-3 flex items-center gap-2 border-b border-rule">
        <button onClick={() => navigate(-1)} className="w-8 h-8 rounded-full bg-paper-3 flex items-center justify-center">
          <ArrowLeft size={16} />
        </button>
        <span className="font-display font-semibold text-sm flex-1 truncate">{drama.title}</span>
        <button onClick={handleShare} className="w-8 h-8 rounded-full bg-paper-3 flex items-center justify-center text-neutral2">
          <Share2 size={14} />
        </button>
        <Link to="/search" className="w-8 h-8 rounded-full bg-paper-3 flex items-center justify-center text-neutral2">
          <SearchIcon size={14} />
        </Link>
      </nav>

      {/* Hero backdrop */}
      <div className="relative h-56 sm:h-72 overflow-hidden">
        <LazyImage src={drama.coverImage || drama.cover} alt={`${drama.title} — ${drama.country || ''} drama cover`} priority className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-paper via-paper/50 to-transparent" />
      </div>

      <div className="px-4 -mt-10 relative">
        <p className="text-xs text-accent font-outlier uppercase mb-1">
          {drama.country} Drama · {drama.year}
        </p>
        <h1 className="font-display font-black text-2xl mb-3">{drama.title}</h1>

        <div className="flex items-center gap-2 flex-wrap mb-4">
          <span className="flex items-center gap-1 text-xs font-bold text-amber-400">
            <Star size={12} fill="currentColor" /> {drama.rating || '—'}
          </span>
          {(drama.genre || []).map((g) => (
            <span key={g} className="text-[10px] bg-paper-3 border border-rule rounded-pill px-2 py-0.5 text-neutral2">{g}</span>
          ))}
          <span className="text-[10px] bg-paper-3 border border-rule rounded-pill px-2 py-0.5 text-neutral2">
            {drama.totalEpisodes || drama.episodes} Episodes
          </span>
          <span className="text-[10px] bg-paper-3 border border-rule rounded-pill px-2 py-0.5 text-neutral2 capitalize">
            {drama.status}
          </span>
        </div>

        <p className="text-sm text-neutral2 leading-relaxed mb-4">{drama.synopsis || drama.summary}</p>

        <div className="flex items-center gap-2 text-xs text-muted mb-5">
          <span className="w-2 h-2 rounded-full bg-success inline-block" />
          Available on <span className="capitalize text-neutral2">{drama.provider}</span>
        </div>

        <div className="flex gap-2 mb-8">
          <button
            type="button"
            disabled={!episodesLoading && episodes.length === 0}
            onClick={() => {
              if (!episodesLoading && episodes.length === 0) return
              const watchPath = `/watch/${dramaId}?ep=1`
              if (!isAuthenticated) {
                navigate(`/login?next=${encodeURIComponent(watchPath)}`)
                return
              }
              navigate(watchPath)
            }}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-accent text-black font-display font-bold text-sm rounded-pill disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play size={15} fill="currentColor" />
            {!episodesLoading && episodes.length === 0 ? 'Not available yet' : 'Play Ep 1'}
          </button>
          <button
            onClick={toggleWatchlist}
            className={`flex items-center justify-center gap-1.5 px-4 py-3 rounded-pill text-xs font-bold border ${
              saved ? 'bg-accent/10 border-accent text-accent' : 'bg-paper-3 border-rule text-neutral2'
            }`}
          >
            {saved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />} {saved ? 'Saved' : 'Watchlist'}
          </button>
        </div>

        {/* Episode list */}
        <h2 className="font-display font-extrabold text-lg mb-3">Episodes</h2>
        <div className="space-y-2 mb-8">
          {episodesLoading && episodes.length === 0 && (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-md animate-pulse">
                  <div className="w-20 h-12 rounded-sm bg-paper-3 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-2 w-16 bg-paper-3 rounded" />
                    <div className="h-3 w-40 bg-paper-3 rounded" />
                  </div>
                </div>
              ))}
            </div>
          )}
          {!episodesLoading && episodes.length === 0 && (
            <p className="text-sm text-muted py-4">
              Playable episodes are not available from this provider yet. Check back later or pick another title.
            </p>
          )}
          {episodes.map((ep) => (
            <button
              type="button"
              key={ep.id}
              onClick={() => {
                const watchPath = `/watch/${dramaId}?ep=${ep.episode_num}`
                if (!isAuthenticated) {
                  navigate(`/login?next=${encodeURIComponent(watchPath)}`)
                  return
                }
                navigate(watchPath)
              }}
              className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-paper-2 transition-colors text-left"
            >
              <div className="relative w-20 h-12 rounded-sm overflow-hidden bg-paper-3 flex-shrink-0">
                {(ep.cover || drama?.coverImage || drama?.cover) ? (
                  <LazyImage
                    src={ep.cover || drama?.coverImage || drama?.cover}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : null}
                <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                  <Play size={14} className="text-white drop-shadow" fill="currentColor" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-outlier text-muted uppercase">Episode {ep.episode_num}</div>
                <div className="text-sm font-display font-semibold text-ink truncate">{ep.title}</div>
              </div>
              {ep.is_locked && (
                <span className="text-[10px] text-muted font-outlier uppercase flex-shrink-0">🔒 Locked</span>
              )}
            </button>
          ))}
        </div>

        {/* Related dramas */}
        {drama.related && drama.related.length > 0 && (
          <section>
            <h2 className="font-display font-extrabold text-lg mb-3">You might also like</h2>
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
              {drama.related.map((r) => (
                <DramaCard key={r.id} drama={r} variant="row" />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
