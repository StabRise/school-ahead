import type { SubjectAchievementOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { Card } from "@/components/card";
import { ProgressBar } from "@/components/progress-bar";
import { CourseBadge } from "@/components/subjects/course-badge";
import { SubjectIcon } from "@/components/subjects/subject-icon";

// One subject's card on "Мої досягнення" — overall completion across every
// lesson in the subject (SubjectAchievementOut, not just assigned ones) plus
// its per-semester breakdown, same data shape and rules as the Subject
// detail page's own progress section (see subject-detail-page.tsx): the
// block row only renders when the subject has more than one block.
export function AchievementCard({ achievement }: { achievement: SubjectAchievementOut }) {
  return (
    <Card
      href={`/subjects/${achievement.subject_id}`}
      className="flex h-full flex-col gap-3 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-2">
        <SubjectIcon id={achievement.subject_id} name={achievement.subject_name} iconUrl={achievement.subject_icon} />
        <CourseBadge badge={achievement.badge} />
      </div>

      <span className="font-medium text-gray-900">{achievement.subject_name}</span>

      <ProgressBar percent={achievement.completed_percent} />

      {achievement.blocks.length > 1 && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600">
          {achievement.blocks.map((block) => (
            <div key={block.id} className="flex items-center justify-between gap-2">
              <span>{block.label}</span>
              <span className="font-medium text-gray-900">{Math.round(block.completed_percent)}%</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
