import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Check, Lock, Play, Eye, Gift } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { fetchPricing, getGoogleLoginUrl } from '../api/client'

export default function Register() {
  const navigate = useNavigate()
  const { register } = useAuthStore()
  const [searchParams] = useSearchParams()
  const refFromUrl = searchParams.get('ref') || ''

  const [step, setStep] = useState(1)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [lang, setLang] = useState('en')
  const [referralCode, setReferralCode] = useState(refFromUrl)
  const [agreed, setAgreed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [freeEpisodes, setFreeEpisodes] = useState(3)

  useEffect(() => {
    fetchPricing()
      .then((p) => {
        const n = Number(p?.free_trial_episodes)
        if (Number.isFinite(n) && n > 0) setFreeEpisodes(n)
      })
      .catch(() => {})
  }, [])

  const freeEpisodeNums = Array.from({ length: freeEpisodes }, (_, i) => i + 1)
  const freeRangeLabel = freeEpisodes <= 1 ? '1' : `1–${freeEpisodes}`

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!agreed) {
      setError('Please agree to the Terms of Service and Privacy Policy.')
      return
    }
    setLoading(true)
    setError('')
    try {
      await register(email, password, fullName, referralCode.trim())
      localStorage.setItem('preferred_lang', lang)
      setStep(2)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    try {
      const url = await getGoogleLoginUrl()
      window.location.href = url
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="min-h-dvh bg-paper text-ink flex flex-col items-center p-6 sm:p-10">
      <div className="w-full max-w-md">
        {/* Step indicator */}
        <div className="flex items-center gap-3 mb-8">
          {[1, 2].map((i) => (
            <React.Fragment key={i}>
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-display font-bold ${
                  step > i ? 'bg-success text-black' : step === i ? 'bg-accent text-black' : 'bg-paper-3 text-muted'
                }`}
              >
                {step > i ? '✓' : i}
              </div>
              {i === 1 && <div className={`flex-1 h-px ${step > 1 ? 'bg-success' : 'bg-rule'}`} />}
            </React.Fragment>
          ))}
        </div>

        {step === 1 && (
          <div>
            <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted mb-6 hover:text-neutral2">
              <ArrowLeft size={14} /> Back to home
            </Link>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-pill bg-success/10 border border-success/30 text-success text-[11px] font-bold mb-4 font-outlier uppercase">
              <Check size={12} /> No credit card required
            </div>
            <h1 className="font-display font-black text-3xl mb-2">Create your account</h1>
            <p className="text-sm text-muted mb-7">
              Get <span className="text-success font-bold">{freeEpisodes} free episode{freeEpisodes === 1 ? '' : 's'}</span> immediately. Pay only if you want to keep watching.
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
              <span className="font-outlier text-[10px] text-muted uppercase tracking-widest whitespace-nowrap">or sign up with email</span>
              <div className="flex-1 h-px bg-rule" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block font-display font-semibold text-xs text-neutral2 mb-1.5">Full name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Bea Santos"
                  className="w-full px-4 py-3.5 rounded-md bg-paper-2 border-[1.5px] border-rule text-ink text-sm focus:border-accent outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block font-display font-semibold text-xs text-neutral2 mb-1.5">Email address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="bea@example.com"
                  className="w-full px-4 py-3.5 rounded-md bg-paper-2 border-[1.5px] border-rule text-ink text-sm focus:border-accent outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block font-display font-semibold text-xs text-neutral2 mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
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

              <div>
                <label className="block font-display font-semibold text-xs text-neutral2 mb-1.5">Preferred language</label>
                <select
                  value={lang}
                  onChange={(e) => setLang(e.target.value)}
                  className="w-full px-4 py-3.5 rounded-md bg-paper-2 border-[1.5px] border-rule text-ink text-sm focus:border-accent outline-none"
                >
                  <option value="en">🇺🇸 English</option>
                  <option value="tl">🇵🇭 Tagalog</option>
                  <option value="id">🇮🇩 Bahasa Indonesia</option>
                </select>
              </div>

              <div>
                <label className="block font-display font-semibold text-xs text-neutral2 mb-1.5 flex items-center gap-1.5">
                  <Gift size={13} className="text-accent" /> Referral code (optional)
                </label>
                <input
                  type="text"
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                  placeholder="DS-XXXXXX"
                  className="w-full px-4 py-3.5 rounded-md bg-paper-2 border-[1.5px] border-rule text-ink text-sm font-mono focus:border-accent outline-none transition-colors"
                />
                {referralCode && (
                  <p className="text-[11px] text-success mt-1.5">You&apos;ll get a lifetime discount with this code at checkout.</p>
                )}
              </div>

              <div className="flex items-center gap-2 text-[11px] font-outlier uppercase text-success bg-success/10 border border-success/30 rounded-md px-3 py-2.5">
                <Check size={14} /> No credit card required to sign up
              </div>

              <label className="flex items-start gap-2 text-xs text-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="w-4 h-4 mt-0.5 accent-accent flex-shrink-0"
                />
                <span>
                  I agree to the{' '}
                  <Link to="/terms" className="text-accent hover:underline">Terms of Use</Link>
                  {' '}and{' '}
                  <Link to="/privacy" className="text-accent hover:underline">Privacy Policy</Link>.
                </span>
              </label>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-4 bg-accent text-black font-display font-bold text-base rounded-pill shadow-lg hover:bg-accent-2 active:scale-[0.98] transition-all"
              >
                {loading ? 'Creating account...' : 'Start my free trial'}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-muted">
              Already have an account? <Link to="/login" className="text-accent font-semibold hover:underline">Log in</Link>
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="text-center animate-fade-in">
            <div className="text-2xl mb-4">🎬 🍿 ▶️ ✨ 🎉</div>
            <h2 className="font-display font-black text-3xl mb-3 leading-tight">
              You&apos;re in!<br />{freeEpisodes} episode{freeEpisodes === 1 ? '' : 's'}, on us.
            </h2>
            <p className="text-sm text-muted mb-7 max-w-xs mx-auto">
              No card, no charge — just Asian dramas. After your {freeEpisodes} free episode{freeEpisodes === 1 ? '' : 's'}, one lifetime payment unlocks everything.
            </p>

            <div className="bg-paper-2 border border-rule rounded-xl p-5 mb-7">
              <p className="font-outlier text-xs text-muted uppercase tracking-widest mb-4">Your free episodes</p>
              <div className="flex items-center justify-center gap-3 mb-4 flex-wrap">
                {freeEpisodeNums.map((n) => (
                  <div key={n} className="flex flex-col items-center gap-1.5">
                    <div className="w-11 h-11 rounded-full bg-accent/15 border-2 border-accent flex items-center justify-center font-display font-bold text-ink">
                      {n}
                    </div>
                    <span className="text-[10px] font-outlier text-success">FREE</span>
                  </div>
                ))}
                <div className="flex flex-col items-center gap-1.5">
                  <div className="w-11 h-11 rounded-full bg-paper-3 border-2 border-rule flex items-center justify-center text-muted">
                    <Lock size={18} />
                  </div>
                  <span className="text-[10px] font-outlier text-muted">UNLOCK</span>
                </div>
              </div>
              <p className="text-xs text-neutral2">
                <strong className="text-ink">Episode{freeEpisodes === 1 ? '' : 's'} {freeRangeLabel} {freeEpisodes === 1 ? 'is' : 'are'} yours, free — right now.</strong><br />
                Episode {freeEpisodes + 1} onwards needs a lifetime pass.<br />
                <Link to="/upgrade" className="text-accent font-semibold">See pricing →</Link>
              </p>
            </div>

            <button
              onClick={() => navigate('/home')}
              className="w-full max-w-xs mx-auto flex items-center justify-center gap-2 py-4 bg-accent text-black font-display font-bold text-base rounded-pill shadow-lg mb-3"
            >
              <Play size={18} fill="currentColor" /> Start watching now
            </button>
            <p className="text-xs text-muted">
              or <Link to="/upgrade" className="text-accent font-semibold">see lifetime pricing →</Link>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
