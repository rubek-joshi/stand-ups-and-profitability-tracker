import type { CardWidth } from "@/components/dashboard/cards"

export const LAYOUT_STORAGE_KEY = "ops-dashboard-layout-v2"
export const LAYOUT_CLIPBOARD_VERSION = 1

export const CARD_WIDTHS: CardWidth[] = ["sm", "md", "lg", "xl"]

export interface LayoutItem {
  id: string
  width: CardWidth
  hidden?: boolean
}

export interface LayoutClipboard {
  v: number
  items: LayoutItem[]
}

type CardLike = { id: string; defaultWidth: CardWidth }

export function defaultLayout(defs: CardLike[]): LayoutItem[] {
  return defs.map((card) => ({ id: card.id, width: card.defaultWidth, hidden: false }))
}

export function mergeLayout(parsed: LayoutItem[], defs: CardLike[]): LayoutItem[] {
  const known = new Map(defaultLayout(defs).map((item) => [item.id, item]))
  const merged = parsed.filter((item) => known.has(item.id))
  for (const item of known.values()) {
    if (!merged.some((existing) => existing.id === item.id)) merged.push(item)
  }
  return merged
}

function isCardWidth(value: unknown): value is CardWidth {
  return typeof value === "string" && (CARD_WIDTHS as string[]).includes(value)
}

function normalizeItem(
  value: unknown,
  defs: CardLike[],
): { item: LayoutItem | null; warning?: string } {
  if (!value || typeof value !== "object") {
    return { item: null, warning: "Skipped a panel that was not an object." }
  }
  const record = value as Record<string, unknown>
  if (typeof record.id !== "string" || !record.id.trim()) {
    return { item: null, warning: "Skipped a panel with a missing id." }
  }
  const def = defs.find((card) => card.id === record.id)
  if (!def) {
    return { item: null, warning: `Ignored unknown panel “${record.id}”.` }
  }
  const width = isCardWidth(record.width) ? record.width : def.defaultWidth
  const hidden = record.hidden === true
  const warning =
    record.width !== undefined && !isCardWidth(record.width)
      ? `Used default size for “${def.id}”.`
      : undefined
  return { item: { id: def.id, width, hidden }, warning }
}

export function parseLayoutPayload(
  raw: unknown,
  defs: CardLike[],
): { ok: true; items: LayoutItem[]; warnings: string[] } | { ok: false; error: string } {
  if (raw == null) {
    return { ok: false, error: "Layout is empty." }
  }

  let payload: unknown = raw
  if (typeof raw === "string") {
    const trimmed = raw.trim()
    if (!trimmed) return { ok: false, error: "Paste a layout JSON blob first." }
    try {
      payload = JSON.parse(trimmed) as unknown
    } catch {
      return {
        ok: false,
        error: "That is not valid JSON. Copy the layout again and paste the full blob.",
      }
    }
  }

  let entries: unknown[] | null = null
  if (Array.isArray(payload)) {
    entries = payload
  } else if (payload && typeof payload === "object" && "items" in payload) {
    const items = (payload as { items: unknown }).items
    if (!Array.isArray(items)) {
      return { ok: false, error: "Layout JSON must include an items array." }
    }
    entries = items
  }

  if (!entries) {
    return {
      ok: false,
      error: "Layout JSON must be a list of panels or { v, items }.",
    }
  }

  if (entries.length === 0) {
    return { ok: false, error: "Layout JSON has no panels." }
  }

  const seen = new Set<string>()
  const items: LayoutItem[] = []
  const warnings: string[] = []

  for (const entry of entries) {
    const { item, warning } = normalizeItem(entry, defs)
    if (warning) warnings.push(warning)
    if (!item || seen.has(item.id)) continue
    seen.add(item.id)
    items.push(item)
  }

  if (items.length === 0) {
    return {
      ok: false,
      error: "No recognized dashboard panels in this layout.",
    }
  }

  return { ok: true, items: mergeLayout(items, defs), warnings }
}

export function serializeLayout(items: LayoutItem[]): string {
  const payload: LayoutClipboard = {
    v: LAYOUT_CLIPBOARD_VERSION,
    items,
  }
  return JSON.stringify(payload, null, 2)
}

export function loadLayoutFromStorage(defs: CardLike[]): LayoutItem[] {
  if (typeof window === "undefined") return defaultLayout(defs)
  try {
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (!raw) return defaultLayout(defs)
    const parsed = parseLayoutPayload(raw, defs)
    return parsed.ok ? parsed.items : defaultLayout(defs)
  } catch {
    return defaultLayout(defs)
  }
}

export function saveLayoutToStorage(items: LayoutItem[]): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(LAYOUT_STORAGE_KEY, serializeLayout(items))
}

export async function writeClipboard(
  text: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (!navigator.clipboard?.writeText) {
      return {
        ok: false,
        error: "Clipboard copy is not available in this browser. Copy the JSON from the dialog.",
      }
    }
    await navigator.clipboard.writeText(text)
    return { ok: true }
  } catch {
    return {
      ok: false,
      error: "Could not copy to the clipboard. Copy the JSON from the dialog instead.",
    }
  }
}

export async function readClipboard(): Promise<
  { ok: true; text: string } | { ok: false; error: string }
> {
  try {
    if (!navigator.clipboard?.readText) {
      return {
        ok: false,
        error: "Clipboard paste is not available. Paste the JSON into the box below.",
      }
    }
    const text = await navigator.clipboard.readText()
    if (!text.trim()) {
      return { ok: false, error: "Clipboard is empty. Paste the JSON into the box below." }
    }
    return { ok: true, text }
  } catch {
    return {
      ok: false,
      error: "Could not read the clipboard. Paste the JSON into the box below.",
    }
  }
}
