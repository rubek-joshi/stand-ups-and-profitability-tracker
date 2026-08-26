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

/** Whether a project assignment covers a calendar date (inclusive). */
export function assignmentCoversDate(
  assignedAt: Date,
  unassignedAt: Date | null,
  onDate: Date,
): boolean {
  const day = toIsoDate(onDate);
  const assignedDay = toIsoDate(assignedAt);
  if (assignedDay > day) {
    return false;
  }
  if (!unassignedAt) {
    return true;
  }
  return toIsoDate(unassignedAt) >= day;
}

/** Inclusive calendar overlap. A null end is treated as still open. */
export function assignmentPeriodsOverlap(
  aAssignedAt: Date,
  aUnassignedAt: Date | null,
  bAssignedAt: Date,
  bUnassignedAt: Date | null,
): boolean {
  const a1 = toIsoDate(aAssignedAt);
  const a2 = aUnassignedAt ? toIsoDate(aUnassignedAt) : "9999-12-31";
  const b1 = toIsoDate(bAssignedAt);
  const b2 = bUnassignedAt ? toIsoDate(bUnassignedAt) : "9999-12-31";
  return a1 <= b2 && b1 <= a2;
}

/** Calendar day immediately before the given date (UTC). */
export function dayBefore(date: Date): Date {
  const day = parseIsoDate(toIsoDate(date));
  return new Date(day.getTime() - 86_400_000);
}

/** Number of calendar days in the month of the given date. */
export function daysInMonth(date: Date): number {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}
