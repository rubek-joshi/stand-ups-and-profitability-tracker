/** Parse an ISO date string (YYYY-MM-DD) as UTC midnight. */
export function parseIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Format a Date as YYYY-MM-DD. */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Calendar month key YYYY-MM for a date. */
export function toMonthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/** Number of calendar days in the month of the given date. */
export function daysInMonth(date: Date): number {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}
