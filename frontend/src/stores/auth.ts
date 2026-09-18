// frontend/src/stores/auth.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AuthUser, LoginForm, LoginResponse } from '@/types/auth'

const TOKEN_KEY = 'auth_token'
const USER_KEY = 'auth_user'

function loadUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY))
  const user = ref<AuthUser | null>(loadUser())

  const isAuthenticated = computed(() => !!token.value)

  async function login(form: LoginForm) {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: form.username.trim(),
          password: form.password,
          captchaId: form.captchaId,
          captchaCode: form.captchaCode.trim(),
        }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        let error =
          data.error || `登录失败（HTTP ${response.status}）`
        // Vite 代理在后端重启/断连时常见 502 且无 JSON body
        if (
          !data.error &&
          (response.status === 502 || response.status === 503)
        ) {
          error =
            '无法连接认证服务，请确认 backend 已启动后重试（backend 目录执行 pnpm dev）'
        }
        return {
          success: false,
          error,
        }
      }

      const loginData = data as LoginResponse
      token.value = loginData.token
      user.value = loginData.user
      localStorage.setItem(TOKEN_KEY, loginData.token)
      localStorage.setItem(USER_KEY, JSON.stringify(loginData.user))
      return { success: true, data: loginData }
    } catch (error: any) {
      return { success: false, error: error.message || '登录失败' }
    }
  }

  function logout() {
    token.value = null
    user.value = null
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }

  async function checkAuth() {
    if (!token.value) {
      user.value = null
      return false
    }
    try {
      const response = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token.value}` },
      })
      if (!response.ok) {
        logout()
        return false
      }
      const data = await response.json()
      user.value = data.user
      localStorage.setItem(USER_KEY, JSON.stringify(data.user))
      return true
    } catch {
      return !!token.value
    }
  }

  return {
    token,
    user,
    isAuthenticated,
    login,
    logout,
    checkAuth,
  }
})
