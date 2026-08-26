import type { AmcRecord, AmcRenewalDecision, AmcType } from "@/lib/types"

export type AmcDisplayStatus =
  | "ongoing"
  | "upcoming"
  | "expiring"
  | "expired"
  | "awaiting-decision"

export type { AmcType, AmcRenewalDecision }

export const daysBetween = (a: Date, b: Date) =>
  Math.round((b.getTime() - a.getTime()) / 86_400_000)

function day(iso: string) {
  return new Date(`${String(iso).slice(0, 10)}T00:00:00`)
}

export function amcStart(amc: AmcRecord) {
  return String(amc.startDate ?? amc.setDate ?? "").slice(0, 10)
}

export function amcEnd(amc: AmcRecord) {
  return String(amc.endDate ?? amc.freeUntilDate ?? "").slice(0, 10)
}

export function amcDisplayStatus(
  amc: AmcRecord,
  today = new Date(),
  reminderLeadDays = 30,
): AmcDisplayStatus {
  if (amc.status === "cancelled" || amc.renewalDecision === "declined") {
    return "expired"
  }
  const start = day(amcStart(amc))
  const end = day(amcEnd(amc))
  const t = day(today.toISOString().slice(0, 10))
  if (t < start) return "upcoming"
  if (t > end) {
    return amc.renewalDecision === "renewed" ? "expired" : "awaiting-decision"
  }
  if (daysBetween(t, end) <= reminderLeadDays) return "expiring"
  return "ongoing"
}

export const AMC_STATUS_META: Record<
  AmcDisplayStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  ongoing: { label: "Ongoing", variant: "default" },
  expiring: { label: "Expiring soon", variant: "secondary" },
  upcoming: { label: "Upcoming", variant: "outline" },
  "awaiting-decision": { label: "Awaiting decision", variant: "destructive" },
  expired: { label: "Expired", variant: "outline" },
}

export function amcProgress(amc: AmcRecord, today = new Date()) {
  const start = day(amcStart(amc)).getTime()
  const end = day(amcEnd(amc)).getTime()
  const t = today.getTime()
  if (t <= start) return 0
  if (t >= end) return 100
  return Math.round(((t - start) / (end - start)) * 100)
}

export function fmtAmcDate(iso: string) {
  return day(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

export function addMonths(iso: string, months: number) {
  const d = day(iso)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}
