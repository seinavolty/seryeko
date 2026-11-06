import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Eye, LogIn } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { getGoogleLoginUrl } from '../api/client'

function tokenFromHash() {
  const hash = window.location.hash.replace(/^#/, '')
  if (!hash) return null
  const params = new URLSearchParams(hash)
  return params.get('token')
}

export default function Login() {
  const navigate = useNavigate()
  const { login, loginWithToken } = useAuthStore()
  const [searchParams] = useSearchParams()
  const nextPath = searchParams.get('next') || '/home'
  const oauthError = searchParams.get('error')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(
    oauthError ? 'Google sign-in failed. Please try again.' : ''
  )

  useEffect(() => {
    const token = tokenFromHash()
    if (!token) return

    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        await loginWithToken(token)
        // Clear token from URL so it isn't reused / leaked via history
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
        if (!cancelled) {
          navigate(nextPath.startsWith('/') ? nextPath : '/home', { replace: true })
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.detail || 'Google sign-in failed. Please try again.')
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [loginWithToken, navigate, nextPath])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await login(email, password)
      navigate(nextPath.startsWith('/') ? nextPath : '/home')
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid login credentials')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    setError('')
    try {
      const url = await getGoogleLoginUrl()
      window.location.href = url
    } catch (err) {
      setError(err.response?.data?.detail || 'Google sign-in is unavailable right now')
    }
  }

  return (
    <div className="min-h-dvh grid lg:grid-cols-2 bg-paper text-ink">
      {/* Visual panel — desktop only */}
      <aside className="hidden lg:flex relative flex-col justify-end p-12 bg-paper-2 overflow-hidden">
        <div className="absolute inset-0 grid grid-cols-3 grid-rows-4 gap-1 opacity-55">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="rounded-md bg-gradient-to-br from-accent/30 via-purple-500/20 to-paper-3" />
          ))}
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-paper via-paper/50 to-transparent" />
        <div className="relative z-10">
          <p className="font-display font-extrabold text-3xl leading-tight mb-3">
            40+ providers.<br />
            <em className="not-italic text-accent">One login.</em><br />
            Forever yours.
          </p>
          <p className="text-sm text-neutral2">Korean · Chinese · Thai · Filipino dramas</p>
        </div>
      </aside>

      {/* Form panel */}
      <main className="flex flex-col items-center justify-center p-8 sm:p-12 min-h-dvh">
        <div className="w-full max-w-sm">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted mb-10 hover:text-neutral2">
            <ArrowLeft size={14} /> Back to home
          </Link>

          <div className="font-display font-black text-xl flex items-center gap-2 mb-8">
            <img src="/logo.png" alt="SeryeKo" className="w-7 h-7 rounded-full object-cover" />
            SeryeKo<span className="text-accent">.com</span>
          </div>

          <h1 className="font-display font-black text-3xl mb-2">Welcome back.</h1>
          <p className="text-sm text-muted mb-7">
            No account yet? <Link to="/register" className="text-accent font-medium hover:underline">Create one free →</Link>
          </p>

          {error && (
            <div className="bg-error/10 border border-error/30 text-error text-xs p-3 rounded-md mb-4 text-center">
              {error}
            </div>
          )}

          <button
            onClick={handleGoogle}
            type="button"
            className="w-full flex items-center justify-center gap-3 py-3.5 bg-paper-3 border border-rule rounded-pill font-display font-semibold text-sm text-ink hover:bg-paper-4 transition-all mb-5"
          >
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-rule" />
            <span className="font-outlier text-[10px] text-muted uppercase tracking-widest whitespace-nowrap">or sign in with email</span>
            <div className="flex-1 h-px bg-rule" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block font-display font-semibold text-xs text-neutral2 mb-1.5">Email address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className="w-full px-4 py-3.5 rounded-md bg-paper-2 border-[1.5px] border-rule text-ink text-sm focus:border-accent outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block font-display font-semibold text-xs text-neutral2 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full px-4 py-3.5 pr-12 rounded-md bg-paper-2 border-[1.5px] border-rule text-ink text-sm focus:border-accent outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-neutral2"
                  aria-label="Show password"
                >
                  <Eye size={18} />
                </button>
              </div>
            </div>

            <div className="flex justify-between items-center mb-2">
              <label className="flex items-center gap-2 text-sm text-neutral2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-accent" /> Remember me
              </label>
              <Link to="/forgot-password" className="text-sm text-accent hover:underline">Forgot password?</Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-4 bg-accent text-black font-display font-bold text-base rounded-pill shadow-lg hover:bg-accent-2 active:scale-[0.98] transition-all"
            >
              <LogIn size={18} /> {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="mt-7 text-center text-sm text-muted">
            New here? <Link to="/register" className="text-accent font-semibold hover:underline">Create your lifetime account →</Link>
          </p>
        </div>
      </main>
    </div>
  )
}
