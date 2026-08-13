const RECENTS_KEY = "pt_command_recents"
const MAX_RECENTS = 5

export type RecentItem = {
  id: string
  label: string
  to: string
  group: string
}

export function getRecents(): RecentItem[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(RECENTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as RecentItem[]
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENTS) : []
  } catch {
    return []
  }
}

export function pushRecent(item: RecentItem): void {
  if (typeof window === "undefined") return
  const current = getRecents().filter((r) => r.id !== item.id)
  const next = [item, ...current].slice(0, MAX_RECENTS)
  localStorage.setItem(RECENTS_KEY, JSON.stringify(next))
}
