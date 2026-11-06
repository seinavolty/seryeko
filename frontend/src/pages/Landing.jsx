import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Play, ShieldCheck, Globe2, Infinity as InfinityIcon, Film } from 'lucide-react'
import { fetchPricing } from '../api/client'

// FAQ Schema for Google Rich Results
const FAQ_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [],
}

// Breadcrumb schema
const BREADCRUMB_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://seryeko.com/' },
  ],
}

const PROVIDERS = [
  'DramaBox', 'ShortMax', 'ReelShort', 'FlickReels', 'DramaWave', 'StarShort',
  'MicroDrama', 'DramaNova', 'GoodShort', 'Melolo', 'ReelBuzz', 'RapidTV',
  'CubeTV', 'Velolo', 'KalosTV', 'BonusTV',
]

const FAQS = [
  {
    q: 'Is SeryeKo.com really a one-time payment?',
    a: "Yes. Pay once and you're done — no subscription renewal, no fine print. If the price goes up next month, your account is completely unaffected. Lifetime access means exactly that.",
  },
  {
    q: 'What Asian dramas can I watch on SeryeKo?',
    a: 'Korean, Chinese, Thai, Japanese, and Filipino short dramas from 40+ providers — over 10,000 titles combined including popular series from DramaBox, ShortMax, ReelShort, Melolo, and more. The library grows automatically as providers add new content.',
  },
  {
    q: 'What payment methods are accepted in the Philippines?',
    a: 'QR Ph via PayMongo — scan with any participating bank or e-wallet app (GCash, Maya, BPI, UnionBank, and more). Payments settle securely via InstaPay. We never store your payment credentials.',
  },
  {
    q: 'Can I watch on my phone, tablet, or TV?',
    a: 'Yes. SeryeKo works on any browser — mobile, tablet, or desktop. Install it as a PWA (Progressive Web App) for a native-app experience on Android and iOS. Up to 3 linked devices per account.',
  },
  {
    q: 'What if I want a refund?',
    a: "7-day money-back guarantee, no questions asked. Contact our support team and we'll process your refund within 24 hours via PayMongo. Your satisfaction is guaranteed.",
  },
  {
    q: 'How is SeryeKo different from DramaBox or ShortMax?',
    a: 'SeryeKo aggregates 40+ providers — including DramaBox, ShortMax, ReelShort, Melolo, and more — into one app with a single lifetime payment. No need to juggle multiple subscriptions or pay per provider.',
  },
]

export default function Landing() {
  const [pricing, setPricing] = useState(null)

  useEffect(() => {
    fetchPricing().then(setPricing).catch(() => {})
  }, [])

  const pricePhp = pricing?.lifetime_price_php || 999
  const features = pricing?.features || [
    'All dramas from 40+ providers',
    'English, Tagalog & Indonesian UI',
    'Fun unlimited scroll player',
    'Watchlist & continue watching',
    'Up to 3 devices at once',
    'Pay with QR Ph (any bank or e-wallet)',
  ]

  // Build FAQ schema dynamically from FAQS array
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }

  // Offer schema (no price in SEO markup)
  const offerSchema = {
    '@context': 'https://schema.org',
    '@type': 'Offer',
    name: 'SeryeKo Lifetime Access',
    description: 'Lifetime access to 40+ Asian drama providers — Korean, Chinese, Thai, Filipino. No monthly subscription.',
    availability: 'https://schema.org/InStock',
    url: 'https://seryeko.com/register',
    seller: { '@type': 'Organization', name: 'SeryeKo.com' },
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* JSON-LD Structured Data */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(offerSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_SCHEMA) }} />
      {/* Floating nav pill */}
      <nav className="sticky top-3 z-50 mx-auto max-w-3xl flex items-center justify-between gap-4 bg-paper-2/90 backdrop-blur-md border border-rule rounded-pill px-5 py-2.5 mt-3">
        <Link to="/" className="font-display font-black text-base flex items-center gap-2">
          <img src="/logo.png" alt="SeryeKo" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
          SeryeKo<span className="text-accent">.com</span>
        </Link>
        <div className="hidden sm:flex items-center gap-5 text-sm text-neutral2">
          <Link to="/browse" className="hover:text-ink">Browse</Link>
          <Link to="/login" className="hover:text-ink">Sign in</Link>
        </div>
        <Link to="/register" className="bg-accent text-black text-xs font-display font-bold px-4 py-2 rounded-pill">
          Start watching
        </Link>
      </nav>

      {/* Hero */}
      <section className="relative px-5 pt-14 pb-16 text-center overflow-hidden">
        <div className="absolute inset-0 -z-10 opacity-30 grid grid-cols-5 gap-1 pointer-events-none">
          {Array.from({ length: 15 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] rounded-md bg-gradient-to-br from-accent/30 to-paper-3" />
          ))}
        </div>
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-paper via-paper/60 to-transparent" />

        <img
          src="/logo.png"
          alt="SeryeKo"
          className="w-44 h-44 sm:w-56 sm:h-56 mx-auto mb-5 object-contain"
          style={{
            filter:
              'drop-shadow(0 0 18px rgba(236,72,120,0.55)) drop-shadow(0 0 40px rgba(236,72,120,0.28))',
          }}
        />
        <p className="font-outlier text-xs text-accent uppercase tracking-widest mb-4">Short Dramas, Big Kilig</p>
        <h1 className="font-display font-black text-4xl sm:text-5xl leading-[1.05] tracking-tight mb-5">
          Watch Asian dramas online.<br />
          <em className="not-italic text-accent">Pay once.</em><br />
          Stream forever.
        </h1>
        <p className="text-sm text-neutral2 max-w-md mx-auto mb-7">
          The #1 short drama app for Filipino viewers. Korean, Chinese, Thai, and Filipino dramas from 40+ providers — DramaBox, ShortMax, ReelShort, Melolo & more. One lifetime payment of ₱{pricePhp}, no monthly subscription — pay with QR Ph.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-10">
          <Link to="/register" className="w-full sm:w-auto px-6 py-3.5 bg-accent text-black font-display font-bold text-sm rounded-pill flex items-center justify-center gap-2">
            <Play size={16} fill="currentColor" /> Start watching — one-time fee
          </Link>
          <Link to="/login" className="w-full sm:w-auto px-6 py-3.5 text-sm text-neutral2 font-display font-semibold">
            Sign in
          </Link>
        </div>

        <div className="flex items-center justify-center gap-6 font-outlier">
          <div><div className="font-display font-black text-2xl text-ink">40+</div><div className="text-[11px] text-muted">providers</div></div>
          <div className="w-px h-8 bg-rule" />
          <div><div className="font-display font-black text-2xl text-ink">3</div><div className="text-[11px] text-muted">languages</div></div>
          <div className="w-px h-8 bg-rule" />
          <div><div className="font-display font-black text-2xl text-ink">0</div><div className="text-[11px] text-muted">monthly fees</div></div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-5 py-14 max-w-lg mx-auto">
        <p className="font-outlier text-xs text-accent uppercase tracking-widest mb-3">How it works</p>
        <h2 className="font-display font-extrabold text-2xl mb-3">How to Watch Asian Dramas on SeryeKo</h2>
        <p className="text-sm text-neutral2 mb-6">
          Fun unlimited scroll through episodes like social media. Find your next Korean or Filipino drama in seconds — no complicated menus, just swipe and watch.
        </p>
        <ul className="space-y-4">
          {[
            ['01', 'Browse the feed', 'Swipe up through auto-playing clips. Swipe right to save for later.'],
            ['02', 'Pick a drama', 'Tap to open. See all episodes. Scroll down = next episode plays.'],
            ['03', 'Never stop', 'Auto-play advances episodes. You pick when to pause.'],
          ].map(([num, title, desc]) => (
            <li key={num} className="flex gap-3 items-start">
              <span className="font-display font-black text-xl text-accent flex-shrink-0">{num}</span>
              <div>
                <strong className="font-display text-sm text-ink">{title}</strong>
                <p className="text-xs text-muted mt-1">{desc}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Features */}
      <section className="px-5 py-14 max-w-2xl mx-auto">
        <p className="font-outlier text-xs text-accent uppercase tracking-widest mb-3">Features</p>
        <h2 className="font-display font-extrabold text-2xl mb-3">Why Choose SeryeKo for Asian Dramas?</h2>
        <p className="text-sm text-neutral2 mb-7">
          Built for the drama fanatic who wants fast access to Korean, Chinese, Thai, and Filipino short dramas — without paying multiple app subscriptions.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            [Film, '40+ Drama Providers', 'DramaBox, ShortMax, ReelShort, FlickReels, DramaWave, and 35 more — all in one app.'],
            [Globe2, 'English · Tagalog · Indonesian', 'Full app UI and subtitles in three languages. Switches automatically from your device.'],
            [Play, 'Fun unlimited scroll', 'Scroll down = next episode. No tapping menus. Just keep watching.'],
            [InfinityIcon, 'Pay once. Watch forever.', 'No monthly traps. One price set by the admin — yours to keep forever. 7-day refund guaranteed.'],
          ].map(([Icon, title, desc], i) => (
            <div key={i} className="bg-paper-2 border border-rule rounded-lg p-5">
              <div className="w-9 h-9 rounded-full bg-accent/10 text-accent flex items-center justify-center mb-3">
                <Icon size={18} />
              </div>
              <h3 className="font-display font-bold text-sm mb-1.5">{title}</h3>
              <p className="text-xs text-muted">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Provider marquee */}
      <section className="py-10 border-t border-rule overflow-hidden">
        <h3 className="text-center font-outlier text-xs text-muted uppercase tracking-widest mb-5">
          Content from 40+ Asian drama providers
        </h3>
        <div className="flex gap-2 px-5 overflow-x-auto no-scrollbar">
          {PROVIDERS.map((p, i) => (
            <span key={i} className="flex-shrink-0 px-4 py-1.5 bg-paper-2 border border-rule rounded-pill font-outlier text-xs text-muted">
              {p}
            </span>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="px-5 py-16 text-center">
        <p className="font-outlier text-xs text-accent uppercase tracking-widest mb-3">Pricing</p>
        <h2 className="font-display font-extrabold text-2xl mb-8">One price.<br />For life.</h2>
        <div className="max-w-sm mx-auto bg-paper-2 border border-accent rounded-xl p-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-accent" />
          <div className="inline-flex items-center gap-2 font-outlier text-xs text-accent border border-accent/30 rounded-pill px-4 py-1 mb-5 uppercase tracking-widest">
            Lifetime Access
          </div>
          <div className="font-display font-black text-5xl tracking-tighter mb-1">
            <span className="text-xl align-super text-accent">₱</span>{pricePhp}
          </div>
          <p className="text-xs text-muted mb-7">One-time payment · Never expires · 7-day refund</p>
          <ul className="text-left space-y-3 mb-7">
            {features.map((f, i) => (
              <li key={i} className="flex items-center gap-3 text-sm text-neutral2">
                <span className="w-[18px] h-[18px] rounded-full bg-accent/15 border border-accent flex-shrink-0 flex items-center justify-center text-accent text-[10px]">✓</span>
                {f}
              </li>
            ))}
          </ul>
          <Link to="/register" className="w-full flex items-center justify-center gap-2 py-3.5 bg-accent text-black font-display font-bold text-sm rounded-pill">
            <Play size={16} fill="currentColor" /> Get lifetime access
          </Link>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-5 py-14 max-w-xl mx-auto">
        <p className="font-outlier text-xs text-accent uppercase tracking-widest mb-3">FAQ</p>
        <h2 className="font-display font-extrabold text-2xl mb-6">Real answers.</h2>
        {FAQS.map((item, i) => (
          <details key={i} className="border-t border-rule py-1 last:border-b group">
            <summary className="flex items-center justify-between gap-4 py-4 cursor-pointer font-display font-semibold text-sm list-none">
              {item.q}
              <span className="w-5 h-5 rounded-full border border-rule flex items-center justify-center text-muted text-[10px] group-open:rotate-180 transition-transform flex-shrink-0">▾</span>
            </summary>
            <p className="pb-4 text-sm text-neutral2 leading-relaxed">{item.a}</p>
          </details>
        ))}
      </section>

      {/* CTA strip */}
      <div className="mx-5 mb-16 bg-paper-2 rounded-xl text-center py-16 px-5">
        <h2 className="font-display font-extrabold text-2xl mb-3">Start watching Asian dramas today.</h2>
        <p className="text-sm text-neutral2 max-w-xs mx-auto mb-6">
          Join thousands of Filipino viewers watching Korean, Chinese, Thai, and Filipino dramas — no monthly fees, ever.
        </p>
        <Link to="/register" className="inline-flex items-center gap-2 px-6 py-3.5 bg-accent text-black font-display font-bold text-sm rounded-pill">
          Get lifetime access →
        </Link>
      </div>

      {/* Footer */}
      <footer className="px-5 py-8 border-t border-rule flex flex-wrap items-center justify-between gap-4">
        <div className="font-display font-black text-base flex items-center gap-2">
          <img src="/logo.png" alt="SeryeKo" className="w-6 h-6 rounded-full object-cover" />
          SeryeKo<span className="text-accent">.com</span>
        </div>
        <ul className="flex flex-wrap gap-5 text-sm text-muted">
          <li><Link to="/privacy" className="hover:text-neutral2">Privacy</Link></li>
          <li><Link to="/terms" className="hover:text-neutral2">Terms</Link></li>
          <li><Link to="/dmca" className="hover:text-neutral2">DMCA</Link></li>
          <li><Link to="/refund-policy" className="hover:text-neutral2">Refunds</Link></li>
          <li><Link to="/help" className="hover:text-neutral2">Support</Link></li>
          <li><Link to="/login" className="hover:text-neutral2">Sign in</Link></li>
        </ul>
        <span className="font-outlier text-xs text-muted flex items-center gap-1">
          <ShieldCheck size={12} /> © 2026 SeryeKo.com
        </span>
      </footer>
    </div>
  )
}
