const TOKEN_KEY = "pt_token"
const LOCAL_API_ORIGIN = "http://localhost:4101"

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "")
}

/**
 * Socket.IO host. In the browser this is the page origin so Vite (dev) and
 * Nginx (prod) can proxy `/socket.io`. Direct Nest origin is only used off-window.
 */
export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    return window.location.origin
  }
  const raw = import.meta.env.VITE_API_URL || LOCAL_API_ORIGIN
  return stripTrailingSlash(String(raw))
}

function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`
  if (typeof window === "undefined") {
    return `${getApiBaseUrl()}${normalized}`
  }
  return `/api${normalized}`
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null): void {
  if (typeof window === "undefined") return
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number
  body: unknown

  constructor(status: number, message: string, body?: unknown) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.body = body
  }
}

type ApiOptions = Omit<RequestInit, "body"> & {
  body?: unknown
  token?: string | null
  skipAuth?: boolean
}

function looksLikeHtml(text: string, contentType: string): boolean {
  if (contentType.includes("text/html")) return true
  const start = text.trimStart().slice(0, 15).toLowerCase()
  return start.startsWith("<!doctype") || start.startsWith("<html")
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { body, token, skipAuth, headers: initHeaders, ...rest } = options
  const headers = new Headers(initHeaders)

  if (body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json")
  }

  const authToken = skipAuth ? null : (token ?? getToken())
  if (authToken) headers.set("Authorization", `Bearer ${authToken}`)

  const res = await fetch(apiUrl(path), {
    ...rest,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (res.status === 204) return undefined as T

  const text = await res.text()
  const contentType = res.headers.get("content-type") ?? ""

  if (text && looksLikeHtml(text, contentType)) {
    throw new ApiError(
      res.status,
      "API returned the web app instead of JSON. Nginx must proxy /api/ to Nest and strip the /api prefix.",
      text.slice(0, 200),
    )
  }

  let json: unknown = null
  if (text) {
    try {
      json = JSON.parse(text)
    } catch {
      throw new ApiError(
        res.status,
        "API returned a non-JSON response. Check that /api is proxied to the Nest server.",
        text.slice(0, 200),
      )
    }
  }

  if (!res.ok) {
    const problem = json as { detail?: string; title?: string; message?: string } | null
    const message =
      problem?.detail || problem?.title || problem?.message || res.statusText || "Request failed"
    throw new ApiError(res.status, message, json)
  }

  if (
    json &&
    typeof json === "object" &&
    "data" in json &&
    (Object.keys(json as object).length === 1 || "meta" in (json as object))
  ) {
    return json as T
  }

  return { data: json } as T
}

export type Envelope<T> = { data: T }
export type PaginatedEnvelope<T> = {
  data: T
  meta: { total: number; page?: number; pageSize?: number }
}
