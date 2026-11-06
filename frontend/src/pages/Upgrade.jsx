import React, { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Check, ShieldCheck, QrCode, Lock, ChevronDown, Gift, Tag, X, RefreshCw } from 'lucide-react'
import { fetchPricing, startQrphCheckout, fetchPaymentStatus, previewPrice, fetchMe } from '../api/client'
import { useAuthStore } from '../store/authStore'

const TESTIMONIALS = [
  { name: 'Josefina R.', meta: 'Quezon City · Lifetime member', avatar: 'J', text: 'Nagbayad na ako ng isang beses, nanuod na ako nang walang tigil. Worth every peso!' },
  { name: 'Dewi S.', meta: 'Jakarta · Lifetime member', avatar: 'D', text: 'Bayar sekali, nonton seumur hidup. Udah ribuan episode, gak pernah nyesel.' },
  { name: 'Maria L.', meta: 'Makati · Lifetime member', avatar: 'M', text: "I've finished 12 dramas since I subscribed. The unlimited scroll player is so fun — I can't stop." },
]

const FAQS = [
  { q: 'Is this really one payment forever?', a: "Yes — 100%. Pay once, watch forever. No renewals, no monthly charges, no hidden fees. If we ever close (we won't), you get a refund." },
  { q: "What if I don't like it after paying?", a: '7-day full refund, no questions asked. Request it from your profile → Help & Support → Request Refund.' },
  { q: 'How do I pay with QR Ph?', a: 'Tap Pay with QR Ph, then scan the code with any participating bank or e-wallet app (GCash, Maya, BPI, UnionBank, and more). Payment settles via InstaPay — your lifetime access unlocks automatically.' },
  { q: 'How many devices can I use?', a: 'Up to 3 devices simultaneously per account. Any combination of mobile, tablet, or desktop.' },
]

function formatCountdown(seconds) {
  const m = Math.floor(Math.max(0, seconds) / 60)
  const s = Math.max(0, seconds) % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function Upgrade() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, updateUserSubscription, isAuthenticated, setUser } = useAuthStore()

  const [pricing, setPricing] = useState(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [referralCode, setReferralCode] = useState(
    () => (searchParams.get('ref') || user?.referred_by_code || '').toUpperCase(),
  )
  const [voucher, setVoucher] = useState(null)
  const [voucherLoading, setVoucherLoading] = useState(false)
  const [payError, setPayError] = useState('')
  const [referralLocked, setReferralLocked] = useState(
    () => Boolean((user?.referred_by_code || '').trim()) && !searchParams.get('ref'),
  )

  const [qrSession, setQrSession] = useState(null) // { paymentIntentId, qrImageUrl, amountPhp, expiresAt }
  const [pollStatus, setPollStatus] = useState('') // pending | expired | failed
  const [secondsLeft, setSecondsLeft] = useState(0)
  const pollRef = useRef(null)

  useEffect(() => {
    fetchPricing().then(setPricing).catch(() => {})
  }, [])

  // Prefill the referral code from signup so the discount auto-applies at upgrade
  useEffect(() => {
    if (searchParams.get('ref')) return undefined
    const fromUser = (user?.referred_by_code || '').trim().toUpperCase()
    if (fromUser) {
      setReferralCode(fromUser)
      setReferralLocked(true)
      return undefined
    }
    if (!isAuthenticated) return undefined
    let cancelled = false
    fetchMe()
      .then((me) => {
        if (cancelled) return
        setUser(me)
        const code = (me?.referred_by_code || '').trim().toUpperCase()
        if (!code) return
        setReferralCode((prev) => prev || code)
        setReferralLocked(true)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [isAuthenticated, searchParams, user?.referred_by_code, setUser])

  useEffect(() => {
    const code = referralCode.trim()
    if (!code) { setVoucher(null); return }
    setVoucherLoading(true)
    const t = setTimeout(() => {
      previewPrice(code)
        .then(setVoucher)
        .catch(() => setVoucher(null))
        .finally(() => setVoucherLoading(false))
    }, 350)
    return () => clearTimeout(t)
  }, [referralCode])

  // Countdown while QR is shown
  useEffect(() => {
    if (!qrSession?.expiresAt) return undefined
    const tick = () => {
      const left = Math.max(0, Math.floor((qrSession.expiresAt - Date.now()) / 1000))
      setSecondsLeft(left)
      if (left <= 0) setPollStatus((s) => (s === 'succeeded' ? s : 'expired'))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [qrSession])

  // Poll payment status
  useEffect(() => {
    if (!qrSession?.paymentIntentId) return undefined

    const stop = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }

    const poll = async () => {
      try {
        const res = await fetchPaymentStatus(qrSession.paymentIntentId)
        if (res.status === 'succeeded') {
          stop()
          updateUserSubscription(res.subscription)
          setQrSession(null)
          setSuccess(true)
          setTimeout(() => navigate('/home'), 2000)
          return
        }
        if (res.status === 'expired' || res.status === 'failed') {
          setPollStatus(res.status)
          stop()
        } else {
          setPollStatus('pending')
        }
      } catch {
        // Keep polling on transient errors
      }
    }

    poll()
    pollRef.current = setInterval(poll, 3000)
    return stop
  }, [qrSession?.paymentIntentId, navigate, updateUserSubscription])

  const closeQr = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    setQrSession(null)
    setPollStatus('')
    setPayError('')
  }

  const handlePay = async () => {
    if (!isAuthenticated) {
      navigate('/login')
      return
    }
    setPayError('')
    setPollStatus('')
    setLoading(true)
    try {
      const code = voucher && !voucher.error ? referralCode.trim() : null
      const res = await startQrphCheckout(code)
      const expiresIn = Number(res.expires_in_seconds) || 1800
      setQrSession({
        paymentIntentId: res.payment_intent_id,
        qrImageUrl: res.qr_image_url,
        amountPhp: res.amount_php,
        expiresAt: Date.now() + expiresIn * 1000,
        mock: !!res.mock,
      })
      setSecondsLeft(expiresIn)
      setPollStatus('pending')
    } catch (err) {
      setPayError(err.response?.data?.detail || 'Could not start QR Ph payment. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const pricePhp = pricing?.lifetime_price_php || 999
  const priceUsd = pricing?.lifetime_price_usd || 17
  const hasValidVoucher = voucher && !voucher.error && voucher.discount_php > 0
  const finalPrice = hasValidVoucher ? voucher.final_php : pricePhp
  const features = pricing?.features || [
    'All dramas from 40+ providers',
    'HD streaming · subtitles in EN / TL / ID',
    'Watch on 3 devices simultaneously',
    'New dramas added weekly — included forever',
    '7-day money-back guarantee',
  ]
  const freeEpisodes = Number(pricing?.free_trial_episodes) > 0
    ? Number(pricing.free_trial_episodes)
    : 3
  const episodesWatched = user?.subscription?.episodes_watched ?? freeEpisodes
  const freeEpisodeNums = Array.from({ length: freeEpisodes }, (_, i) => i + 1)

  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-success text-black flex items-center justify-center mx-auto mb-4 font-bold text-2xl">✓</div>
        <h2 className="font-display font-black text-2xl mb-2">Lifetime Unlocked!</h2>
        <p className="text-sm text-neutral2">Enjoy unlimited episodes across all 40+ providers forever.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-paper text-ink pb-10">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-4">
        <Link to="/home" className="font-display font-black text-base flex items-center gap-2">
          <img src="/logo.png" alt="SeryeKo" className="w-6 h-6 rounded-full object-cover" />
          SeryeKo<span className="text-accent">.com</span>
        </Link>
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-neutral2">
          <ArrowLeft size={14} /> Back
        </button>
      </header>

      {/* Hero */}
      <section className="text-center px-5 py-8 max-w-md mx-auto">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-pill bg-paper-2 border border-rule text-xs text-neutral2 mb-4">
          🎬 You finished your free trial
        </div>
        <h1 className="font-display font-black text-3xl mb-3 leading-tight">
          You loved {freeEpisodes} episode{freeEpisodes === 1 ? '' : 's'}.<br /><em className="not-italic text-accent">Unlock the rest.</em>
        </h1>
        <p className="text-sm text-muted mb-6">
          One payment. Every drama. 40+ providers. Watch forever — no renewals, no monthly bills.
        </p>

        <div className="inline-flex items-center gap-3 bg-paper-2 border border-rule rounded-pill px-4 py-2">
          <div className="flex gap-1">
            {freeEpisodeNums.map((n) => (
              <div key={n} className="w-6 h-6 rounded-full bg-accent/20 border border-accent text-[10px] font-display font-bold flex items-center justify-center">
                {n}
              </div>
            ))}
            <div className="w-6 h-6 rounded-full bg-paper-3 border border-rule flex items-center justify-center">
              <Lock size={10} className="text-muted" />
            </div>
          </div>
          <span className="text-[10px] font-outlier text-muted uppercase">{episodesWatched}/{freeEpisodes} free episode{freeEpisodes === 1 ? '' : 's'} used</span>
        </div>
      </section>

      {/* Pricing + payment card */}
      <div id="checkout" className="px-5 max-w-md mx-auto">
        <div className="relative bg-paper-2 border border-accent rounded-xl p-6">
          <div className="absolute top-0 right-0 bg-accent text-black text-[10px] font-extrabold uppercase px-3 py-1 rounded-bl-xl">
            Best Value
          </div>
          <div className="font-display font-bold text-base mb-1">Lifetime Access</div>
          <div className="text-xs text-muted mb-4">One-time payment · All devices · No renewals ever</div>

          <div className="flex items-baseline gap-2 mb-1">
            {hasValidVoucher && (
              <span className="text-lg font-bold text-muted line-through">₱{pricePhp}</span>
            )}
            <span className="text-xl font-bold text-accent align-super">₱</span>
            <span className="font-display font-black text-5xl tracking-tighter text-ink">{finalPrice}</span>
            <span className="text-xs text-muted">/ lifetime</span>
          </div>
          <div className="text-[11px] text-muted font-outlier mb-5">
            ≈ USD {priceUsd} · Price set by admin · 7-day refund guarantee
          </div>

          {/* Referral voucher */}
          <div className="mb-5">
            <label className="block text-[11px] font-bold text-muted mb-2 font-outlier uppercase flex items-center gap-1.5">
              <Gift size={12} /> {referralLocked ? 'Referral discount' : 'Have a referral code?'}
            </label>
            <input
              value={referralCode}
              onChange={(e) => {
                if (referralLocked) return
                setReferralCode(e.target.value.toUpperCase())
              }}
              readOnly={referralLocked}
              placeholder="DS-XXXXXX"
              className={`w-full px-4 py-3 rounded-md bg-paper-3 border border-rule text-ink text-sm font-mono focus:border-accent outline-none ${
                referralLocked ? 'opacity-90 cursor-default' : ''
              }`}
            />
            {referralLocked && (
              <p className="text-[11px] text-muted mt-1.5">Applied from your signup referral link.</p>
            )}
            {voucherLoading && <p className="text-[11px] text-muted mt-1.5">Checking code…</p>}
            {!voucherLoading && voucher?.error && (
              <p className="text-[11px] text-error mt-1.5">{voucher.error}</p>
            )}
            {!voucherLoading && hasValidVoucher && (
              <p className="text-[11px] text-success mt-1.5 flex items-center gap-1">
                <Tag size={11} /> {voucher.discount_label || 'Voucher applied'} — you save ₱{voucher.discount_php}
              </p>
            )}
          </div>

          <div className="space-y-2.5 mb-6">
            {features.map((feat, i) => (
              <div key={i} className="flex items-center gap-2.5 text-sm text-neutral2">
                <div className="w-[18px] h-[18px] rounded-full bg-success/20 text-success flex items-center justify-center flex-shrink-0">
                  <Check size={10} strokeWidth={3} />
                </div>
                <span>{feat}</span>
              </div>
            ))}
          </div>

          {/* QR Ph only */}
          <div className="mb-5">
            <label className="block text-[11px] font-bold text-muted mb-2 font-outlier uppercase">Payment method</label>
            <div className="flex items-center gap-3 rounded-lg border border-accent bg-accent/10 px-4 py-3">
              <QrCode size={22} className="text-accent flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-bold text-ink">QR Ph</div>
                <div className="text-[11px] text-neutral2">Scan with GCash, Maya, BPI, UnionBank & more</div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-neutral2 bg-paper-3 border border-rule rounded-md px-3 py-2.5 mt-3">
              <ShieldCheck size={14} className="text-accent flex-shrink-0" />
              A secure QR code will appear. Scan it in your banking or e-wallet app to pay.
            </div>
          </div>

          {payError && (
            <div className="bg-error/10 border border-error/30 text-error text-xs p-2.5 rounded-md mb-3 text-center">{payError}</div>
          )}

          <button
            onClick={handlePay}
            disabled={loading}
            className="w-full py-4 bg-accent text-black font-display font-black text-base rounded-pill shadow-lg hover:bg-accent-2 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-70"
          >
            <QrCode size={16} />
            {loading ? 'Generating QR…' : `Pay ₱${finalPrice} with QR Ph`}
          </button>

          <div className="flex items-center justify-center gap-1 text-[10px] text-muted mt-3 font-outlier">
            <ShieldCheck size={12} className="text-success" />
            <span>SECURED · PAYMONGO · QR PH · </span>
            <Link to="/refund-policy" className="text-accent hover:underline">7-DAY REFUND</Link>
          </div>
        </div>
      </div>

      {/* Testimonials */}
      <section className="px-5 py-10 max-w-md mx-auto">
        <p className="font-outlier text-xs text-accent uppercase tracking-widest mb-4">What subscribers say</p>
        <div className="space-y-3">
          {TESTIMONIALS.map((t, i) => (
            <div key={i} className="bg-paper-2 border border-rule rounded-lg p-4">
              <p className="text-sm text-neutral2 mb-3">{t.text}</p>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center font-display font-bold text-xs text-accent flex-shrink-0">
                  {t.avatar}
                </div>
                <div className="flex-1">
                  <div className="text-xs font-bold text-ink">{t.name}</div>
                  <div className="text-[10px] text-muted">{t.meta}</div>
                </div>
                <div className="text-amber-400 text-xs">★★★★★</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="px-5 pb-20 max-w-md mx-auto">
        <p className="font-outlier text-xs text-accent uppercase tracking-widest mb-4">Common questions</p>
        {FAQS.map((item, i) => (
          <details key={i} className="border-b border-rule group">
            <summary className="flex items-center justify-between gap-3 py-4 cursor-pointer text-sm font-display font-semibold text-ink list-none">
              {item.q}
              <ChevronDown size={16} className="text-muted group-open:rotate-180 transition-transform flex-shrink-0" />
            </summary>
            <p className="pb-4 text-sm text-neutral2 leading-relaxed">{item.a}</p>
          </details>
        ))}
      </section>

      {/* Sticky bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 bg-paper-2/95 backdrop-blur-md border-t border-rule px-5 py-3 flex items-center gap-4 max-w-lg mx-auto">
        <div className="flex-1 min-w-0">
          <div className="font-outlier text-[10px] text-muted uppercase">Lifetime access</div>
          <div className="font-display font-black text-lg text-ink">
            <span className="text-accent">₱{finalPrice}</span> one time
          </div>
        </div>
        <a
          href="#checkout"
          className="flex-shrink-0 px-5 py-3 bg-accent text-black font-display font-bold text-sm rounded-pill"
        >
          Get lifetime →
        </a>
      </div>

      {/* QR modal */}
      {qrSession && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm bg-paper-2 border border-rule rounded-xl p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="font-display font-black text-lg text-ink">Scan to pay</h3>
                <p className="text-xs text-neutral2 mt-0.5">
                  ₱{qrSession.amountPhp} · QR Ph via PayMongo
                </p>
              </div>
              <button
                type="button"
                onClick={closeQr}
                className="p-1.5 rounded-md text-muted hover:bg-paper-3"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="bg-white rounded-lg p-4 flex items-center justify-center mb-4">
              <img
                src={qrSession.qrImageUrl}
                alt="QR Ph payment code"
                className="w-56 h-56 object-contain"
              />
            </div>

            <p className="text-xs text-neutral2 text-center mb-3">
              Open your bank or e-wallet app and scan this code. Access unlocks automatically after payment.
            </p>

            {pollStatus === 'pending' && (
              <p className="text-center text-xs text-accent font-bold mb-2">
                Waiting for payment… {formatCountdown(secondsLeft)}
              </p>
            )}
            {(pollStatus === 'expired' || secondsLeft <= 0) && pollStatus !== 'failed' && (
              <p className="text-center text-xs text-error mb-3">
                This QR code expired. Generate a new one to try again.
              </p>
            )}
            {pollStatus === 'failed' && (
              <p className="text-center text-xs text-error mb-3">
                Payment failed. Please generate a new QR code.
              </p>
            )}

            {(pollStatus === 'expired' || pollStatus === 'failed' || secondsLeft <= 0) ? (
              <button
                type="button"
                onClick={() => { closeQr(); handlePay() }}
                className="w-full py-3 bg-accent text-black font-display font-bold text-sm rounded-pill flex items-center justify-center gap-2"
              >
                <RefreshCw size={14} /> Generate new QR
              </button>
            ) : (
              <button
                type="button"
                onClick={closeQr}
                className="w-full py-3 border border-rule text-neutral2 font-display font-bold text-sm rounded-pill"
              >
                Cancel
              </button>
            )}

            {qrSession.mock && (
              <p className="text-[10px] text-muted text-center mt-3 font-outlier uppercase">
                Mock mode — status poll will unlock access automatically
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
