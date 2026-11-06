import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { updateProfile } from '../api/client'

export default function EditProfile() {
  const navigate = useNavigate()
  const { user, setUser } = useAuthStore()
  const [fullName, setFullName] = useState(user?.full_name || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const name = fullName.trim()
    if (!name) {
      setError('Full name is required')
      return
    }
    setLoading(true)
    setError('')
    setSaved(false)
    try {
      const updated = await updateProfile({ full_name: name })
      setUser({ ...user, ...updated })
      setSaved(true)
      setTimeout(() => navigate('/profile?tab=settings'), 700)
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not update profile')
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
        <h1 className="font-display font-bold text-base">Edit Profile</h1>
      </header>

      <div className="px-4 pt-6">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-accent to-rose-500 flex items-center justify-center font-display font-black text-2xl text-black">
            {(fullName || user?.email || 'G')[0].toUpperCase()}
          </div>
          <div>
            <p className="text-sm text-muted">Signed in as</p>
            <p className="text-sm font-display font-semibold text-ink">{user?.email}</p>
          </div>
        </div>

        {error && (
          <div className="bg-error/10 border border-error/30 text-error text-xs p-3 rounded-md mb-4">{error}</div>
        )}
        {saved && (
          <div className="bg-success/10 border border-success/30 text-success text-xs p-3 rounded-md mb-4">
            Profile saved
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block font-display font-semibold text-xs text-neutral2 mb-1.5">Full name</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your name"
              className="w-full px-4 py-3.5 rounded-md bg-paper-2 border-[1.5px] border-rule text-ink text-sm focus:border-accent outline-none"
            />
          </div>

          <div>
            <label className="block font-display font-semibold text-xs text-neutral2 mb-1.5">Email</label>
            <input
              type="email"
              value={user?.email || ''}
              disabled
              className="w-full px-4 py-3.5 rounded-md bg-paper-3 border-[1.5px] border-rule text-muted text-sm"
            />
            <p className="text-[11px] text-muted mt-1.5">Email can&apos;t be changed here. Contact support if you need a new address.</p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3.5 mt-2 bg-accent text-black font-display font-bold text-sm rounded-pill disabled:opacity-60"
          >
            <Save size={16} /> {loading ? 'Saving…' : 'Save changes'}
          </button>
        </form>

        <p className="text-center text-xs text-muted mt-6">
          <Link to="/profile?tab=settings" className="text-accent hover:underline">Back to settings</Link>
        </p>
      </div>
    </div>
  )
}
