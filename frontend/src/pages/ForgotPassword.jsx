import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Mail } from 'lucide-react'
import { forgotPassword } from '../api/client'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setInfo('')
    try {
      const res = await forgotPassword(email.trim())
      setInfo(res.message || 'If an account exists for that email, check your inbox for a reset link.')
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh bg-paper text-ink flex flex-col items-center justify-center p-6 sm:p-10">
      <div className="w-full max-w-sm">
        <Link to="/login" className="inline-flex items-center gap-2 text-sm text-muted mb-10 hover:text-neutral2">
          <ArrowLeft size={14} /> Back to sign in
        </Link>

        <div className="font-display font-black text-xl flex items-center gap-2 mb-8">
          <img src="/logo.png" alt="SeryeKo" className="w-7 h-7 rounded-full object-cover" />
          SeryeKo<span className="text-accent">.com</span>
        </div>

        <h1 className="font-display font-black text-3xl mb-2">Forgot password?</h1>
        <p className="text-sm text-muted mb-7">
          Enter the email on your account and we&apos;ll help you set a new password.
        </p>

        {error && (
          <div className="bg-error/10 border border-error/30 text-error text-xs p-3 rounded-md mb-4">{error}</div>
        )}
        {info && (
          <div className="bg-paper-2 border border-rule text-neutral2 text-xs p-3 rounded-md mb-4">{info}</div>
        )}

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
              className="w-full px-4 py-3.5 rounded-md bg-paper-2 border-[1.5px] border-rule text-ink text-sm focus:border-accent outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-4 bg-accent text-black font-display font-bold text-base rounded-pill disabled:opacity-60"
          >
            <Mail size={18} /> {loading ? 'Checking…' : 'Continue'}
          </button>
        </form>

        <p className="mt-7 text-center text-sm text-muted">
          Remembered it? <Link to="/login" className="text-accent font-semibold hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
