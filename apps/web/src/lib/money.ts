/** Convert NPR amount to paisa (integer). */
export function nprToPaisa(npr: number): number {
  return Math.round(npr * 100)
}

/** Convert paisa (string|number from API) to NPR number. */
export function paisaToNpr(paisa: string | number | null | undefined): number {
  if (paisa === null || paisa === undefined || paisa === "") return 0
  const n = typeof paisa === "string" ? Number(paisa) : paisa
  if (!Number.isFinite(n)) return 0
  return n / 100
}

/** Format paisa for display as NPR currency. */
export function formatNpr(
  paisa: string | number | null | undefined,
  options?: { signed?: boolean; compact?: boolean },
): string {
  const npr = paisaToNpr(paisa)
  const abs = Math.abs(npr)
  const formatted = new Intl.NumberFormat("en-NP", {
    minimumFractionDigits: options?.compact ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(abs)

  const prefix = options?.signed && npr !== 0 ? (npr > 0 ? "+" : "−") : npr < 0 ? "−" : ""
  return `${prefix}NPR ${formatted}`
}

export function parseNprInput(value: string): number {
  const cleaned = value.replace(/,/g, "").trim()
  if (!cleaned) return 0
  const n = Number(cleaned)
  if (!Number.isFinite(n)) throw new Error("Invalid amount")
  return n
}
