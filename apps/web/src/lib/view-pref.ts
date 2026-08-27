export type ListView = "card" | "table"

export function parseListView(value: unknown): ListView | undefined {
  return value === "card" || value === "table" ? value : undefined
}

export function getStoredView(key: string, fallback: ListView = "card"): ListView {
  if (typeof window === "undefined") return fallback
  return parseListView(localStorage.getItem(key)) ?? fallback
}

export function setStoredView(key: string, view: ListView) {
  if (typeof window === "undefined") return
  localStorage.setItem(key, view)
}
