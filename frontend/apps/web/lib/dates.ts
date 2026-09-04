// Local (not UTC) YYYY-MM-DD, matching <input type="date"> — toISOString()
// would shift the date near midnight in timezones behind UTC.
export function isoOf(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayIso(): string {
  return isoOf(new Date());
}

export function addDaysIso(base: string, days: number): string {
  const date = new Date(`${base}T00:00:00`);
  date.setDate(date.getDate() + days);
  return isoOf(date);
}
