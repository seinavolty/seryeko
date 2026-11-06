import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, RotateCcw } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { createRefundRequest, fetchMyRefundRequest } from '../api/client'

export default function RequestRefund() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [existing, setExisting] = useState(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    fetchMyRefundRequest()
      .then((res) => {
        if (res.request && res.request.status === 'pending') {
          setExisting(res.request)
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false))
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!reason) {
      setError('Please choose a reason')
      return
    }
    setLoading(true)
    try {
      await createRefundRequest(reason, details.trim())
      setSubmitted(true)
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not submit your request. Please try again.')
    } finally {
      setLoading(false)
    }
  }

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
        <h1 className="font-display font-bold text-base">Request Refund</h1>
      </header>

      <div className="px-4 pt-6">
        {!checking && existing ? (
          <div className="text-center py-10">
            <div className="w-14 h-14 rounded-full bg-amber-500/15 text-amber-400 flex items-center justify-center mx-auto mb-4">
              <RotateCcw size={22} />
            </div>
            <h2 className="font-display font-black text-xl mb-2">Request already pending</h2>
            <p className="text-sm text-muted mb-6">
              You already have a pending refund request submitted on{' '}
              {(() => {
                const raw = existing.created_at
                const d = typeof raw === 'string' && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)
                  ? new Date(`${raw}Z`)
                  : new Date(raw)
                return d.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  timeZone: 'Asia/Manila',
                })
              })()}
              .
              We&apos;ll email {user?.email || 'you'} once it&apos;s reviewed.
            </p>
            <button
              type="button"
              onClick={() => navigate('/profile?tab=settings')}
              className="px-6 py-3 bg-accent text-black font-display font-bold text-sm rounded-pill"
            >
              Back to settings
            </button>
          </div>
        ) : submitted ? (
          <div className="text-center py-10">
            <div className="w-14 h-14 rounded-full bg-success/15 text-success flex items-center justify-center mx-auto mb-4">
              <RotateCcw size={22} />
            </div>
            <h2 className="font-display font-black text-xl mb-2">Request received</h2>
            <p className="text-sm text-muted mb-6">
              Thanks — we&apos;ll review your 7-day refund request and email {user?.email || 'you'} within 1–2 business days.
            </p>
            <button
              type="button"
              onClick={() => navigate('/profile?tab=settings')}
              className="px-6 py-3 bg-accent text-black font-display font-bold text-sm rounded-pill"
            >
              Back to settings
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted mb-5">
              Lifetime purchases include a <span className="text-ink font-medium">7-day money-back guarantee</span>.
              Tell us what went wrong and we&apos;ll take a look.
            </p>

            {error && (
              <div className="bg-error/10 border border-error/30 text-error text-xs p-3 rounded-md mb-4">{error}</div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block font-display font-semibold text-xs text-neutral2 mb-1.5">Reason</label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  className="w-full px-4 py-3.5 rounded-md bg-paper-2 border-[1.5px] border-rule text-ink text-sm focus:border-accent outline-none"
                >
                  <option value="">Select a reason</option>
                  <option value="playback">Playback / streaming issues</option>
                  <option value="content">Couldn&apos;t find the dramas I wanted</option>
                  <option value="accidental">Bought by accident</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block font-display font-semibold text-xs text-neutral2 mb-1.5">Details (optional)</label>
                <textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  rows={4}
                  placeholder="Anything that helps us resolve this faster…"
                  className="w-full px-4 py-3.5 rounded-md bg-paper-2 border-[1.5px] border-rule text-ink text-sm focus:border-accent outline-none resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-accent text-black font-display font-bold text-sm rounded-pill disabled:opacity-60"
              >
                <RotateCcw size={16} /> {loading ? 'Submitting…' : 'Submit refund request'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
