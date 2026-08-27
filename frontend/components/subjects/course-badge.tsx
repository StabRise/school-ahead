import type { ProgressBadgeOut } from "@/lib/api/browser/schoolAheadAPI.schemas";

// Gamified course-level badge (ProgressBadge, backend/achievements) shown
// top-right on the Subject detail page and on each card of the "Мої
// досягнення" overview — see SubjectProgressOut.badge /
// SubjectAchievementOut.badge, which already pick the badge matching the
// subject's completed_percent.
export function CourseBadge({ badge }: { badge: ProgressBadgeOut | null | undefined }) {
  if (!badge) return null;

  return (
    <span className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-amber-900">
      <span className="text-2xl leading-none" aria-hidden="true">
        {badge.icon}
      </span>
      <span className="text-sm font-semibold">{badge.name}</span>
    </span>
  );
}
