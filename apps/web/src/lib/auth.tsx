import * as React from "react"
import { api, getToken, setToken, type Envelope } from "./api"

export type AuthUser = {
  id: string
  email: string
  name: string
  isActive: boolean
  createdAt?: string
  updatedAt?: string
}

type AuthContextValue = {
  user: AuthUser | null
  token: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
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
  }, [])

  const logout = React.useCallback(() => {
    setToken(null)
    setTokenState(null)
    setUser(null)
  }, [])

  const value = React.useMemo(
    () => ({ user, token, loading, login, logout, refreshUser }),
    [user, token, loading, login, logout, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
