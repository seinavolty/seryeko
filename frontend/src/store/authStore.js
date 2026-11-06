import { create } from 'zustand'
import { api } from '../api/client'

export const useAuthStore = create((set) => ({
  user: JSON.parse(localStorage.getItem('user')) || null,
  token: localStorage.getItem('token') || null,
  isAuthenticated: !!localStorage.getItem('token'),
  
  login: async (email, password) => {
    const res = await api.post('/auth/login', { email, password })
    const { access_token, user } = res.data
    localStorage.setItem('token', access_token)
    localStorage.setItem('user', JSON.stringify(user))
    set({ user, token: access_token, isAuthenticated: true })
    return user
  },

  register: async (email, password, full_name = '', referral_code = '') => {
    const res = await api.post('/auth/register', { email, password, full_name, referral_code })
    const { access_token, user } = res.data
    localStorage.setItem('token', access_token)
    localStorage.setItem('user', JSON.stringify(user))
    set({ user, token: access_token, isAuthenticated: true })
    return user
  },

  loginWithToken: async (accessToken) => {
    localStorage.setItem('token', accessToken)
    const res = await api.get('/auth/me')
    const user = res.data
    localStorage.setItem('user', JSON.stringify(user))
    set({ user, token: accessToken, isAuthenticated: true })
    return user
  },

  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    set({ user: null, token: null, isAuthenticated: false })
  },

  setUser: (user) => {
    localStorage.setItem('user', JSON.stringify(user))
    set({ user })
  },

  updateUserSubscription: (subscription) => {
    set((state) => {
      const updated = { ...state.user, subscription }
      localStorage.setItem('user', JSON.stringify(updated))
      return { user: updated }
    })
  }
}))
