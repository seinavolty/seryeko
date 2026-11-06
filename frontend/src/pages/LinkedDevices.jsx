import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Smartphone, Monitor, Trash2 } from 'lucide-react'

const STORAGE_KEY = 'seryeko_devices'
const MAX_DEVICES = 3

function detectDevice() {
  const ua = navigator.userAgent || ''
  const isMobile = /Mobile|Android|iPhone|iPad/i.test(ua)
  let name = 'This browser'
  if (/iPhone/i.test(ua)) name = 'iPhone'
  else if (/iPad/i.test(ua)) name = 'iPad'
  else if (/Android/i.test(ua)) name = 'Android phone'
  else if (/Mac/i.test(ua)) name = 'Mac'
  else if (/Windows/i.test(ua)) name = 'Windows PC'
  else if (/Linux/i.test(ua)) name = 'Linux'
  return {
    id: 'current',
    name,
    type: isMobile ? 'mobile' : 'desktop',
    lastActive: new Date().toISOString(),
    current: true,
  }
}

function loadDevices() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    if (!Array.isArray(raw)) return []
    return raw.filter((d) => d && d.id && !d.current)
  } catch {
    return []
  }
}

export default function LinkedDevices() {
  const navigate = useNavigate()
  const current = useMemo(() => detectDevice(), [])
  const [others, setOthers] = useState(() => loadDevices())

  const devices = [current, ...others].slice(0, MAX_DEVICES)

  const removeDevice = (id) => {
    const next = others.filter((d) => d.id !== id)
    setOthers(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
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
        <h1 className="font-display font-bold text-base">Linked Devices</h1>
      </header>

      <div className="px-4 pt-6">
        <p className="text-sm text-muted mb-2">
          Lifetime members can watch on up to {MAX_DEVICES} devices at once.
        </p>
        <p className="text-xs font-outlier uppercase text-muted mb-5">
          {devices.length} / {MAX_DEVICES} active
        </p>

        <div className="space-y-2">
          {devices.map((device) => {
            const Icon = device.type === 'mobile' ? Smartphone : Monitor
            return (
              <div
                key={device.id}
                className="flex items-center gap-3 p-3.5 bg-paper-2 border border-rule rounded-md"
              >
                <div className="w-10 h-10 rounded-full bg-paper-3 flex items-center justify-center text-neutral2">
                  <Icon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-display font-semibold text-ink truncate">
                    {device.name}
                    {device.current && (
                      <span className="ml-2 text-[10px] font-outlier uppercase text-accent">This device</span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted">
                    Last active {new Date(device.lastActive).toLocaleString('en-US', { timeZone: 'Asia/Manila' })}
                  </div>
                </div>
                {!device.current && (
                  <button
                    type="button"
                    onClick={() => removeDevice(device.id)}
                    className="w-8 h-8 rounded-full bg-error/10 text-error flex items-center justify-center"
                    aria-label={`Remove ${device.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {devices.length < MAX_DEVICES && (
          <p className="text-xs text-muted mt-5">
            Sign in on another phone or browser to add a device. You have {MAX_DEVICES - devices.length} slot
            {MAX_DEVICES - devices.length === 1 ? '' : 's'} left.
          </p>
        )}
      </div>
    </div>
  )
}
