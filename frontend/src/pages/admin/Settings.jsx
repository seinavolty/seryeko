import React, { useEffect, useState } from 'react'
import { Save, DollarSign, Share2, KeyRound } from 'lucide-react'
import {
  fetchAdminPricingSettings, updateAdminPricingSettings,
  fetchAdminReferralSettings, updateAdminReferralSettings,
  fetchAdminKeysSettings, updateAdminKeysSettings,
} from '../../api/client'
import { Loading, ErrorState, SaveToast, Chip } from './shared'

const TABS = ['pricing', 'referral', 'keys']

export default function Settings() {
  const [tab, setTab] = useState('pricing')

  return (
    <div className="pb-10">
      <h1 className="font-display font-black text-xl mb-4">Settings</h1>
      <div className="flex gap-1.5 mb-5 overflow-x-auto no-scrollbar">
        {TABS.map((t) => (
          <Chip key={t} active={tab === t} onClick={() => setTab(t)}>
            {t === 'pricing' ? 'Pricing' : t === 'referral' ? 'Referral defaults' : 'API keys'}
          </Chip>
        ))}
      </div>
      {tab === 'pricing' && <PricingTab />}
      {tab === 'referral' && <ReferralTab />}
      {tab === 'keys' && <KeysTab />}
    </div>
  )
}

function PricingTab() {
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState('')

  const load = () => {
    setError('')
    fetchAdminPricingSettings().then(setForm).catch(() => setError('Could not load pricing settings.'))
  }
  useEffect(() => { load() }, [])

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const updated = await updateAdminPricingSettings({
        lifetime_price_php: parseFloat(form.lifetime_price_php),
        lifetime_price_usd: parseFloat(form.lifetime_price_usd),
        early_bird_enabled: form.early_bird_enabled,
        early_bird_price_php: parseFloat(form.early_bird_price_php),
        early_bird_cap: parseInt(form.early_bird_cap, 10) || 0,
        guest_preview_enabled: form.guest_preview_enabled,
        guest_preview_episodes: parseInt(form.guest_preview_episodes, 10) || 0,
      })
      setForm(updated)
      setSaved('Pricing settings saved!')
      setTimeout(() => setSaved(''), 2500)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save pricing settings.')
    } finally {
      setSaving(false)
    }
  }

  if (error && !form) return <ErrorState message={error} onRetry={load} />
  if (!form) return <Loading label="Loading pricing…" />

  return (
    <div className="bg-paper-2 border border-rule rounded-xl p-5">
      <h2 className="font-display font-bold text-base mb-1 flex items-center gap-1.5"><DollarSign size={15} className="text-accent" /> Pricing</h2>
      <p className="text-xs text-muted mb-4">Changes reflect immediately on the Upgrade page.</p>
      <SaveToast message={saved} />
      {error && <div className="bg-error/10 border border-error/30 text-error text-xs p-2.5 rounded-md mb-4">{error}</div>}

      <form onSubmit={handleSave} className="space-y-4">
        <Field label="Lifetime price (PHP ₱)" type="number" value={form.lifetime_price_php} onChange={(v) => set('lifetime_price_php', v)} />
        <Field label="Lifetime price (USD $)" type="number" value={form.lifetime_price_usd} onChange={(v) => set('lifetime_price_usd', v)} />

        <ToggleField
          label="Early bird promo"
          hint="Show discounted early-bird price while sold < cap"
          checked={form.early_bird_enabled}
          onChange={(v) => set('early_bird_enabled', v)}
        />
        {form.early_bird_enabled && (
          <>
            <Field label="Early bird price (PHP ₱)" type="number" value={form.early_bird_price_php} onChange={(v) => set('early_bird_price_php', v)} />
            <Field label="Early bird cap (seats)" type="number" value={form.early_bird_cap} onChange={(v) => set('early_bird_cap', v)} />
            <div className="text-xs text-muted">Sold so far: <span className="text-ink font-bold">{form.early_bird_sold}</span> / {form.early_bird_cap || '∞'}</div>
          </>
        )}

        <ToggleField
          label="Guest preview episodes"
          hint="Allow free trial users to preview episodes before paywall"
          checked={form.guest_preview_enabled}
          onChange={(v) => set('guest_preview_enabled', v)}
        />
        {form.guest_preview_enabled && (
          <Field label="Free episodes" type="number" value={form.guest_preview_episodes} onChange={(v) => set('guest_preview_episodes', v)} />
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full py-3.5 bg-accent text-black font-display font-extrabold text-xs rounded-pill flex items-center justify-center gap-1.5 hover:bg-accent-2 transition-all shadow-md disabled:opacity-60"
        >
          <Save size={14} /> {saving ? 'Saving…' : 'Save pricing'}
        </button>
      </form>
    </div>
  )
}

function ReferralTab() {
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState('')

  const load = () => {
    setError('')
    fetchAdminReferralSettings().then(setForm).catch(() => setError('Could not load referral settings.'))
  }
  useEffect(() => { load() }, [])

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const updated = await updateAdminReferralSettings({
        referral_enabled: form.referral_enabled,
        referral_discount_type: form.referral_discount_type,
        referral_discount_value: parseFloat(form.referral_discount_value),
        referral_commission_pct: parseFloat(form.referral_commission_pct),
        referral_min_withdraw_php: parseFloat(form.referral_min_withdraw_php),
      })
      setForm(updated)
      setSaved('Referral defaults saved!')
      setTimeout(() => setSaved(''), 2500)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save referral settings.')
    } finally {
      setSaving(false)
    }
  }

  if (error && !form) return <ErrorState message={error} onRetry={load} />
  if (!form) return <Loading label="Loading referral defaults…" />

  return (
    <div className="bg-paper-2 border border-rule rounded-xl p-5">
      <h2 className="font-display font-bold text-base mb-1 flex items-center gap-1.5"><Share2 size={15} className="text-accent" /> Referral defaults</h2>
      <p className="text-xs text-muted mb-4">
        Referral codes act as discount vouchers + attribution. Per-code overrides can be set in the Referrals tab.
      </p>
      <SaveToast message={saved} />
      {error && <div className="bg-error/10 border border-error/30 text-error text-xs p-2.5 rounded-md mb-4">{error}</div>}

      <form onSubmit={handleSave} className="space-y-4">
        <ToggleField
          label="Referral program enabled"
          hint="Turn off to disable all referral vouchers globally"
          checked={form.referral_enabled}
          onChange={(v) => set('referral_enabled', v)}
        />

        <div>
          <label className="block text-xs font-bold text-neutral2 mb-1.5">Default discount type</label>
          <div className="grid grid-cols-2 gap-2">
            {['percent', 'fixed'].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set('referral_discount_type', t)}
                className={`py-2.5 rounded-md border text-xs font-bold capitalize transition-all ${
                  form.referral_discount_type === t ? 'border-accent bg-accent/10 text-accent' : 'border-rule bg-paper-3 text-neutral2'
                }`}
              >
                {t === 'percent' ? '% percent off' : '₱ fixed off'}
              </button>
            ))}
          </div>
        </div>

        <Field
          label={form.referral_discount_type === 'fixed' ? 'Discount amount (PHP ₱)' : 'Discount value (%)'}
          type="number"
          value={form.referral_discount_value}
          onChange={(v) => set('referral_discount_value', v)}
        />

        <Field label="Commission rate (% of amount paid)" type="number" value={form.referral_commission_pct} onChange={(v) => set('referral_commission_pct', v)} />
        <Field label="Minimum withdraw (PHP ₱)" type="number" value={form.referral_min_withdraw_php ?? 100} onChange={(v) => set('referral_min_withdraw_php', v)} />

        <button
          type="submit"
          disabled={saving}
          className="w-full py-3.5 bg-accent text-black font-display font-extrabold text-xs rounded-pill flex items-center justify-center gap-1.5 hover:bg-accent-2 transition-all shadow-md disabled:opacity-60"
        >
          <Save size={14} /> {saving ? 'Saving…' : 'Save referral defaults'}
        </button>
      </form>
    </div>
  )
}

function KeysTab() {
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState('')

  const load = () => {
    setError('')
    fetchAdminKeysSettings().then(setForm).catch(() => setError('Could not load API keys.'))
  }
  useEffect(() => { load() }, [])

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const updated = await updateAdminKeysSettings({
        dramabuzz_api_key: form.dramabuzz_api_key,
        paymongo_mode: form.paymongo_mode,
        paymongo_public_key: form.paymongo_public_key,
        paymongo_secret_key: form.paymongo_secret_key,
        paymongo_webhook_secret: form.paymongo_webhook_secret,
      })
      setForm(updated)
      setSaved('API keys saved and applied!')
      setTimeout(() => setSaved(''), 2500)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save keys.')
    } finally {
      setSaving(false)
    }
  }

  if (error && !form) return <ErrorState message={error} onRetry={load} />
  if (!form) return <Loading label="Loading keys…" />

  return (
    <div className="bg-paper-2 border border-rule rounded-xl p-5">
      <h2 className="font-display font-bold text-base mb-1 flex items-center gap-1.5"><KeyRound size={15} className="text-accent" /> API keys</h2>
      <p className="text-xs text-muted mb-4">
        Secrets are masked (last 4 shown). Leave a masked field unchanged to keep its current value; type a new value to rotate it.
      </p>
      <SaveToast message={saved} />
      {error && <div className="bg-error/10 border border-error/30 text-error text-xs p-2.5 rounded-md mb-4">{error}</div>}

      <form onSubmit={handleSave} className="space-y-4">
        <KeyField label="DramaBuzz API key" value={form.dramabuzz_api_key} source={form.dramabuzz_api_key_source} onChange={(v) => set('dramabuzz_api_key', v)} />

        <div>
          <label className="block text-xs font-bold text-neutral2 mb-1.5">PayMongo mode</label>
          <div className="grid grid-cols-2 gap-2">
            {['test', 'live'].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => set('paymongo_mode', m)}
                className={`py-2.5 rounded-md border text-xs font-bold uppercase transition-all ${
                  form.paymongo_mode === m ? 'border-accent bg-accent/10 text-accent' : 'border-rule bg-paper-3 text-neutral2'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <KeyField label="PayMongo public key" value={form.paymongo_public_key} source={form.paymongo_public_key_source} onChange={(v) => set('paymongo_public_key', v)} />
        <KeyField label="PayMongo secret key" value={form.paymongo_secret_key} source={form.paymongo_secret_key_source} onChange={(v) => set('paymongo_secret_key', v)} />
        <KeyField label="PayMongo webhook secret" value={form.paymongo_webhook_secret} source={form.paymongo_webhook_secret_source} onChange={(v) => set('paymongo_webhook_secret', v)} />

        <div className="bg-paper-3 border border-rule rounded-md px-3 py-2.5 text-[11px] text-neutral2 leading-relaxed">
          <p className="font-bold text-ink mb-1">QR Ph webhook setup</p>
          <p>
            In the PayMongo Dashboard → Developers → Webhooks, point the endpoint to{' '}
            <code className="text-accent">https://&lt;api-host&gt;/api/webhooks/paymongo</code>
            {' '}and subscribe to <code className="text-accent">payment.paid</code>,{' '}
            <code className="text-accent">payment.failed</code>, and{' '}
            <code className="text-accent">qrph.expired</code>. Paste the signing secret above.
          </p>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full py-3.5 bg-accent text-black font-display font-extrabold text-xs rounded-pill flex items-center justify-center gap-1.5 hover:bg-accent-2 transition-all shadow-md disabled:opacity-60"
        >
          <Save size={14} /> {saving ? 'Saving…' : 'Save API keys'}
        </button>
      </form>
    </div>
  )
}

function Field({ label, type = 'text', value, onChange }) {
  return (
    <div>
      <label className="block text-xs font-bold text-neutral2 mb-1">{label}</label>
      <input
        type={type}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-3 rounded-md bg-paper-3 border border-rule text-ink text-sm focus:border-accent outline-none"
      />
    </div>
  )
}

function KeyField({ label, value, source, onChange }) {
  return (
    <div>
      <label className="block text-xs font-bold text-neutral2 mb-1 flex items-center justify-between">
        <span>{label}</span>
        {source && <span className="text-[10px] text-muted font-outlier uppercase">{source === 'db' ? 'db override' : 'env fallback'}</span>}
      </label>
      <input
        type="text"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste new key to rotate"
        className="w-full px-4 py-3 rounded-md bg-paper-3 border border-rule text-ink text-sm font-mono focus:border-accent outline-none"
      />
    </div>
  )
}

function ToggleField({ label, hint, checked, onChange }) {
  return (
    <div className="flex items-center justify-between p-3 bg-paper-3 rounded-md border border-rule">
      <div className="min-w-0 pr-3">
        <div className="text-xs font-bold text-ink">{label}</div>
        {hint && <div className="text-[10px] text-muted">{hint}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full p-0.5 transition-colors ${checked ? 'bg-accent' : 'bg-paper-4'}`}
      >
        <span className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  )
}
