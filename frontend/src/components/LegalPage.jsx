import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, AlertTriangle, Mail } from 'lucide-react'
import { LEGAL_DETAILS, LEGAL_PLACEHOLDER_NOTICE } from '../config/legal'

const POLICY_LINKS = [
  { to: '/terms', label: 'Terms' },
  { to: '/privacy', label: 'Privacy' },
  { to: '/dmca', label: 'DMCA' },
  { to: '/refund-policy', label: 'Refunds' },
]

export function LegalSection({ id, title, children }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-rule pt-8 first:border-0 first:pt-0">
      <h2 className="font-display text-xl font-bold text-ink mb-3">{title}</h2>
      <div className="space-y-3 text-sm leading-7 text-neutral2">{children}</div>
    </section>
  )
}

export function LegalList({ children }) {
  return <ul className="list-disc space-y-2 pl-5 marker:text-accent">{children}</ul>
}

export function LegalContact({ subject, dmca = false }) {
  const email = dmca ? LEGAL_DETAILS.dmcaEmail : LEGAL_DETAILS.supportEmail
  return (
    <div className="rounded-md border border-rule bg-paper-2 p-4 text-sm not-italic">
      <p className="font-display font-semibold text-ink">
        {dmca ? LEGAL_DETAILS.dmcaAgentName : LEGAL_DETAILS.operatorName}
      </p>
      <p>{LEGAL_DETAILS.serviceName}</p>
      <p>{LEGAL_DETAILS.postalAddress}</p>
      <a
        href={`mailto:${email}?subject=${encodeURIComponent(subject)}`}
        className="mt-2 inline-flex items-center gap-2 text-accent hover:underline"
      >
        <Mail size={14} aria-hidden="true" /> {email}
      </a>
    </div>
  )
}

export default function LegalPage({ title, description, sections, children }) {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-30 border-b border-rule bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/" className="inline-flex items-center gap-2 font-display text-sm font-bold hover:text-accent">
            <ArrowLeft size={16} aria-hidden="true" />
            <img src="/logo.png" alt="" className="h-6 w-6 rounded-full object-cover" />
            SeryeKo.com
          </Link>
          <nav aria-label="Legal policies" className="hidden items-center gap-4 text-xs text-muted sm:flex">
            {POLICY_LINKS.map((link) => (
              <Link key={link.to} to={link.to} className="hover:text-ink">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="mb-10 max-w-3xl">
          <p className="mb-3 font-outlier text-[11px] uppercase tracking-[0.18em] text-accent">Legal</p>
          <h1 className="font-display text-3xl font-black tracking-tight sm:text-5xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-neutral2 sm:text-base">{description}</p>
          <p className="mt-3 text-xs text-muted">Last updated: {LEGAL_DETAILS.lastUpdated}</p>
        </div>

        {LEGAL_DETAILS.isDraft && (
          <div className="mb-10 flex gap-3 rounded-md border border-amber-400/30 bg-amber-400/10 p-4 text-sm leading-6 text-amber-200">
            <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
            <p><strong className="font-semibold">Draft legal details.</strong> {LEGAL_PLACEHOLDER_NOTICE}</p>
          </div>
        )}

        <div className="grid gap-10 lg:grid-cols-[13rem_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <nav aria-label={`${title} contents`} className="rounded-md border border-rule bg-paper-2 p-4">
              <p className="mb-3 font-display text-xs font-bold uppercase tracking-wider text-muted">On this page</p>
              <ol className="space-y-2 text-sm">
                {sections.map((section) => (
                  <li key={section.id}>
                    <a href={`#${section.id}`} className="text-neutral2 hover:text-accent">
                      {section.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </aside>
          <article className="min-w-0 space-y-10">{children}</article>
        </div>
      </main>

      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 text-xs text-muted sm:px-6">
          <nav aria-label="All legal policies" className="flex flex-wrap gap-x-5 gap-y-2">
            {POLICY_LINKS.map((link) => (
              <Link key={link.to} to={link.to} className="hover:text-ink">{link.label}</Link>
            ))}
          </nav>
          <p>© 2026 SeryeKo.com. These policies should be reviewed by qualified counsel before publication.</p>
        </div>
      </footer>
    </div>
  )
}
