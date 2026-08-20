import * as React from "react"
import { api, getToken, setToken, type Envelope } from "./api"

export type AuthUser = {
  id: string
  email: string
  name: string
  isActive: boolean
  mustChangePassword?: boolean
  lastLoginAt?: string | null
  role?: string | null
  standupScopePreference?: "ask" | "everyone" | "group"
  standupLayoutPreference?: "card" | "table"
  standupProjectAccentPreference?: "off" | "muted" | "on"
  standupPreferredGroupId?: string | null
  standupPreferredGroup?: { id: string; name: string } | null
  createdAt?: string
  updatedAt?: string
}

type AuthContextValue = {
  user: AuthUser | null
  token: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<AuthUser>
  loginWithPasskey: (email?: string) => Promise<AuthUser>
  logout: () => void
  refreshUser: () => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
}

const AuthContext = React.createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(null)
  const [token, setTokenState] = React.useState<string | null>(() => getToken())
  const [loading, setLoading] = React.useState(true)

  const refreshUser = React.useCallback(async () => {
    const current = getToken()
    if (!current) {
      setUser(null)
      setTokenState(null)
      return
    }
    try {
      const res = await api<Envelope<AuthUser>>("/auth/me", { token: current })
      setUser(res.data)
      setTokenState(current)
    } catch {
      setToken(null)
      setUser(null)
      setTokenState(null)
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await refreshUser()
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshUser])

  const login = React.useCallback(async (email: string, password: string) => {
    const res = await api<Envelope<{ accessToken: string; user: AuthUser }>>("/auth/login", {
      method: "POST",
      body: { email, password },
      skipAuth: true,
    })
    setToken(res.data.accessToken)
    setTokenState(res.data.accessToken)
    setUser(res.data.user)
    return res.data.user
  }, [])

  const loginWithPasskey = React.useCallback(async (email?: string) => {
    const { startAuthentication } = await import("@simplewebauthn/browser")
    const optionsRes = await api<
      Envelope<{
        challengeId: string
        options: Parameters<typeof startAuthentication>[0]["optionsJSON"]
      }>
    >("/auth/passkeys/login/options", {
      method: "POST",
      body: email ? { email } : {},
      skipAuth: true,
    })
    const credential = await startAuthentication({
      optionsJSON: optionsRes.data.options,
    })
    const res = await api<Envelope<{ accessToken: string; user: AuthUser }>>(
      "/auth/passkeys/login/verify",
      {
        method: "POST",
        body: { challengeId: optionsRes.data.challengeId, credential },
        skipAuth: true,
      },
    )
    setToken(res.data.accessToken)
    setTokenState(res.data.accessToken)
    setUser(res.data.user)
    return res.data.user
  }, [])

  const logout = React.useCallback(() => {
    setToken(null)
    setTokenState(null)
    setUser(null)
  }, [])

  const changePassword = React.useCallback(
    async (currentPassword: string, newPassword: string) => {
      await api("/auth/change-password", {
        method: "POST",
        body: { currentPassword, newPassword },
      })
      await refreshUser()
    },
    [refreshUser],
  )

  const value = React.useMemo(
    () => ({
      user,
      token,
      loading,
      login,
      loginWithPasskey,
      logout,
      refreshUser,
      changePassword,
    }),
    [user, token, loading, login, loginWithPasskey, logout, refreshUser, changePassword],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
