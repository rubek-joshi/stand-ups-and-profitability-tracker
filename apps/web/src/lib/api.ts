const TOKEN_KEY = "pt_token"
const DEFAULT_API_ORIGIN = "http://localhost:4101"

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "")
}

/** API origin from VITE_API_URL. Trailing `/api` is ignored so env can be origin or origin+/api. */
export function getApiOrigin(): string {
  const raw = import.meta.env.VITE_API_URL || DEFAULT_API_ORIGIN
  return stripTrailingSlash(raw)
}

/** Socket.IO origin — never includes the `/api` HTTP prefix. */
export function getApiBaseUrl(): string {
  const origin = getApiOrigin()
  return origin.endsWith("/api") ? origin.slice(0, -4) : origin
}

function httpApiBase(): string {
  const origin = getApiOrigin()
  return origin.endsWith("/api") ? origin : `${origin}/api`
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

  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  const res = await fetch(`${httpApiBase()}${normalizedPath}`, {
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
      "API returned the web app instead of JSON. Nginx must proxy /api/ to the Nest server (port 4101).",
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
        "API returned a non-JSON response. Check that VITE_API_URL points at the API origin.",
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
