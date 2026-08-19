import { ApiError } from "@/lib/api"

export function webAuthnErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message
  if (err && typeof err === "object" && "name" in err) {
    const name = String((err as { name: string }).name)
    if (name === "NotAllowedError") return "Passkey prompt was cancelled."
    if (name === "InvalidStateError") {
      return "This authenticator is already registered."
    }
    if (name === "NotSupportedError") {
      return "Passkeys are not supported in this browser."
    }
  }
  if (err instanceof Error && err.message) return err.message
  return fallback
}

type NavigatorUABrand = { brand: string; version: string }

type NavigatorUAData = {
  brands?: NavigatorUABrand[]
  getHighEntropyValues?: (
    hints: string[],
  ) => Promise<{ model?: string; platform?: string }>
}

function pickBrand(brands: NavigatorUABrand[] | undefined): string | null {
  if (!brands?.length) return null
  const named = brands.find(
    (item) =>
      item.brand &&
      !/not[_ .]?a[_ .]?brand/i.test(item.brand) &&
      item.brand.toLowerCase() !== "chromium",
  )
  const brand =
    named?.brand ??
    brands.find((item) => item.brand.toLowerCase() === "chromium")?.brand
  return brand ? brand.replace(/^Google\s+/i, "") : null
}

/** Headers the API can use to name a new passkey. Client hints are often missing on cross-origin API calls, so the page copies them when the UA-CH API is available. */
export async function deviceHintHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {}
  if (typeof navigator === "undefined") return headers
  const uaData = (navigator as Navigator & { userAgentData?: NavigatorUAData })
    .userAgentData
  if (!uaData) return headers
  const brand = pickBrand(uaData.brands)
  if (brand) headers["X-Device-Browser"] = brand
  try {
    const high = await uaData.getHighEntropyValues?.(["model", "platform"])
    if (high?.model?.trim()) headers["X-Device-Model"] = high.model.trim()
    if (high?.platform?.trim()) headers["X-Device-Platform"] = high.platform.trim()
  } catch {
    // High-entropy hints are optional.
  }
  return headers
}
