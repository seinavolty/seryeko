import axios from 'axios'

const API_BASE = '/api'

export const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Attach token if present
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export const fetchTrending = async (provider = 'dramabox') => {
  // Catalog titles are English-only regardless of UI language preference
  const res = await api.get(`/content/trending?provider=${provider}&lang=en`)
  return res.data.items || []
}

export const fetchSearch = async (query) => {
  if (!query) return { items: [], count: 0 }
  const res = await api.get(`/content/search`, { params: { q: query, lang: 'en' } })
  return res.data
}

export const fetchBrowse = async ({
  genre, country, status, provider, page = 1, pageSize = 12,
} = {}) => {
  const res = await api.get('/content/browse', {
    params: { genre, country, status, provider, page, page_size: pageSize, lang: 'en' },
  })
  return res.data
}

export const fetchProviders = async () => {
  const res = await api.get('/content/providers')
  return res.data
}

export const fetchDramaDetail = async (dramaId) => {
  const res = await api.get(`/content/detail/${dramaId}`)
  return res.data
}

export const fetchEpisodes = async (dramaId, { refresh = false } = {}) => {
  const res = await api.get(`/content/episodes/${dramaId}`, {
    params: refresh ? { refresh: true } : undefined,
  })
  return res.data
}

export const reportVideoIssue = async ({
  dramaId, episodeNum, episodeId, title, videoUrl, reason = 'playback_failed', details = '',
} = {}) => {
  const res = await api.post('/content/reports', {
    drama_id: dramaId,
    episode_num: episodeNum,
    episode_id: episodeId || '',
    title: title || '',
    video_url: videoUrl || '',
    reason,
    details,
  })
  return res.data
}

export const fetchPricing = async () => {
  const res = await api.get('/subscription/pricing')
  return res.data
}

export const recordWatchEpisode = async (dramaId, epNum) => {
  const res = await api.post(`/content/episodes/${dramaId}/watch/${epNum}`)
  return res.data
}

export const toggleEpisodeLike = async (dramaId, epNum) => {
  const res = await api.post(`/content/episodes/${dramaId}/likes/${epNum}`)
  return res.data
}

export const startQrphCheckout = async (referralCode = null) => {
  const res = await api.post('/subscription/checkout', {
    payment_method: 'qrph',
    referral_code: referralCode || null,
  })
  return res.data
}

export const fetchPaymentStatus = async (paymentIntentId) => {
  const res = await api.get('/subscription/payment-status', {
    params: { payment_intent_id: paymentIntentId },
  })
  return res.data
}

/** Sandbox-only: instant activate when PayMongo keys contain "mock". */
export const unlockLifetimeMembership = async (referralCode = null) => {
  const res = await api.post('/subscription/confirm-mock-payment', {
    payment_method: 'qrph',
    referral_code: referralCode || null,
  })
  return res.data
}

export const fetchAdminOverview = async () => {
  const res = await api.get('/admin/overview')
  return res.data
}

// Admin — Settings — Pricing
export const fetchAdminPricingSettings = async () => (await api.get('/admin/settings/pricing')).data
export const updateAdminPricingSettings = async (data) => (await api.put('/admin/settings/pricing', data)).data

export const fetchAdminReferralSettings = async () => (await api.get('/admin/settings/referral')).data
export const updateAdminReferralSettings = async (data) => (await api.put('/admin/settings/referral', data)).data

export const fetchAdminKeysSettings = async () => (await api.get('/admin/settings/keys')).data
export const updateAdminKeysSettings = async (data) => (await api.put('/admin/settings/keys', data)).data

// Admin — Subscribers
export const fetchAdminSubscribers = async ({ q, status } = {}) =>
  (await api.get('/admin/subscribers', { params: { q, status } })).data

export const updateAdminSubscriber = async (id, action) =>
  (await api.patch(`/admin/subscribers/${id}`, { action })).data

// Admin — Cancellations
export const fetchAdminCancellations = async (status = 'pending') =>
  (await api.get('/admin/cancellations', { params: { status } })).data

export const updateAdminCancellation = async (id, action, admin_note = '') =>
  (await api.patch(`/admin/cancellations/${id}`, { action, admin_note })).data

// Admin — Referrals
export const fetchAdminReferrers = async () => (await api.get('/admin/referrals/referrers')).data
export const updateAdminReferralCode = async (codeId, data) =>
  (await api.patch(`/admin/referrals/codes/${codeId}`, data)).data

export const fetchAdminCommissions = async (status = 'all') =>
  (await api.get('/admin/referrals/commissions', { params: { status } })).data

export const updateAdminCommission = async (id, action, note = '') =>
  (await api.patch(`/admin/referrals/commissions/${id}`, { action, note })).data

export const fetchAdminWithdrawals = async (status = 'pending') =>
  (await api.get('/admin/referrals/withdrawals', { params: { status } })).data

export const updateAdminWithdrawal = async (id, action, admin_note = '') =>
  (await api.patch(`/admin/referrals/withdrawals/${id}`, { action, admin_note })).data

// Admin — Providers
export const fetchAdminProviders = async () => (await api.get('/admin/providers')).data
export const updateAdminProvider = async (id, is_enabled) =>
  (await api.patch(`/admin/providers/${id}`, { is_enabled })).data
export const refreshAdminProviderStatus = async () => (await api.post('/admin/providers/refresh-status')).data

// Admin — Catalog CMS
export const fetchAdminCatalog = async ({ q, provider, page = 1, pageSize = 20 } = {}) =>
  (await api.get('/admin/catalog', { params: { q, provider, page, page_size: pageSize } })).data
export const updateAdminCatalogItem = async (dramaId, data) =>
  (await api.patch(`/admin/catalog/${dramaId}`, data)).data
export const refreshAdminCatalogItem = async (dramaId) =>
  (await api.post(`/admin/catalog/${dramaId}/refresh`)).data

// Admin — Analytics + Webhooks
export const fetchAdminAnalyticsContent = async () => (await api.get('/admin/analytics/content')).data
export const fetchAdminAnalyticsSignups = async (days = 7) =>
  (await api.get('/admin/analytics/signups', { params: { days } })).data
export const fetchAdminWebhooks = async () => (await api.get('/admin/webhooks')).data

// Admin — Video playback reports
export const fetchAdminVideoReports = async (status = 'open') =>
  (await api.get('/admin/reports', { params: { status } })).data
export const updateAdminVideoReport = async (id, action, admin_note = '') =>
  (await api.patch(`/admin/reports/${id}`, { action, admin_note })).data
export const fetchAdminReportProbe = async (dramaId, episodeNum = 1) =>
  (await api.get(`/admin/reports/probe/${encodeURIComponent(dramaId)}`, {
    params: { episode_num: episodeNum },
  })).data

// Referral (user-facing)
export const fetchMyReferral = async () => (await api.get('/referral/me')).data

export const fetchMyWithdrawals = async () => (await api.get('/referral/withdrawals')).data

export const createWithdrawal = async (payload) =>
  (await api.post('/referral/withdrawals', payload)).data

// Subscription pricing / vouchers / refunds
export const previewPrice = async (referral_code) =>
  (await api.post('/subscription/preview-price', { referral_code })).data

export const createRefundRequest = async (reason, details = '') =>
  (await api.post('/subscription/refund-request', { reason, details })).data

export const fetchMyRefundRequest = async () => (await api.get('/subscription/refund-request/mine')).data

// Watchlist
export const fetchWatchlist = async () => {
  const res = await api.get('/watchlist')
  return res.data.items || []
}

export const addToWatchlist = async (drama) => {
  const res = await api.post('/watchlist', {
    drama_id: drama.id,
    title: drama.title || '',
    cover: drama.cover || '',
    provider: drama.provider || ''
  })
  return res.data
}

export const removeFromWatchlist = async (dramaId) => {
  const res = await api.delete(`/watchlist/${dramaId}`)
  return res.data
}

export const fetchContinueWatching = async () => {
  const res = await api.get('/watchlist/continue-watching')
  return res.data.items || []
}

// Auth — Google OAuth
export const getGoogleLoginUrl = async () => {
  const res = await api.get('/auth/google/login')
  return res.data.auth_url
}

export const fetchMe = async () => {
  const res = await api.get('/auth/me')
  return res.data
}

export const updateProfile = async ({ full_name }) => {
  const res = await api.patch('/auth/me', { full_name })
  return res.data
}

export const changePassword = async ({ current_password, new_password }) => {
  const res = await api.post('/auth/change-password', { current_password, new_password })
  return res.data
}

export const forgotPassword = async (email) => {
  const res = await api.post('/auth/forgot-password', { email })
  return res.data
}

export const resetPassword = async ({ email, token, new_password }) => {
  const res = await api.post('/auth/reset-password', { email, token, new_password })
  return res.data
}
