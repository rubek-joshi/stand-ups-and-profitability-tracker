import { parseIsoDate, toIsoDate } from "./date.util";

/** Hard-coded stand-up edit/delete windows (calendar days from stand-up date). */
export const STANDUP_EDITABLE_DAYS = 7;
export const STANDUP_DELETABLE_DAYS = 30;

const NPT_TIME_ZONE = "Asia/Kathmandu";

/** Today's calendar date in Asia/Kathmandu as YYYY-MM-DD. */
export function nptTodayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: NPT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Yesterday's calendar date in Asia/Kathmandu as a UTC midnight Date. */
export function nptYesterdayDate(): Date {
  const today = parseIsoDate(nptTodayIso());
  return new Date(today.getTime() - 86_400_000);
}

/** Whole calendar days between stand-up date and NPT today (0 = today). */
export function standupAgeDays(standupDate: Date, todayIso = nptTodayIso()): number {
  const standIso = toIsoDate(standupDate);
  const stand = parseIsoDate(standIso).getTime();
  const today = parseIsoDate(todayIso).getTime();
  return Math.floor((today - stand) / 86_400_000);
}

export function isStandupEditable(standupDate: Date): boolean {
  return standupAgeDays(standupDate) <= STANDUP_EDITABLE_DAYS;
}

export function isStandupDeletable(standupDate: Date): boolean {
  return standupAgeDays(standupDate) <= STANDUP_DELETABLE_DAYS;
}
