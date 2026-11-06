import React, { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff, Lock } from 'lucide-react'
import { resetPassword } from '../api/client'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const email = searchParams.get('email') || ''
  const token = searchParams.get('token') || ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (!email || !token) {
      setError('This reset link is incomplete. Please start again from Forgot password.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    try {
      await resetPassword({ email, token, new_password: password })
      setSuccess('Password reset. Redirecting to sign in…')
      setTimeout(() => navigate('/login'), 900)
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not reset password')
    } finally {
      setLoading(false)
    }
  }

  if (!email || !token) {
    return (
      <div className="min-h-dvh bg-paper text-ink flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          <h1 className="font-display font-black text-2xl mb-2">Invalid reset link</h1>
          <p className="text-sm text-muted mb-6">Request a new password reset to continue.</p>
          <Link to="/forgot-password" className="inline-flex px-6 py-3 bg-accent text-black font-display font-bold text-sm rounded-pill">
            Forgot password
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-paper text-ink flex flex-col items-center justify-center p-6 sm:p-10">
      <div className="w-full max-w-sm">
        <Link to="/login" className="inline-flex items-center gap-2 text-sm text-muted mb-10 hover:text-neutral2">
          <ArrowLeft size={14} /> Back to sign in
        </Link>

        <h1 className="font-display font-black text-3xl mb-2">Set new password</h1>
        <p className="text-sm text-muted mb-7">
          Resetting password for <span className="text-ink font-medium">{email}</span>
        </p>

        {error && (
          <div className="bg-error/10 border border-error/30 text-error text-xs p-3 rounded-md mb-4">{error}</div>
        )}
        {success && (
          <div className="bg-success/10 border border-success/30 text-success text-xs p-3 rounded-md mb-4">{success}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block font-display font-semibold text-xs text-neutral2 mb-1.5">New password</label>
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full px-4 py-3.5 pr-12 rounded-md bg-paper-2 border-[1.5px] border-rule text-ink text-sm focus:border-accent outline-none"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted"
                aria-label={show ? 'Hide password' : 'Show password'}
              >
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block font-display font-semibold text-xs text-neutral2 mb-1.5">Confirm password</label>
            <input
              type={show ? 'text' : 'password'}
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className="w-full px-4 py-3.5 rounded-md bg-paper-2 border-[1.5px] border-rule text-ink text-sm focus:border-accent outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-4 bg-accent text-black font-display font-bold text-base rounded-pill disabled:opacity-60"
          >
            <Lock size={18} /> {loading ? 'Saving…' : 'Save new password'}
          </button>
        </form>
      </div>
    </div>
  )
}
