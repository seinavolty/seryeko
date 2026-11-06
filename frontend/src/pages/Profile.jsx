import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Settings, X, Clock, ChevronRight, LogOut, User as UserIcon, Lock,
  Smartphone, Globe2, Captions, PlayCircle, Wifi, Bell, LifeBuoy, RotateCcw,
  ShieldCheck, Share2, Copy, Check, Wallet,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import {
  fetchWatchlist, removeFromWatchlist, fetchContinueWatching, fetchDramaDetail, fetchMe,
  fetchMyReferral,
} from '../api/client'
import LazyImage from '../components/LazyImage'

function readPref(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    if (typeof fallback === 'boolean') return raw === 'true'
    return raw
  } catch {
    return fallback
  }
}

export default function Profile() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, logout, isAuthenticated, setUser } = useAuthStore()

  const [tab, setTab] = useState(searchParams.get('tab') || 'watchlist')
  const [watchlist, setWatchlist] = useState([])
  const [history, setHistory] = useState([])
  const [autoplay, setAutoplay] = useState(() => readPref('pref_autoplay', true))
  const [dataSaver, setDataSaver] = useState(() => readPref('pref_data_saver', false))
  const [notifications, setNotifications] = useState(() => readPref('pref_notifications', true))
  const [lang, setLang] = useState(() => localStorage.getItem('preferred_lang') || 'en')
  const [subsLang, setSubsLang] = useState(() => localStorage.getItem('preferred_subs') || localStorage.getItem('preferred_lang') || 'en')
  const [referral, setReferral] = useState(null)
  const [copied, setCopied] = useState(false)

  const sub = user?.subscription || { status: 'trial', plan: 'free_trial', episodes_watched: 0 }
  const isLifetime = sub.status === 'active' && sub.plan === 'lifetime'

  useEffect(() => {
    setTab(searchParams.get('tab') || 'watchlist')
  }, [searchParams])

  const selectTab = (t) => {
    setTab(t)
    setSearchParams(t === 'watchlist' ? {} : { tab: t }, { replace: true })
  }

  useEffect(() => {
    if (!isAuthenticated) return
    // Refresh subscription stats from API (localStorage can be stale after watching)
    fetchMe().then(setUser).catch(() => {})
    fetchWatchlist().then(setWatchlist).catch(() => {})
    fetchMyReferral().then(setReferral).catch(() => {})
    fetchContinueWatching()
      .then(async (items) => {
        const enriched = await Promise.all(
          items.map(async (item) => {
            try {
              const detail = await fetchDramaDetail(item.drama_id)
              return { ...item, title: detail.title, cover: detail.cover, country: detail.country, genre: detail.genre }
            } catch {
              return { ...item, title: item.drama_id }
            }
          })
        )
        setHistory(enriched)
      })
      .catch(() => {})
  }, [isAuthenticated, setUser])

  const handleRemoveWatchlist = async (dramaId) => {
    try {
      await removeFromWatchlist(dramaId)
      setWatchlist((prev) => prev.filter((i) => i.drama_id !== dramaId))
    } catch (err) {
      console.error(err)
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const cycleLang = (current, setter, storageKey) => {
    const options = ['en', 'tl', 'id']
    const next = options[(options.indexOf(current) + 1) % options.length]
    setter(next)
    localStorage.setItem(storageKey, next)
  }

  const setToggle = (key, value, setter) => {
    setter(value)
    localStorage.setItem(key, String(value))
  }

  const langLabel = { en: '🇺🇸 English', tl: '🇵🇭 Tagalog', id: '🇮🇩 Bahasa Indonesia' }

  const copyShareLink = async () => {
    if (!referral?.share_url) return
    try {
      await navigator.clipboard.writeText(referral.share_url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <UserIcon size={40} className="text-muted mb-4" />
        <h1 className="font-display font-bold text-lg mb-2">You&apos;re not signed in</h1>
        <p className="text-sm text-muted mb-6">Log in to see your watchlist, history, and settings.</p>
        <Link to="/login" className="px-6 py-3 bg-accent text-black font-display font-bold text-sm rounded-pill">
          Log In or Register
        </Link>
      </div>
    )
  }

  return (
    <div className="pb-24 max-w-lg mx-auto min-h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-4">
        <h1 className="font-display font-black text-xl">Profile</h1>
        <button
          type="button"
          onClick={() => selectTab('settings')}
          className="w-9 h-9 rounded-full bg-paper-3 flex items-center justify-center text-neutral2"
          aria-label="Open settings"
        >
          <Settings size={16} />
        </button>
      </header>

      <div className="px-4">
        {/* Profile hero */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-accent to-rose-500 flex items-center justify-center font-display font-black text-2xl text-black flex-shrink-0">
            {user?.full_name ? user.full_name[0].toUpperCase() : 'G'}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-display font-bold text-lg text-ink truncate">{user?.full_name || 'Guest User'}</h2>
            <p className="text-xs text-muted truncate">{user?.email}</p>
            {isLifetime && (
              <span className="inline-block mt-1 text-[10px] font-bold text-success bg-success/15 border border-success/30 rounded-pill px-2 py-0.5">
                ✨ Lifetime member
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => navigate('/profile/edit')}
            className="text-xs font-display font-bold text-accent px-3 py-1.5 rounded-pill border border-accent/40 bg-accent/10 flex-shrink-0"
          >
            Edit
          </button>
        </div>

        {/* Bento stats */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-accent/10 border border-accent/30 rounded-lg p-4">
            <div className="text-lg mb-1">🎬</div>
            <div className="text-[11px] text-neutral2 mb-1">Episodes watched</div>
            <div className="font-display font-black text-2xl text-accent">{sub.episodes_watched ?? 0}</div>
            <div className="text-[10px] text-muted">{isLifetime ? 'lifetime total' : 'free trial progress'}</div>
          </div>
          <div className="bg-success/10 border border-success/30 rounded-lg p-4">
            <div className="text-lg mb-1">🔥</div>
            <div className="text-[11px] text-neutral2 mb-1">Day streak</div>
            <div className="font-display font-black text-2xl text-success">{history.length > 0 ? Math.min(history.length, 7) : 0}</div>
            <div className="text-[10px] text-muted">keep it going!</div>
          </div>
          <div className="bg-paper-2 border border-rule rounded-lg p-4">
            <div className="text-[11px] text-neutral2 mb-1">Continue watching</div>
            <div className="font-display font-black text-2xl text-ink">{history.length}</div>
            <div className="text-[10px] text-muted">in progress</div>
          </div>
          <div className="bg-paper-2 border border-rule rounded-lg p-4">
            <div className="text-[11px] text-neutral2 mb-1">Watchlist</div>
            <div className="font-display font-black text-2xl text-ink">{watchlist.length}</div>
            <div className="text-[10px] text-muted">saved to watch</div>
          </div>
        </div>

        {/* Referral share card */}
        {referral && (
          <div className="bg-accent/10 border border-accent/30 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-1.5 mb-1 text-accent text-xs font-display font-bold">
              <Share2 size={13} /> Invite friends, earn commission
            </div>
            <p className="text-[11px] text-neutral2 mb-3">
              Your code <span className="font-mono text-ink font-bold">{referral.code}</span> gives friends a discount —
              you earn a commission on every lifetime purchase.
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 px-3 py-2 bg-paper-3 border border-rule rounded-md text-xs text-neutral2 truncate">
                {referral.share_url}
              </div>
              <button
                type="button"
                onClick={copyShareLink}
                className="flex-shrink-0 w-9 h-9 rounded-md bg-accent text-black flex items-center justify-center"
                aria-label="Copy referral link"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
            <div className="flex gap-4 mt-3 text-[11px] text-muted">
              <span>Sign-ups: <span className="text-ink font-bold">{referral.stats?.signups ?? 0}</span></span>
              <span>Conversions: <span className="text-ink font-bold">{referral.stats?.conversions ?? 0}</span></span>
              <span>Available: <span className="text-ink font-bold">₱{(referral.available_balance_php ?? 0).toLocaleString()}</span></span>
            </div>
            <Link
              to="/withdraw"
              className="mt-3 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-pill bg-accent text-black text-xs font-display font-bold"
            >
              <Wallet size={13} /> Withdraw earnings
            </Link>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-paper-2 rounded-pill p-1">
          {['watchlist', 'history', 'settings'].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => selectTab(t)}
              className={`flex-1 py-2 rounded-pill text-xs font-display font-bold capitalize transition-colors ${
                tab === t ? 'bg-accent text-black' : 'text-neutral2'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Watchlist tab */}
        {tab === 'watchlist' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {watchlist.length === 0 && (
              <div className="col-span-2 sm:col-span-3 text-center py-10 text-xs text-muted font-outlier">
                Your watchlist is empty. Browse dramas to add some!
              </div>
            )}
            {watchlist.map((item) => (
              <div key={item.drama_id} className="bg-paper-2 border border-rule rounded-lg overflow-hidden relative group">
                <Link to={`/drama/${item.drama_id}`} className="block">
                  <div className="relative aspect-[3/4] bg-paper-3 overflow-hidden">
                    {item.cover && <LazyImage src={item.cover} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="p-2">
                    <div className="text-xs font-bold text-ink truncate">{item.title}</div>
                    <div className="text-[10px] text-muted capitalize">{item.provider}</div>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => handleRemoveWatchlist(item.drama_id)}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center"
                  aria-label="Remove from watchlist"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* History tab */}
        {tab === 'history' && (
          <div className="space-y-2">
            {history.length === 0 && (
              <div className="text-center py-10 text-xs text-muted font-outlier">No watch history yet.</div>
            )}
            {history.map((item) => (
              <Link
                key={item.drama_id}
                to={`/watch/${item.drama_id}?ep=${item.episode_num || 1}`}
                className="flex items-center gap-3 p-2 rounded-md hover:bg-paper-2"
              >
                <div className="w-14 h-14 rounded-md bg-paper-3 overflow-hidden flex-shrink-0">
                  {item.cover && <LazyImage src={item.cover} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-ink truncate">{item.title}</div>
                  <div className="text-xs text-muted">Episode {item.episode_num} · {Math.round(item.progress_pct || 0)}% watched</div>
                </div>
                <Clock size={14} className="text-muted flex-shrink-0" />
              </Link>
            ))}
          </div>
        )}

        {/* Settings tab */}
        {tab === 'settings' && (
          <div className="space-y-1">
            <p className="text-[11px] font-outlier text-muted uppercase mt-2 mb-2">Account</p>
            <SettingsRow icon={UserIcon} label="Edit Profile" to="/profile/edit" />
            <SettingsRow icon={Lock} label="Change Password" to="/profile/password" />
            <SettingsRow icon={Smartphone} label="Linked Devices" value="1 / 3" to="/profile/devices" />

            <p className="text-[11px] font-outlier text-muted uppercase mt-5 mb-2">Preferences</p>
            <SettingsRow
              icon={Globe2}
              label="Language"
              value={langLabel[lang]}
              onClick={() => cycleLang(lang, setLang, 'preferred_lang')}
            />
            <SettingsRow
              icon={Captions}
              label="Subtitles"
              value={langLabel[subsLang]}
              onClick={() => cycleLang(subsLang, setSubsLang, 'preferred_subs')}
            />
            <ToggleRow
              icon={PlayCircle}
              label="Autoplay next episode"
              checked={autoplay}
              onChange={(v) => setToggle('pref_autoplay', v, setAutoplay)}
            />
            <ToggleRow
              icon={Wifi}
              label="Data saver"
              checked={dataSaver}
              onChange={(v) => setToggle('pref_data_saver', v, setDataSaver)}
            />
            <ToggleRow
              icon={Bell}
              label="Push notifications"
              checked={notifications}
              onChange={(v) => setToggle('pref_notifications', v, setNotifications)}
            />

            <p className="text-[11px] font-outlier text-muted uppercase mt-5 mb-2">Support</p>
            <SettingsRow icon={LifeBuoy} label="Help & Support" to="/help" />
            <SettingsRow icon={Wallet} label="Withdraw Earnings" value="min ₱100" to="/withdraw" />
            <SettingsRow icon={RotateCcw} label="Request Refund" value="7-day guarantee" to="/refund" />

            {user?.is_admin && (
              <>
                <p className="text-[11px] font-outlier text-muted uppercase mt-5 mb-2">Admin</p>
                <SettingsRow icon={ShieldCheck} label="Command Centre" value="admin only" to="/admin" />
              </>
            )}

            {!isLifetime && (
              <Link
                to="/upgrade"
                className="w-full flex items-center justify-center gap-2 py-3 mt-5 bg-accent text-black font-display font-bold text-xs rounded-pill"
              >
                Unlock Lifetime Access
              </Link>
            )}

            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 py-3.5 mt-4 bg-transparent border border-error/50 text-error rounded-pill text-sm font-display font-bold hover:bg-error/10 active:scale-[0.98] transition-all"
            >
              <LogOut size={16} /> Sign Out
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function SettingsRow({ icon: Icon, label, value, onClick, to }) {
  const className = 'w-full flex items-center gap-3 p-3.5 bg-paper-2 border border-rule rounded-md hover:bg-paper-3 transition-colors text-left'
  const body = (
    <>
      <Icon size={16} className="text-neutral2 flex-shrink-0" />
      <span className="flex-1 text-sm text-ink">{label}</span>
      {value && <span className="text-xs text-muted">{value}</span>}
      <ChevronRight size={14} className="text-muted flex-shrink-0" />
    </>
  )

  if (to) {
    return (
      <Link to={to} className={className}>
        {body}
      </Link>
    )
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  )
}

function ToggleRow({ icon: Icon, label, checked, onChange }) {
  return (
    <div className="flex items-center gap-3 p-3.5 bg-paper-2 border border-rule rounded-md">
      <Icon size={16} className="text-neutral2 flex-shrink-0" />
      <span className="flex-1 text-sm text-ink">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full p-0.5 transition-colors ${
          checked ? 'bg-accent' : 'bg-paper-4'
        }`}
      >
        <span
          className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}
