import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom'
import Hls from 'hls.js'
import {
  ArrowLeft, Settings, Play, Heart, Share2, ChevronUp,
  Volume2, VolumeX, Captions, ChevronDown, Sparkles, Flag,
} from 'lucide-react'
import { fetchEpisodes, recordWatchEpisode, fetchDramaDetail, reportVideoIssue, toggleEpisodeLike } from '../api/client'
import { useAuthStore } from '../store/authStore'
import PaywallSheet from '../components/PaywallSheet'
import BrandSplashVideo from '../components/BrandSplashVideo'
import { needsDrmDecrypt } from '../lib/meloloDecrypt'

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function isHlsUrl(url) {
  if (!url) return false
  return url.includes('.m3u8') || url.includes('application/vnd.apple.mpegurl')
}

function needsHlsProxy(url) {
  if (!url || !/^https?:\/\//i.test(url)) return false
  // Progressive MP4 CDNs already have CORS — proxying downloads the whole file and hits rate limits
  const lower = url.toLowerCase()
  if (lower.includes('.m3u8') || lower.includes('mpegurl')) {
    // ShortsWave gateway playlists + /api/proxy/ts segments already send CORS *
    // Proxying them double-encodes huge GCS signed URLs and often fails in-browser
    if (lower.includes('shortwave.goodbos.online') || lower.includes('shortswave.com')) {
      return false
    }
    return true
  }
  if (/(^|\.)shortolol\.com\//i.test(url) || lower.includes('shortolol.com/')) return false
  // Melolo progressive MP4 (often no .mp4 in path — mime_type=video_mp4 query)
  if (lower.includes('melolostatic.com') || lower.includes('mime_type=video')) return false
  if (lower.includes('.mp4') && !lower.includes('workers.dev')) return false
  return true
}

/** DramaWave variants (..._4.m3u8) are video-only; master (...m3u8) carries AAC audio. */
function preferHlsMasterUrl(url) {
  if (!url) return url
  return url.replace(/(adaptiveDynamicStreaming_\d+)_\d+(\.m3u8)/i, '$1$2')
}

/** Melolo CENC → server decrypt + H.264 so browsers without HEVC can play. */
function drmProxyUrl(cdnUrl, drmKey) {
  if (!cdnUrl || !drmKey) return ''
  const token = localStorage.getItem('token') || ''
  if (!token) return ''
  return `/api/content/drm-proxy?url=${encodeURIComponent(cdnUrl)}&key=${encodeURIComponent(drmKey)}&access_token=${encodeURIComponent(token)}`
}

function playableUrl(url, drmKey = '', cfCookies = null) {
  if (!url) return ''
  // Never stream without a JWT — <video> cannot send Authorization headers
  const token = localStorage.getItem('token') || ''
  if (!token) return ''
  if (needsDrmDecrypt(url, drmKey)) {
    return drmProxyUrl(url, drmKey)
  }
  const stream = preferHlsMasterUrl(url)
  if (/^https?:\/\//i.test(stream)) {
    if (!needsHlsProxy(stream)) return stream
    let proxy = `/api/content/hls-proxy?url=${encodeURIComponent(stream)}&access_token=${encodeURIComponent(token)}`
    if (cfCookies?.['CloudFront-Policy'] && cfCookies?.['CloudFront-Signature'] && cfCookies?.['CloudFront-Key-Pair-Id']) {
      proxy += `&cf_policy=${encodeURIComponent(cfCookies['CloudFront-Policy'])}`
      proxy += `&cf_signature=${encodeURIComponent(cfCookies['CloudFront-Signature'])}`
      proxy += `&cf_key_pair_id=${encodeURIComponent(cfCookies['CloudFront-Key-Pair-Id'])}`
    }
    return proxy
  }
  return stream
}

function teardownMedia(video, hlsRef, ignoreErrorRef) {
  if (ignoreErrorRef) ignoreErrorRef.current = true
  if (hlsRef.current) {
    hlsRef.current.destroy()
    hlsRef.current = null
  }
  if (!video) return
  video.pause()
  video.removeAttribute('src')
  video.load()
}

const UNAVAILABLE_TOAST = "This episode isn't available right now. Please try again in a moment."

const MUTE_STORAGE_KEY = 'ds_watch_muted'

function loadWatchMuted() {
  try {
    const v = sessionStorage.getItem(MUTE_STORAGE_KEY)
    // Default muted for autoplay policy; once user unmutes, keep it across episodes
    if (v === '0') return false
    if (v === '1') return true
  } catch {
    /* ignore */
  }
  return true
}

function saveWatchMuted(muted) {
  try {
    sessionStorage.setItem(MUTE_STORAGE_KEY, muted ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function formatLikeCount(n) {
  const num = Number(n) || 0
  if (num >= 1000) {
    const k = num / 1000
    return `${k >= 100 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')}K`
  }
  return String(num)
}

function episodeThumb(ep, drama) {
  return ep?.cover || drama?.cover || drama?.coverImage || ''
}

function EpisodeUnit({
  ep, nextEp, drama, index, total, isActive, shouldLoad, onLike, liked, likeCount, setRef, dramaId, onPlayingChange, onUnavailable,
  muted, onMutedChange, onStreamTokenExpired,
}) {
  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  const isActiveRef = useRef(isActive)
  const mutedRef = useRef(muted)
  const ignoreErrorRef = useRef(false)
  const retryRef = useRef(0)
  const [playing, setPlaying] = useState(false)
  const [descExpanded, setDescExpanded] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [mediaError, setMediaError] = useState(false)
  const [shareFeedback, setShareFeedback] = useState('')
  const [reloadToken, setReloadToken] = useState(0)
  const [hasStarted, setHasStarted] = useState(false)

  isActiveRef.current = isActive
  mutedRef.current = muted

  const applyMute = useCallback((nextMuted, { play = false } = {}) => {
    const video = videoRef.current
    mutedRef.current = nextMuted
    onMutedChange?.(nextMuted)
    if (!video) return
    video.muted = nextMuted
    video.volume = 1
    if (play || (!nextMuted && video.paused && isActiveRef.current)) {
      video.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    }
  }, [onMutedChange])

  const drmKey = ep.drm_key || ''
  const cfCookies = ep.cf_cookies || null
  const isDrm = needsDrmDecrypt(ep.video_url, drmKey)
  // Melolo DRM proxy is heavy (download+transcode) — only start for the active episode
  const streamUrl = (!isDrm || isActive) ? playableUrl(ep.video_url, drmKey, cfCookies) : ''
  const [decryptStatus, setDecryptStatus] = useState('')
  // Fullscreen brand splash while DRM decrypts or the episode media buffers
  const showLoadingSplash = Boolean(
    isActive
    && !mediaError
    && !ep.is_locked
    && (decryptStatus || (shouldLoad && !hasStarted && streamUrl)),
  )
  const chromeVisible = !showLoadingSplash && (
    !playing || ep.is_locked || mediaError || !ep.video_url
  )

  const reportUnavailable = useCallback(() => {
    // Neighbor preload failures shouldn't spam the user — only the active episode
    if (!isActiveRef.current) return
    setMediaError(true)
    setPlaying(false)
    setDecryptStatus('')
    onUnavailable?.(UNAVAILABLE_TOAST, {
      dramaId,
      episodeNum: ep.episode_num,
      episodeId: ep.id,
      title: drama?.title ? `${drama.title} · Ep ${ep.episode_num}` : (ep.title || ''),
      videoUrl: ep.video_url || '',
      details: streamUrl ? `stream=${streamUrl.slice(0, 300)}` : 'empty_stream_url',
    })
  }, [onUnavailable, dramaId, ep, drama, streamUrl])

  const handleLike = (e) => {
    e?.stopPropagation?.()
    onLike?.()
  }

  const handleShare = async (e) => {
    e?.stopPropagation?.()
    const title = drama?.title ? `${drama.title} · Ep ${ep.episode_num}` : (ep.title || 'SeryeKo')
    const url = window.location.href
    const payload = { title, text: `Watch on SeryeKo.com: ${title}`, url }

    try {
      if (typeof navigator.share === 'function') {
        await navigator.share(payload)
        return
      }
    } catch (err) {
      // User cancelled share sheet — don't fall through to clipboard
      if (err?.name === 'AbortError') return
    }

    try {
      await navigator.clipboard.writeText(url)
      setShareFeedback('Link copied')
      setTimeout(() => setShareFeedback(''), 1800)
    } catch {
      setShareFeedback('Copy failed')
      setTimeout(() => setShareFeedback(''), 1800)
    }
  }

  useEffect(() => {
    if (isActive) onPlayingChange?.(playing && !mediaError)
  }, [isActive, playing, mediaError, onPlayingChange])

  // Attach media only inside the load window (active ± 1). Tear down when far away.
  useEffect(() => {
    const video = videoRef.current
    if (!video || ep.is_locked) return undefined

    if (!shouldLoad || (isDrm && !isActive)) {
      teardownMedia(video, hlsRef, ignoreErrorRef)
      setPlaying(false)
      setProgress(0)
      setCurrentTime(0)
      setDuration(0)
      setDecryptStatus('')
      return undefined
    }

    if (!streamUrl) {
      teardownMedia(video, hlsRef, ignoreErrorRef)
      reportUnavailable()
      return undefined
    }

    ignoreErrorRef.current = false
    setMediaError(false)
    setHasStarted(false)
    if (isDrm) setDecryptStatus('Loading episode…')

    const tryPlay = () => {
      if (!isActiveRef.current) return
      setDecryptStatus('')
      video.volume = 1
      video.muted = mutedRef.current
      video.play().then(() => {
        setPlaying(true)
        setHasStarted(true)
      }).catch(() => setPlaying(false))
    }

    const handleFatal = () => {
      // One soft retry — server hls-proxy auto-refreshes expired Vigloo cookies
      if (retryRef.current < 2 && isActiveRef.current) {
        retryRef.current += 1
        setReloadToken((n) => n + 1)
        return
      }
      setDecryptStatus('')
      reportUnavailable()
    }

    if (isHlsUrl(streamUrl)) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          maxBufferLength: isActiveRef.current ? 30 : 6,
          maxMaxBufferLength: isActiveRef.current ? 60 : 12,
          startLevel: -1,
        })
        hlsRef.current = hls
        hls.loadSource(streamUrl)
        hls.attachMedia(video)
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          // Some manifests expose alternate audio; pick the first enabled track
          try {
            if (hls.audioTracks?.length) {
              const preferred = hls.audioTracks.findIndex((t) => t.default || t.autoselect)
              hls.audioTrack = preferred >= 0 ? preferred : 0
            }
          } catch {
            /* ignore */
          }
          tryPlay()
        })
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data?.fatal) return
          if (!isActiveRef.current) {
            teardownMedia(video, hlsRef, ignoreErrorRef)
            return
          }
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR && retryRef.current < 1) {
            retryRef.current += 1
            try {
              hls.startLoad()
              return
            } catch {
              /* fall through */
            }
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && retryRef.current < 1) {
            retryRef.current += 1
            try {
              hls.recoverMediaError()
              return
            } catch {
              /* fall through */
            }
          }
          handleFatal()
        })
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = streamUrl
        video.addEventListener('loadedmetadata', tryPlay, { once: true })
      } else {
        handleFatal()
      }
    } else {
      video.preload = isActiveRef.current ? 'auto' : 'metadata'
      video.src = streamUrl
      video.addEventListener('loadeddata', tryPlay, { once: true })
      video.addEventListener('error', () => {
        if (ignoreErrorRef.current) return
        // drm-proxy first hit can take a while; surface status while waiting
      }, { once: true })
      video.load()
    }

    return () => {
      teardownMedia(video, hlsRef, ignoreErrorRef)
      setDecryptStatus('')
    }
  }, [streamUrl, isDrm, ep.is_locked, shouldLoad, isActive, reloadToken, reportUnavailable])

  // Reset retry budget when this episode becomes the active one
  useEffect(() => {
    if (isActive) {
      retryRef.current = 0
      if (mediaError && streamUrl) {
        setMediaError(false)
        setReloadToken((n) => n + 1)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-arm when becoming active
  }, [isActive])

  // Play/pause when active or mute changes. Next episode keeps a tiny warm buffer.
  useEffect(() => {
    const video = videoRef.current
    if (!video || ep.is_locked || !streamUrl || !shouldLoad) return
    if (isDrm && !isActive) return
    video.volume = 1
    video.muted = muted
    if (hlsRef.current) {
      hlsRef.current.config.maxBufferLength = isActive ? 30 : 4
      hlsRef.current.config.maxMaxBufferLength = isActive ? 60 : 8
    }
    if (isActive) {
      video.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    } else {
      video.pause()
      setPlaying(false)
    }
  }, [isActive, muted, ep.is_locked, isDrm, streamUrl, shouldLoad])

  const togglePlay = (e) => {
    e?.stopPropagation?.()
    const video = videoRef.current
    if (!video || ep.is_locked || !streamUrl || mediaError) return

    // Playing but still muted → first tap turns sound on (don't pause)
    if (!video.paused && (muted || video.muted)) {
      applyMute(false, { play: true })
      setPlaying(true)
      return
    }

    if (video.paused) {
      if (muted || video.muted) applyMute(false)
      else {
        video.volume = 1
        video.muted = false
      }
      video.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    } else {
      video.pause()
      setPlaying(false)
    }
  }

  const handleTimeUpdate = () => {
    const video = videoRef.current
    if (!video || !video.duration) return
    setCurrentTime(video.currentTime)
    setDuration(video.duration)
    setProgress((video.currentTime / video.duration) * 100)
  }

  const skip = (e, seconds) => {
    e.stopPropagation()
    const video = videoRef.current
    if (video) video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + seconds))
  }

  return (
    <section
      ref={setRef}
      data-index={index}
      className="snap-start snap-stop-always h-dvh relative overflow-hidden bg-black"
    >
      {/* Full-bleed player */}
      <div
        className="absolute inset-0 bg-black flex items-center justify-center"
        onClick={togglePlay}
      >
        {ep.is_locked ? (
          <div className="text-center p-6 text-white z-10">
            <div className="w-14 h-14 rounded-full bg-accent/15 text-accent flex items-center justify-center mx-auto mb-3 text-2xl">
              🔒
            </div>
            <p className="text-sm font-display font-bold">Episode Locked</p>
            <p className="text-xs text-neutral2 mt-1">Unlock lifetime access to continue</p>
          </div>
        ) : (
          <>
            {(ep.cover || drama?.cover || drama?.coverImage) && !mediaError && (
              <img
                src={ep.cover || drama?.cover || drama?.coverImage}
                alt=""
                className={`absolute inset-0 w-full h-full object-cover transition-opacity ${playing ? 'opacity-0' : 'opacity-40'}`}
              />
            )}
            <video
              ref={videoRef}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity ${mediaError ? 'opacity-0' : 'opacity-100'}`}
              playsInline
              defaultMuted
              preload={shouldLoad ? (isActive ? 'auto' : 'metadata') : 'none'}
              loop
              poster={ep.cover || drama?.cover || drama?.coverImage || undefined}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleTimeUpdate}
              onPlay={() => {
                setPlaying(true)
                setHasStarted(true)
              }}
              onPause={() => setPlaying(false)}
              onPlaying={() => setHasStarted(true)}
              onError={() => {
                if (ignoreErrorRef.current || !shouldLoad) return
                if (!isActiveRef.current) return
                if (decryptStatus) return
                // Melolo HEVC can emit a transient decode error while frames still paint
                const v = videoRef.current
                if (v && v.videoWidth > 0 && Number.isFinite(v.duration) && v.duration > 0) return
                if (retryRef.current < 1) {
                  retryRef.current += 1
                  setReloadToken((n) => n + 1)
                  return
                }
                reportUnavailable()
              }}
            />
            {/* Brand loop when stream fails / never loads */}
            {mediaError && isActive && (
              <BrandSplashVideo overlay={false} />
            )}
            {/* Fullscreen brand video while decrypting or buffering */}
            {showLoadingSplash && (
              <div className="absolute inset-0 z-[25] pointer-events-none">
                <BrandSplashVideo label={decryptStatus || 'Loading episode…'} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Playback chrome overlay — top bar + center play only */}
      {!ep.is_locked && (
        <div
          className={`absolute inset-0 z-10 flex flex-col justify-between px-3 pt-3 pb-[48%] pointer-events-none transition-opacity duration-300 ${
            chromeVisible ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            background: chromeVisible
              ? 'linear-gradient(to top, rgba(6,6,10,0.35) 0%, transparent 40%), linear-gradient(to bottom, rgba(6,6,10,0.55) 0%, transparent 28%)'
              : 'none',
          }}
        >
          <div className="flex items-center gap-3 pointer-events-auto pl-10">
            <span className="flex-1 font-display font-semibold text-sm text-white truncate">
              {drama?.title || 'SeryeKo'} · Ep {ep.episode_num}
            </span>
            <button className="w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-neutral2">
              <Settings size={15} />
            </button>
          </div>

          <div className="flex items-center justify-center gap-10 pointer-events-auto">
            <button onClick={(e) => skip(e, -10)} className="text-white text-[10px] font-outlier flex flex-col items-center gap-0.5 opacity-85">
              −10
            </button>
            <button
              onClick={togglePlay}
              className="w-14 h-14 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center text-white"
            >
              <Play size={22} fill="currentColor" />
            </button>
            <button onClick={(e) => skip(e, 10)} className="text-white text-[10px] font-outlier flex flex-col items-center gap-0.5 opacity-85">
              +10
            </button>
          </div>

          {/* spacer — progress lives in the detail panel below */}
          <div />
        </div>
      )}

      {/* Bottom sheet: controls ABOVE episode detail (matches design when paused) */}
      <div
        className={`absolute inset-x-0 bottom-0 z-20 px-4 pt-3 pb-5 flex flex-col transition-all duration-300 ease-out ${
          chromeVisible
            ? 'translate-y-0 opacity-100'
            : 'translate-y-full opacity-0 pointer-events-none'
        }`}
        style={{
          background: 'linear-gradient(to top, rgba(6,6,10,0.97) 60%, rgba(6,6,10,0.88) 82%, transparent)',
          maxHeight: '48%',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {!ep.is_locked && (
          <div className="flex flex-col gap-2.5 mb-3">
            <div className="flex items-center gap-2.5">
              <span className="font-outlier text-[10px] text-white/80 tabular-nums w-10 shrink-0">
                {formatTime(currentTime)}
              </span>
              <div
                className="flex-1 h-[3px] rounded-pill bg-white/25 relative cursor-pointer"
                onClick={(e) => {
                  const video = videoRef.current
                  if (!video || !video.duration) return
                  const rect = e.currentTarget.getBoundingClientRect()
                  const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
                  video.currentTime = ratio * video.duration
                }}
              >
                <div className="h-full rounded-pill bg-accent relative" style={{ width: `${progress}%` }}>
                  <span className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3 h-3 rounded-full bg-accent border-2 border-white shadow" />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between px-0.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  applyMute(!muted, { play: true })
                }}
                className="flex items-center gap-1.5 text-white/85 text-[11px] font-outlier"
                aria-label={muted ? 'Unmute' : 'Mute'}
              >
                {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                {muted ? 'Muted' : 'Vol'}
              </button>
              <span className="font-outlier text-[10px] text-accent border border-accent/40 bg-accent/10 rounded-pill px-2.5 py-0.5">
                HD
              </span>
              <button
                type="button"
                className="flex items-center gap-1 text-white/70 text-[11px] font-outlier"
                aria-label="Captions"
              >
                <Captions size={14} /> CC
              </button>
            </div>
          </div>
        )}

        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0">
            <div className="font-outlier text-[10px] uppercase tracking-widest text-accent mb-1 truncate">
              Episode {ep.episode_num} · {drama?.title}
            </div>
            <h2 className="font-display font-bold text-lg text-white truncate">{ep.title}</h2>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-2 text-xs text-white/55 flex-wrap">
          {(duration > 0 || ep.duration) && (
            <span>{duration > 0 ? `${Math.round(duration / 60) || 1} min` : `${ep.duration}s`}</span>
          )}
          {drama?.genre?.slice(0, 2).map((g) => (
            <span key={g} className="bg-white/10 border border-white/10 rounded-pill px-2 py-0.5 text-[10px] text-white/70">{g}</span>
          ))}
          {drama?.provider && (
            <span className="bg-white/10 border border-white/10 rounded-pill px-2 py-0.5 text-[10px] text-white/70 capitalize">
              {drama.provider}
            </span>
          )}
        </div>

        <p className={`text-sm text-white/60 leading-relaxed mb-1 ${descExpanded ? '' : 'line-clamp-2'}`}>
          {drama?.synopsis || drama?.summary}
        </p>
        <button onClick={() => setDescExpanded((s) => !s)} className="text-xs text-accent font-semibold mb-3 self-start">
          {descExpanded ? 'Show less' : 'Show more'}
        </button>

        {index < total - 1 && (
          <div className="flex items-center gap-3 p-2.5 bg-white/8 border border-white/10 rounded-lg mt-auto">
            <div className="relative w-14 h-10 rounded-sm bg-white/10 overflow-hidden flex-shrink-0">
              {episodeThumb(nextEp, drama) ? (
                <img
                  src={episodeThumb(nextEp, drama)}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  loading="lazy"
                />
              ) : null}
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <Play size={12} className="text-white/80" fill="currentColor" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-white/40 font-outlier uppercase">▾ next episode</div>
              <div className="text-xs font-display font-semibold text-white truncate">
                {nextEp?.title || `Ep ${index + 2}`}
              </div>
            </div>
            <ChevronDown size={16} className="text-white/40 flex-shrink-0" />
          </div>
        )}
        {index === total - 1 && (
          <Link to={`/drama/${dramaId}`} className="flex items-center gap-3 p-2.5 bg-white/8 border border-white/10 rounded-lg mt-auto">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-white/40 font-outlier uppercase">📋 all episodes</div>
              <div className="text-xs font-display font-semibold text-white truncate">{drama?.title} — Episode List</div>
            </div>
            <ChevronUp size={16} className="text-white/40 flex-shrink-0 rotate-90" />
          </Link>
        )}
      </div>

      {/* Side actions — mute always visible; heart/share stay when chrome shows or while muted */}
      <div
        className={`absolute right-3 top-[38%] z-40 flex flex-col items-center gap-4 transition-opacity duration-300 ${
          !showLoadingSplash && (chromeVisible || muted) ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            applyMute(!muted, { play: true })
          }}
          className="flex flex-col items-center gap-1 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)]"
          aria-label={muted ? 'Unmute' : 'Mute'}
          aria-pressed={!muted}
        >
          <div className={`w-10 h-10 rounded-full backdrop-blur-sm flex items-center justify-center border ${
            muted ? 'bg-accent text-white border-accent/50' : 'bg-black/55 border-white/10'
          }`}
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </div>
          <span className="text-[10px] font-outlier">{muted ? 'Muted' : 'Sound'}</span>
        </button>
        <button
          type="button"
          onClick={handleLike}
          className="flex flex-col items-center gap-1 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)]"
          aria-pressed={liked}
          aria-label={liked ? 'Unlike episode' : 'Like episode'}
        >
          <div className={`w-10 h-10 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center border border-white/10 ${liked ? 'text-accent' : ''}`}>
            <Heart size={18} fill={liked ? 'currentColor' : 'none'} />
          </div>
          <span className="text-[10px] font-outlier tabular-nums">{formatLikeCount(likeCount)}</span>
        </button>
        <button
          type="button"
          onClick={handleShare}
          className="flex flex-col items-center gap-1 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)]"
          aria-label="Share episode"
        >
          <div className="w-10 h-10 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center border border-white/10">
            <Share2 size={16} />
          </div>
          <span className="text-[10px] font-outlier">{shareFeedback || 'Share'}</span>
        </button>
      </div>
    </section>
  )
}

export default function Watch() {
  const { dramaId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { isAuthenticated } = useAuthStore()
  const requestedEp = Number.parseInt(searchParams.get('ep') || '', 10)
  const watchPath = Number.isFinite(requestedEp) && requestedEp > 0
    ? `/watch/${dramaId}?ep=${requestedEp}`
    : `/watch/${dramaId}`

  const [data, setData] = useState(null)
  const [drama, setDrama] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeIndex, setActiveIndex] = useState(0)
  const [showPaywall, setShowPaywall] = useState(false)
  const [likedEps, setLikedEps] = useState(() => new Set())
  const [likeCounts, setLikeCounts] = useState({})
  const [likeBusy, setLikeBusy] = useState(false)
  const [showTrialPill, setShowTrialPill] = useState(true)
  const [activePlaying, setActivePlaying] = useState(false)
  const [watchMuted, setWatchMuted] = useState(() => loadWatchMuted())
  const [toast, setToast] = useState('')
  const [reportCtx, setReportCtx] = useState(null)
  const [reportBusy, setReportBusy] = useState(false)
  const [reportDone, setReportDone] = useState(false)
  const toastTimerRef = useRef(null)
  const didJumpToEpisode = useRef(false)
  const lastSyncedEp = useRef(null)
  const ignoreIntersectUntil = useRef(0)
  const jumpTargetIdx = useRef(null)

  const syncEpisodeUrl = useCallback((epNum) => {
    const n = Number(epNum)
    if (!Number.isFinite(n) || n < 1) return
    if (lastSyncedEp.current === n) return
    lastSyncedEp.current = n
    // Use replaceState (not React Router setSearchParams) — iOS Safari resets
    // snap-scroll position when the router updates search params mid-swipe.
    const next = `/watch/${dramaId}?ep=${n}`
    const cur = `${window.location.pathname}${window.location.search}`
    if (cur !== next) {
      window.history.replaceState(window.history.state, '', next)
    }
  }, [dramaId])

  const handleMutedChange = useCallback((next) => {
    setWatchMuted(next)
    saveWatchMuted(next)
  }, [])

  const sectionRefs = useRef([])
  const containerRef = useRef(null)

  const showToast = useCallback((message, ctx = null) => {
    setToast(message)
    setReportDone(false)
    setReportCtx(ctx)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    const ttl = ctx ? 12000 : 3800
    toastTimerRef.current = setTimeout(() => {
      setToast('')
      setReportCtx(null)
    }, ttl)
  }, [])

  const handleUnavailable = useCallback((message, ctx) => {
    showToast(message, ctx)
  }, [showToast])

  const streamRefreshBusy = useRef(false)
  const handleStreamTokenExpired = useCallback(() => {
    if (streamRefreshBusy.current) return
    streamRefreshBusy.current = true
    showToast('Refreshing stream link…')
    fetchEpisodes(dramaId, { refresh: true })
      .then((res) => {
        if (res?.authenticated === false || res?.episodes?.some((ep) => ep.requires_login)) {
          useAuthStore.getState().logout()
          navigate(`/login?next=${encodeURIComponent(watchPath)}`, { replace: true })
          return
        }
        setData(res)
        setToast('')
      })
      .catch((err) => {
        console.error(err)
        showToast(UNAVAILABLE_TOAST)
      })
      .finally(() => {
        streamRefreshBusy.current = false
      })
  }, [dramaId, navigate, showToast, watchPath])

  const submitReport = async () => {
    if (!reportCtx || reportBusy || reportDone) return
    setReportBusy(true)
    try {
      await reportVideoIssue({
        dramaId: reportCtx.dramaId,
        episodeNum: reportCtx.episodeNum,
        episodeId: reportCtx.episodeId,
        title: reportCtx.title,
        videoUrl: reportCtx.videoUrl,
        reason: 'playback_failed',
        details: reportCtx.details || '',
      })
      setReportDone(true)
      setToast('Thanks — we received your report.')
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      toastTimerRef.current = setTimeout(() => {
        setToast('')
        setReportCtx(null)
        setReportDone(false)
      }, 2800)
    } catch (err) {
      console.error(err)
      setToast(err?.response?.data?.detail || 'Could not send report. Try again.')
    } finally {
      setReportBusy(false)
    }
  }

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
  }, [])

  // Reset jump flag when switching dramas (not on every ?ep= sync from scrolling)
  useEffect(() => {
    didJumpToEpisode.current = false
  }, [dramaId])

  // Watching requires login
  useEffect(() => {
    if (!isAuthenticated) {
      navigate(`/login?next=${encodeURIComponent(watchPath)}`, { replace: true })
    }
  }, [isAuthenticated, watchPath, navigate])

  useEffect(() => {
    if (!isAuthenticated) return
    let active = true
    setLoading(true)

    // Episodes unlock playback — don't wait on detail for first frame
    fetchEpisodes(dramaId)
      .then((res) => {
        if (!active) return
        if (res?.authenticated === false || res?.episodes?.some((ep) => ep.requires_login)) {
          useAuthStore.getState().logout()
          navigate(`/login?next=${encodeURIComponent(watchPath)}`, { replace: true })
          return
        }
        setData(res)
        const counts = res?.like_counts || {}
        setLikeCounts(
          Object.fromEntries(
            Object.entries(counts).map(([k, v]) => [String(k), Number(v) || 0]),
          ),
        )
        setLikedEps(new Set((res?.liked_episodes || []).map((n) => Number(n))))
        setLoading(false)
      })
      .catch((err) => {
        console.error(err)
        if (err?.response?.status === 401) {
          useAuthStore.getState().logout()
          navigate(`/login?next=${encodeURIComponent(watchPath)}`, { replace: true })
        }
        if (active) setLoading(false)
      })

    fetchDramaDetail(dramaId)
      .then((detail) => {
        if (active) setDrama(detail)
      })
      .catch(() => {})

    return () => { active = false }
  }, [dramaId, isAuthenticated, navigate, watchPath])

  // Vigloo CloudFront cookies expire ~20 min — proactively refresh while watching
  useEffect(() => {
    if (!isAuthenticated || !String(dramaId || '').startsWith('vigloo_')) return undefined
    const timer = setInterval(() => {
      fetchEpisodes(dramaId, { refresh: true })
        .then((res) => {
          if (res?.episodes?.length) {
            setData(res)
            if (res.like_counts) {
              setLikeCounts(
                Object.fromEntries(
                  Object.entries(res.like_counts).map(([k, v]) => [String(k), Number(v) || 0]),
                ),
              )
            }
            if (Array.isArray(res.liked_episodes)) {
              setLikedEps(new Set(res.liked_episodes.map((n) => Number(n))))
            }
          }
        })
        .catch(() => {})
    }, 8 * 60 * 1000)
    return () => clearInterval(timer)
  }, [dramaId, isAuthenticated])

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-xs text-muted font-outlier">
        Redirecting to login…
      </div>
    )
  }

  const episodes = data?.episodes || []
  const chromeVisible = !activePlaying

  const handleIntersect = useCallback(
    (idx) => {
      if (Date.now() < ignoreIntersectUntil.current) {
        if (jumpTargetIdx.current != null && idx !== jumpTargetIdx.current) return
      }
      setActiveIndex(idx)
      const ep = episodes[idx]
      if (!ep) return

      if (ep.is_locked && !data?.is_lifetime) {
        setShowPaywall(true)
        return
      }

      setShowTrialPill(true)
      const t = setTimeout(() => setShowTrialPill(false), 4000)

      syncEpisodeUrl(ep.episode_num)

      if (isAuthenticated) {
        recordWatchEpisode(dramaId, ep.episode_num)
          .then((res) => {
            if (typeof res?.episodes_watched === 'number') {
              const current = useAuthStore.getState().user
              const prevSub = current?.subscription || {}
              useAuthStore.getState().updateUserSubscription({
                ...prevSub,
                episodes_watched: res.episodes_watched,
                status: res.status || prevSub.status,
              })
            }
          })
          .catch(() => {})
      }
      return () => clearTimeout(t)
    },
    [episodes, data, dramaId, isAuthenticated, syncEpisodeUrl]
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container || episodes.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting)
        if (!visible.length) return
        // iOS snap-scroll can report multiple sections; pick the most visible one
        visible.sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        const idx = parseInt(visible[0].target.dataset.index, 10)
        if (Number.isFinite(idx)) handleIntersect(idx)
      },
      { threshold: [0.55, 0.75, 0.95], root: container }
    )

    sectionRefs.current.forEach((el) => el && observer.observe(el))
    return () => observer.disconnect()
  }, [episodes.length, handleIntersect])

  // Jump once on load: prefer ?ep=, else server resume_episode
  useEffect(() => {
    if (loading || episodes.length === 0 || didJumpToEpisode.current) return

    const fromUrl = Number.isFinite(requestedEp) && requestedEp > 0 ? requestedEp : null
    const fromProgress = Number.parseInt(data?.resume_episode, 10)
    const targetEp = fromUrl
      || (Number.isFinite(fromProgress) && fromProgress > 0 ? fromProgress : null)

    if (!targetEp) {
      didJumpToEpisode.current = true
      if (episodes[0]?.episode_num) syncEpisodeUrl(episodes[0].episode_num)
      return
    }

    const idx = episodes.findIndex((ep) => ep.episode_num === targetEp)
    if (idx < 0) {
      didJumpToEpisode.current = true
      return
    }

    didJumpToEpisode.current = true
    jumpTargetIdx.current = idx
    ignoreIntersectUntil.current = Date.now() + 500
    setActiveIndex(idx)
    syncEpisodeUrl(targetEp)

    const jump = () => {
      const el = sectionRefs.current[idx]
      if (!el) return
      el.scrollIntoView({ block: 'start', behavior: 'auto' })
      handleIntersect(idx)
      window.setTimeout(() => {
        jumpTargetIdx.current = null
      }, 520)
    }
    requestAnimationFrame(() => requestAnimationFrame(jump))
  }, [loading, episodes, requestedEp, data?.resume_episode, handleIntersect, syncEpisodeUrl])

  const toggleLike = async (ep) => {
    if (!ep || likeBusy) return
    const epNum = Number(ep.episode_num)
    if (!Number.isFinite(epNum) || epNum < 1) return

    const wasLiked = likedEps.has(epNum)
    const prevCount = Number(likeCounts[String(epNum)] || 0)

    // Optimistic UI
    setLikedEps((prev) => {
      const next = new Set(prev)
      if (wasLiked) next.delete(epNum)
      else next.add(epNum)
      return next
    })
    setLikeCounts((prev) => ({
      ...prev,
      [String(epNum)]: Math.max(0, prevCount + (wasLiked ? -1 : 1)),
    }))

    setLikeBusy(true)
    try {
      const res = await toggleEpisodeLike(dramaId, epNum)
      setLikedEps((prev) => {
        const next = new Set(prev)
        if (res?.liked) next.add(epNum)
        else next.delete(epNum)
        return next
      })
      if (typeof res?.count === 'number') {
        setLikeCounts((prev) => ({ ...prev, [String(epNum)]: res.count }))
      }
    } catch (err) {
      console.error(err)
      // Revert optimistic update
      setLikedEps((prev) => {
        const next = new Set(prev)
        if (wasLiked) next.add(epNum)
        else next.delete(epNum)
        return next
      })
      setLikeCounts((prev) => ({ ...prev, [String(epNum)]: prevCount }))
    } finally {
      setLikeBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="relative min-h-dvh bg-black overflow-hidden">
        <BrandSplashVideo label="Loading player…" />
      </div>
    )
  }

  if (episodes.length === 0) {
    return (
      <div className="relative min-h-dvh bg-black flex flex-col items-center justify-center gap-4 px-6 text-center overflow-hidden">
        <BrandSplashVideo overlay />
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="absolute top-3 left-3 z-20 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white"
        >
          <ArrowLeft size={15} />
        </button>
        <div className="relative z-10 flex flex-col items-center gap-4">
          <p className="text-white font-display font-bold text-lg leading-snug">
            Stream not available yet
          </p>
          <p className="text-sm text-white/55 max-w-sm leading-relaxed">
            {(drama || data)?.provider === 'cubetv'
              ? 'CubeTV has listed this title, but playable episodes are not published yet. Try another drama.'
              : 'No playable episodes were returned for this title. Try another drama or check back later.'}
          </p>
          <Link
            to="/"
            className="mt-2 px-5 py-2.5 rounded-pill bg-white text-black text-sm font-display font-bold"
          >
            Browse dramas
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="relative bg-black">
      <div
        ref={containerRef}
        className="h-dvh overflow-y-scroll scroll-snap-y no-scrollbar"
      >
        {episodes.map((ep, idx) => {
          const epNum = Number(ep.episode_num)
          const liked = likedEps.has(epNum)
          const likeCount = Number(likeCounts[String(epNum)] || 0)
          return (
            <EpisodeUnit
              key={ep.id}
              ep={ep}
              nextEp={episodes[idx + 1]}
              drama={drama || data}
              index={idx}
              total={episodes.length}
              isActive={activeIndex === idx}
              shouldLoad={!ep.is_locked && (idx === activeIndex || idx === activeIndex + 1)}
              liked={liked}
              likeCount={likeCount}
              onLike={() => toggleLike(ep)}
              dramaId={dramaId}
              setRef={(el) => { sectionRefs.current[idx] = el }}
              onPlayingChange={setActivePlaying}
              onUnavailable={handleUnavailable}
              onStreamTokenExpired={handleStreamTokenExpired}
              muted={watchMuted}
              onMutedChange={handleMutedChange}
            />
          )
        })}
      </div>

      <button
        onClick={() => navigate(-1)}
        className={`fixed top-3 left-3 z-30 w-8 h-8 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-white transition-opacity duration-300 ${
          chromeVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <ArrowLeft size={15} />
      </button>

      {showTrialPill && episodes[activeIndex] && !episodes[activeIndex].is_locked && (
        <div
          className={`fixed top-3 right-3 z-30 bg-success/20 border border-success/40 text-success text-[11px] font-bold px-3 py-1 rounded-pill flex items-center gap-1.5 backdrop-blur-md transition-opacity duration-300 ${
            chromeVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <Sparkles size={12} />
          {data?.is_lifetime
            ? 'LIFETIME UNLOCKED'
            : `FREE TRIAL · EP ${activeIndex + 1} OF ${data?.free_trial_episodes || 3}`}
        </div>
      )}

      {toast && (
        <div
          role="status"
          className="fixed left-1/2 bottom-24 z-50 -translate-x-1/2 max-w-[min(92vw,22rem)] px-4 py-3 rounded-xl bg-black/85 border border-white/15 text-white text-center shadow-lg backdrop-blur-md"
        >
          <p className="text-sm font-display font-semibold leading-snug">{toast}</p>
          {reportCtx && !reportDone && (
            <button
              type="button"
              onClick={submitReport}
              disabled={reportBusy}
              className="mt-2.5 inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-pill bg-white/12 border border-white/25 text-xs font-bold text-white disabled:opacity-60"
            >
              <Flag size={12} />
              {reportBusy ? 'Sending…' : 'Report this video'}
            </button>
          )}
        </div>
      )}

      <PaywallSheet
        open={showPaywall}
        onClose={() => setShowPaywall(false)}
        freeEpisodes={data?.free_trial_episodes || 3}
      />
    </div>
  )
}
