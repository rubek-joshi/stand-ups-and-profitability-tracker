/** Hard-coded stand-up edit/delete windows (calendar days from stand-up date). */
export const STANDUP_EDITABLE_DAYS = 7
export const STANDUP_DELETABLE_DAYS = 30

const NPT_TIME_ZONE = "Asia/Kathmandu"

/** Today's calendar date in Asia/Kathmandu as YYYY-MM-DD. */
export function nptTodayIso(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: NPT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)
}

/** Whole calendar days between stand-up date (YYYY-MM-DD) and NPT today. */
export function standupAgeDays(standupDate: string, todayIso = nptTodayIso()): number {
  const stand = Date.parse(`${String(standupDate).slice(0, 10)}T00:00:00.000Z`)
  const today = Date.parse(`${todayIso}T00:00:00.000Z`)
  return Math.floor((today - stand) / 86_400_000)
}

export function isStandupEditable(standupDate: string): boolean {
  return standupAgeDays(standupDate) <= STANDUP_EDITABLE_DAYS
}

export function isStandupDeletable(standupDate: string): boolean {
  return standupAgeDays(standupDate) <= STANDUP_DELETABLE_DAYS
}
