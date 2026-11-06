import React, { useEffect, useRef } from 'react'

/** Full-bleed SeryeKo brand loop — loading splash & stream fallback. */
export const BRAND_VIDEO_SRC = '/samples/brand.mp4'

export default function BrandSplashVideo({
  className = '',
  overlay = true,
  label = '',
  poster = '/logo.png',
}) {
  const ref = useRef(null)

  useEffect(() => {
    const v = ref.current
    if (!v) return undefined
    v.muted = true
    v.defaultMuted = true
    v.playsInline = true
    const play = () => {
      v.play().catch(() => {})
    }
    play()
    v.addEventListener('canplay', play)
    return () => v.removeEventListener('canplay', play)
  }, [])

  return (
    <div className={`absolute inset-0 overflow-hidden bg-black ${className}`}>
      <video
        ref={ref}
        src={BRAND_VIDEO_SRC}
        className="absolute inset-0 w-full h-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        poster={poster}
        aria-hidden="true"
      />
      {/* Soft vignette so chrome/text stay readable; keeps black-page blend */}
      {overlay && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.35) 100%)',
          }}
        />
      )}
      {label ? (
        <div className="absolute inset-x-0 bottom-16 z-10 flex flex-col items-center gap-2 pointer-events-none">
          <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
          <p className="text-[11px] text-white/70 font-outlier tracking-wide">{label}</p>
        </div>
      ) : null}
    </div>
  )
}
