export type PageSize = 10 | 25 | 50 | 100

export const PAGE_SIZES: PageSize[] = [10, 25, 50, 100]

export type ListSearch = {
  q?: string
  page: number
  pageSize: PageSize
}

export type PaginationMeta = {
  total: number
  page?: number
  pageSize?: number
}

export function isPageSize(value: unknown): value is PageSize {
  return value === 10 || value === 25 || value === 50 || value === 100
}

export function parsePage(value: unknown, fallback = 1): number {
  const n = typeof value === "string" || typeof value === "number" ? Number(value) : NaN
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback
}

export function parsePageSize(value: unknown, fallback: PageSize = 25): PageSize {
  const n = typeof value === "string" || typeof value === "number" ? Number(value) : NaN
  return isPageSize(n) ? n : fallback
}

export function parseOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

export type SortDir = "asc" | "desc"

export function parseSortDir(value: unknown): SortDir | undefined {
  return value === "asc" || value === "desc" ? value : undefined
}

/** Shared list URL search defaults (q optional). */
export function parseListSearch(search: Record<string, unknown>): ListSearch {
  return {
    q: parseOptionalString(search.q),
    page: parsePage(search.page),
    pageSize: parsePageSize(search.pageSize),
  }
}

export const DEFAULT_LIST_SEARCH: ListSearch = { page: 1, pageSize: 25 }

export function clampPage(page: number, totalPages: number) {
  return Math.min(Math.max(1, page), Math.max(1, totalPages))
}

export function totalPagesFor(total: number, pageSize: number) {
  return Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize)))
}

export function buildListQuery(params: {
  q?: string
  page?: number
  pageSize?: number
  [key: string]: string | number | boolean | undefined | null
}): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue
    search.set(key, String(value))
  }
  return search.toString()
}
