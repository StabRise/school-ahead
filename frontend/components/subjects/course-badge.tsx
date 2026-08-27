import type { ProgressBadgeOut } from "@/lib/api/browser/schoolAheadAPI.schemas";

// Gamified course-level badge (ProgressBadge, backend/achievements) shown
// top-right on the Subject detail page and on each card of the "Мої
// досягнення" overview — see SubjectProgressOut.badge /
// SubjectAchievementOut.badge, which already pick the badge matching the
// subject's completed_percent.
export function CourseBadge({ badge }: { badge: ProgressBadgeOut | null | undefined }) {
  if (!badge) return null;

  return (
    <span className="inline-flex w-fit shrink-0 items-center gap-1 rounded-full bg-gray-900 px-3 py-1 text-xs font-medium text-white">
      {badge.icon} {badge.name}
    </span>
  );
}
