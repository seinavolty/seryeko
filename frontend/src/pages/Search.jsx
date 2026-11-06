import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Search as SearchIcon, X, Clock, ArrowUpDown } from 'lucide-react'
import { fetchSearch } from '../api/client'
import DramaCard from '../components/DramaCard'

const TRENDING_TILES = [
  { emoji: '❤️', label: 'Romance', count: '4,320 dramas', filter: { genre: 'Romance' } },
  { emoji: '🇰🇷', label: 'Korean', count: '2,180 dramas', filter: { country: 'KR' } },
  { emoji: '⚡', label: 'Action', count: '1,940 dramas', filter: { genre: 'Action' } },
  { emoji: '🇨🇳', label: 'Chinese', count: '1,720 dramas', filter: { country: 'CN' } },
  { emoji: '🔮', label: 'Fantasy', count: '980 dramas', filter: { genre: 'Fantasy' } },
  { emoji: '🇹🇭', label: 'Thai', count: '760 dramas', filter: { country: 'TH' } },
]

const GENRE_PILLS = ['❤️ Romance', '⚡ Action', '😂 Comedy', '🔮 Fantasy', '🔪 Thriller', '👑 Revenge', '👨‍👩‍👧 Family', '💼 CEO']

const RECENT_KEY = 'ds_recent_searches'

export default function Search() {
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const [query, setQuery] = useState('')
  const [recent, setRecent] = useState([])
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'))
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!query.trim()) {
      setResults(null)
      return
    }
    const timer = setTimeout(() => {
      setLoading(true)
      fetchSearch(query.trim())
        .then((res) => setResults(res))
        .catch(() => setResults({ items: [], count: 0 }))
        .finally(() => setLoading(false))
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const commitSearch = (q) => {
    const trimmed = q.trim()
    if (!trimmed) return
    const updated = [trimmed, ...recent.filter((r) => r !== trimmed)].slice(0, 6)
    setRecent(updated)
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated))
  }

  const clearRecent = () => {
    setRecent([])
    localStorage.removeItem(RECENT_KEY)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') commitSearch(query)
    if (e.key === 'Escape') setQuery('')
  }

  return (
    <div className="pb-24 max-w-lg mx-auto min-h-screen">
      {/* Header with search input */}
      <header className="sticky top-0 z-40 bg-paper/90 backdrop-blur-md px-4 py-3 border-b border-rule">
        <div className="relative">
          <SearchIcon size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => commitSearch(query)}
            placeholder="Search dramas, actors, genres…"
            className="w-full pl-10 pr-10 py-3 rounded-pill bg-paper-2 border border-rule text-sm text-ink placeholder:text-muted focus:border-accent outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted hover:text-neutral2">
              <X size={14} />
            </button>
          )}
        </div>
      </header>

      <main className="px-4">
        {!query.trim() ? (
          <>
            {/* Recent searches */}
            {recent.length > 0 && (
              <div className="mt-5">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="font-display font-bold text-sm text-ink">Recent</h2>
                  <button onClick={clearRecent} className="text-xs text-accent font-semibold">Clear all</button>
                </div>
                <div className="space-y-1">
                  {recent.map((r) => (
                    <div
                      key={r}
                      onClick={() => setQuery(r)}
                      className="flex items-center gap-2.5 py-2 px-1 cursor-pointer hover:bg-paper-2 rounded-md group"
                    >
                      <Clock size={14} className="text-muted flex-shrink-0" />
                      <span className="flex-1 text-sm text-neutral2">{r}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setRecent((prev) => prev.filter((x) => x !== r)) }}
                        className="text-muted opacity-0 group-hover:opacity-100"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Trending grid */}
            <div className="mt-6">
              <h2 className="font-display font-bold text-sm text-ink mb-3">Trending now</h2>
              <div className="grid grid-cols-2 gap-3">
                {TRENDING_TILES.map((tile) => (
                  <Link
                    key={tile.label}
                    to="/browse"
                    className="relative aspect-[16/10] rounded-lg overflow-hidden bg-gradient-to-br from-accent/25 to-paper-3 flex items-end p-3 border border-rule"
                  >
                    <div>
                      <div className="font-display font-bold text-sm text-ink">{tile.emoji} {tile.label}</div>
                      <div className="text-[10px] text-neutral2 font-outlier">{tile.count}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Genre pills */}
            <div className="mt-6 mb-4">
              <h2 className="font-display font-bold text-sm text-ink mb-3">Browse genres</h2>
              <div className="flex flex-wrap gap-2">
                {GENRE_PILLS.map((g) => (
                  <Link key={g} to="/browse" className="px-3.5 py-1.5 rounded-pill bg-paper-3 text-xs text-neutral2 border border-rule">
                    {g}
                  </Link>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="mt-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-outlier text-muted uppercase">
                {loading ? 'Searching…' : `${results?.count ?? 0} results for "${query.toUpperCase()}"`}
              </span>
              <button className="flex items-center gap-1 text-xs text-neutral2">
                Sort <ArrowUpDown size={12} />
              </button>
            </div>

            {!loading && results?.items?.length === 0 && (
              <div className="text-center py-16 text-xs text-muted font-outlier">No dramas found. Try another search.</div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {(results?.items || []).map((item) => (
                <DramaCard key={item.id} drama={item} />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
