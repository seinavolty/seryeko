import React, { useEffect, useRef, useState } from 'react'

/**
 * Only fetches the image when it nears the viewport.
 * Use `priority` for above-the-fold heroes so they load immediately.
 */
export default function LazyImage({
  src,
  alt = '',
  className = '',
  priority = false,
  rootMargin = '200px',
  placeholderClassName = 'bg-paper-3',
  onError,
  ...rest
}) {
  const imgRef = useRef(null)
  const [activeSrc, setActiveSrc] = useState(priority ? src : undefined)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setLoaded(false)
    setFailed(false)

    if (!src) {
      setActiveSrc(undefined)
      return
    }

    if (priority) {
      setActiveSrc(src)
      return
    }

    const el = imgRef.current
    if (!el) return

    // Fallback: native lazy if IntersectionObserver unavailable
    if (typeof IntersectionObserver === 'undefined') {
      setActiveSrc(src)
      return
    }

    setActiveSrc(undefined)
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setActiveSrc(src)
          observer.disconnect()
        }
      },
      { rootMargin, threshold: 0.01 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [src, priority, rootMargin])

  if (failed || !src) {
    return (
      <div
        ref={imgRef}
        className={`${placeholderClassName} ${className}`}
        aria-hidden={alt ? undefined : true}
        {...rest}
      />
    )
  }

  return (
    <img
      ref={imgRef}
      src={activeSrc}
      alt={alt}
      className={`${className} ${loaded ? '' : placeholderClassName}`}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={priority ? 'high' : 'low'}
      onLoad={() => setLoaded(true)}
      onError={(e) => {
        setFailed(true)
        onError?.(e)
      }}
      {...rest}
    />
  )
}
