const TOKEN_KEY = "pt_token"

export function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_URL || "http://localhost:4101"
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

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { body, token, skipAuth, headers: initHeaders, ...rest } = options
  const headers = new Headers(initHeaders)

  if (body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  const authToken = skipAuth ? null : (token ?? getToken())
  if (authToken) headers.set("Authorization", `Bearer ${authToken}`)

  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    ...rest,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (res.status === 204) return undefined as T

  const text = await res.text()
  let json: unknown = null
  if (text) {
    try {
      json = JSON.parse(text)
    } catch {
      json = text
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
