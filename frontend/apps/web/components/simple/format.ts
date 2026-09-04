import { STATUS_LABEL_KEY } from "@/components/status-badge";

const SHORT_DATE_FORMAT = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short" });

// Plain functions (not hooks) — every call site already owns its own
// useTranslations instance and passes `t` in, so these stay reusable across
// Simple-view files without each one importing next-intl separately here.

// `bare` picks between the calendar-chip convention (just the number) and
// the header/table convention (t("scoreValue") -> "X/12") — this exact
// distinction was a deliberate, per-screen decision made across this
// session's Simple views, not an oversight, so it's a parameter rather than
// a single hardcoded format.
export function formatGradeLabel({
  gradePoints,
  gradeResult,
  t,
  bare,
}: {
  gradePoints: number | null;
  gradeResult: string | null;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  bare: boolean;
}): string | null {
  if (gradeResult === "pass") return t("scorePass");
  if (gradeResult === "fail") return t("scoreFail");
  if (gradePoints !== null) return bare ? String(gradePoints) : t("scoreValue", { points: gradePoints });
  return null;
}

export function resolveStatusLabel(status: string, t: (key: string) => string): string {
  return t(STATUS_LABEL_KEY[status] ?? STATUS_LABEL_KEY.assigned);
}

export function formatShortDate(dateStr: string): string {
  return SHORT_DATE_FORMAT.format(new Date(`${dateStr}T00:00:00`));
}
