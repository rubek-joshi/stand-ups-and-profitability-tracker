import * as React from "react"

const THEME_KEY = "pt_theme"
export type ThemeChoice = "light" | "dark"

function getSystemDark(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

function applyThemeClass(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark)
}

export function getStoredTheme(): ThemeChoice | null {
  if (typeof window === "undefined") return null
  const v = localStorage.getItem(THEME_KEY)
  if (v === "light" || v === "dark") return v
  return null
}

export function resolveIsDark(stored: ThemeChoice | null): boolean {
  if (stored) return stored === "dark"
  return getSystemDark()
}

type ThemeContextValue = {
  theme: ThemeChoice | "system"
  isDark: boolean
  setTheme: (theme: ThemeChoice | "system") => void
  toggleTheme: () => void
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [stored, setStored] = React.useState<ThemeChoice | null>(() => getStoredTheme())
  const [isDark, setIsDark] = React.useState(() => resolveIsDark(getStoredTheme()))

  React.useEffect(() => {
    applyThemeClass(isDark)
  }, [isDark])

  React.useEffect(() => {
    if (stored) return
    const mql = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => setIsDark(mql.matches)
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [stored])

  const setTheme = React.useCallback((theme: ThemeChoice | "system") => {
    if (theme === "system") {
      localStorage.removeItem(THEME_KEY)
      setStored(null)
      setIsDark(getSystemDark())
      return
    }
    localStorage.setItem(THEME_KEY, theme)
    setStored(theme)
    setIsDark(theme === "dark")
  }, [])

  const toggleTheme = React.useCallback(() => {
    setTheme(isDark ? "light" : "dark")
  }, [isDark, setTheme])

  const value = React.useMemo<ThemeContextValue>(
    () => ({
      theme: stored ?? "system",
      isDark,
      setTheme,
      toggleTheme,
    }),
    [stored, isDark, setTheme, toggleTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider")
  return ctx
}

/** Inline script to set theme class before paint (prevent FOUC). */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`
