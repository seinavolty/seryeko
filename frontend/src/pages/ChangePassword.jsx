import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff, Lock } from 'lucide-react'
import { changePassword } from '../api/client'

export default function ChangePassword() {
  const navigate = useNavigate()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match')
      return
    }
    setLoading(true)
    try {
      await changePassword({ current_password: currentPassword, new_password: newPassword })
      setSuccess('Password updated')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => navigate('/profile?tab=settings'), 900)
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not change password')
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
        <h1 className="font-display font-bold text-base">Change Password</h1>
      </header>

      <div className="px-4 pt-6">
        <p className="text-sm text-muted mb-6">
          Choose a strong password you don&apos;t use elsewhere. Minimum 8 characters.
        </p>

        {error && (
          <div className="bg-error/10 border border-error/30 text-error text-xs p-3 rounded-md mb-4">{error}</div>
        )}
        {success && (
          <div className="bg-success/10 border border-success/30 text-success text-xs p-3 rounded-md mb-4">{success}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <PasswordField
            label="Current password"
            value={currentPassword}
            onChange={setCurrentPassword}
            show={showCurrent}
            onToggle={() => setShowCurrent((s) => !s)}
            autoComplete="current-password"
          />
          <PasswordField
            label="New password"
            value={newPassword}
            onChange={setNewPassword}
            show={showNew}
            onToggle={() => setShowNew((s) => !s)}
            autoComplete="new-password"
          />
          <PasswordField
            label="Confirm new password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            show={showNew}
            onToggle={() => setShowNew((s) => !s)}
            autoComplete="new-password"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3.5 mt-2 bg-accent text-black font-display font-bold text-sm rounded-pill disabled:opacity-60"
          >
            <Lock size={16} /> {loading ? 'Updating…' : 'Update password'}
          </button>
        </form>

        <p className="text-center text-xs text-muted mt-6">
          Forgot your current password?{' '}
          <Link to="/forgot-password" className="text-accent hover:underline">Reset it</Link>
        </p>
      </div>
    </div>
  )
}

function PasswordField({ label, value, onChange, show, onToggle, autoComplete }) {
  return (
    <div>
      <label className="block font-display font-semibold text-xs text-neutral2 mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          className="w-full px-4 py-3.5 pr-12 rounded-md bg-paper-2 border-[1.5px] border-rule text-ink text-sm focus:border-accent outline-none"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-neutral2"
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  )
}
