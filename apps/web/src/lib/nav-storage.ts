const SIDEBAR_OPEN_KEY = "pt_sidebar_open"
const NAV_GROUPS_KEY = "pt_nav_groups"

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/** Expanded (true) vs icon-collapsed (false). */
export function getSidebarOpen(): boolean {
  if (typeof window === "undefined") return true
  const stored = localStorage.getItem(SIDEBAR_OPEN_KEY)
  if (stored === "true") return true
  if (stored === "false") return false
  const match = document.cookie.match(/(?:^|; )sidebar_state=(true|false)/)
  return match ? match[1] === "true" : true
}

export function setSidebarOpen(open: boolean): void {
  if (typeof window === "undefined") return
  localStorage.setItem(SIDEBAR_OPEN_KEY, String(open))
}

export function getNavGroupOpen(
  groupId: string,
  fallback: boolean,
): boolean {
  const stored = readJson<Record<string, unknown>>(NAV_GROUPS_KEY, {})
  const value = stored[groupId]
  return typeof value === "boolean" ? value : fallback
}

export function setNavGroupOpen(groupId: string, open: boolean): void {
  if (typeof window === "undefined") return
  const stored = readJson<Record<string, boolean>>(NAV_GROUPS_KEY, {})
  localStorage.setItem(
    NAV_GROUPS_KEY,
    JSON.stringify({ ...stored, [groupId]: open }),
  )
}
