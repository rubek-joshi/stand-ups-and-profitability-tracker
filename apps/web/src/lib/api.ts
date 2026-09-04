const TOKEN_KEY = "pt_token"

/** Socket.IO host (page origin). Nginx/Vite proxy `/socket.io`. */
export function getApiBaseUrl(): string {
  if (typeof window === "undefined") return ""
  return window.location.origin
}

function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`
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

function parseContentDispositionFileName(
  contentDisposition: string | null,
): string | null {
  if (!contentDisposition) return null
  const quoted = /filename="([^"]+)"/i.exec(contentDisposition)
  if (quoted?.[1]) return quoted[1]
  const unquoted = /filename=([^;]+)/i.exec(contentDisposition)
  return unquoted?.[1]?.trim() ?? null
}

export async function downloadFile(
  path: string,
  options: Omit<ApiOptions, "body"> = {},
): Promise<{ blob: Blob; fileName: string }> {
  const { token, skipAuth, headers: initHeaders, ...rest } = options
  const headers = new Headers(initHeaders)

  const authToken = skipAuth ? null : (token ?? getToken())
  if (authToken) headers.set("Authorization", `Bearer ${authToken}`)

  const res = await fetch(apiUrl(path), {
    ...rest,
    headers,
  })

  if (!res.ok) {
    const text = await res.text()
    let json: unknown = null
    if (text) {
      try {
        json = JSON.parse(text)
      } catch {
        throw new ApiError(
          res.status,
          "Download failed with a non-JSON response.",
          text.slice(0, 200),
        )
      }
    }
    const problem = json as { detail?: string; title?: string; message?: string } | null
    const message =
      problem?.detail || problem?.title || problem?.message || res.statusText || "Download failed"
    throw new ApiError(res.status, message, json)
  }

  const blob = await res.blob()
  const fileName =
    parseContentDispositionFileName(res.headers.get("Content-Disposition")) ??
    "download"
  return { blob, fileName }
}

export function triggerBrowserDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
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
