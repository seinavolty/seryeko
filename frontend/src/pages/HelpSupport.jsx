import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronDown, Mail, MessageCircle } from 'lucide-react'
import { fetchPricing } from '../api/client'

export default function HelpSupport() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(0)
  const [freeEpisodes, setFreeEpisodes] = useState(3)

  useEffect(() => {
    fetchPricing()
      .then((p) => {
        const n = Number(p?.free_trial_episodes)
        if (Number.isFinite(n) && n > 0) setFreeEpisodes(n)
      })
      .catch(() => {})
  }, [])

  const faqs = useMemo(() => [
    {
      q: 'How does the free trial work?',
      a: `New accounts get ${freeEpisodes} free episode${freeEpisodes === 1 ? '' : 's'}. After that, unlock Lifetime Access with a one-time payment to watch everything forever.`,
    },
    {
      q: 'What is Lifetime Access?',
      a: 'One payment unlocks unlimited episodes across all providers. No renewals, no monthly bills. Access never expires.',
    },
    {
      q: 'Can I watch offline?',
      a: 'Offline downloads are not available yet. Turn on Data saver in Settings if you are on a limited mobile plan.',
    },
    {
      q: 'How do I change my language or subtitles?',
      a: 'Go to Profile → Settings → Language or Subtitles. Tap the row to cycle English, Tagalog, or Bahasa Indonesia.',
    },
    {
      q: 'I forgot my password',
      a: 'Use Forgot password on the sign-in screen, or open Change Password → Reset it from Settings.',
    },
  ], [freeEpisodes])

  return (
    <div className="pb-24 max-w-lg mx-auto min-h-screen">
      <header className="sticky top-0 z-30 bg-paper/90 backdrop-blur-md border-b border-rule px-4 py-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="w-8 h-8 rounded-full bg-paper-3 flex items-center justify-center"
          aria-label="Back"
        >
          <ArrowLeft size={16} />
        </button>
        <h1 className="font-display font-bold text-base">Help & Support</h1>
      </header>

      <div className="px-4 pt-6">
        <p className="text-sm text-muted mb-6">
          Quick answers first. Still stuck? Reach out — we usually reply within 1 business day.
        </p>

        <div className="space-y-2 mb-8">
          {faqs.map((item, idx) => {
            const isOpen = open === idx
            return (
              <button
                key={item.q}
                type="button"
                onClick={() => setOpen(isOpen ? -1 : idx)}
                className="w-full text-left p-3.5 bg-paper-2 border border-rule rounded-md"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-display font-semibold text-ink">{item.q}</span>
                  <ChevronDown
                    size={16}
                    className={`text-muted flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  />
                </div>
                {isOpen && <p className="text-xs text-neutral2 mt-2 leading-relaxed">{item.a}</p>}
              </button>
            )
          })}
        </div>

        <div className="space-y-2">
          <a
            href="mailto:support@seryeko.com?subject=SeryeKo%20Help"
            className="w-full flex items-center gap-3 p-3.5 bg-paper-2 border border-rule rounded-md hover:bg-paper-3"
          >
            <Mail size={16} className="text-accent" />
            <div className="flex-1">
              <div className="text-sm font-display font-semibold">Email support</div>
              <div className="text-[11px] text-muted">support@seryeko.com</div>
            </div>
          </a>
          <Link
            to="/refund"
            className="w-full flex items-center gap-3 p-3.5 bg-paper-2 border border-rule rounded-md hover:bg-paper-3"
          >
            <MessageCircle size={16} className="text-accent" />
            <div className="flex-1">
              <div className="text-sm font-display font-semibold">Request a refund</div>
              <div className="text-[11px] text-muted">7-day money-back guarantee</div>
            </div>
          </Link>
        </div>

        <div className="mt-8 pt-6 border-t border-rule">
          <p className="text-xs text-muted mb-3">Policies</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <Link to="/terms" className="text-accent hover:underline">Terms of Use</Link>
            <Link to="/privacy" className="text-accent hover:underline">Privacy Policy</Link>
            <Link to="/refund-policy" className="text-accent hover:underline">Refund Policy</Link>
            <Link to="/dmca" className="text-accent hover:underline">DMCA</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
