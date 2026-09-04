"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { User } from "lucide-react";
import type { TutorStudentOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { Link } from "@/i18n/navigation";
import { SimpleEntityIcon } from "@/components/simple/entity-icon";

// Right-sidebar "Мої учні" list on the tutor dashboard — every student
// reachable by the tutor, grouped by class. Given a highlighted background
// so it reads as a distinct panel against the page's otherwise-white
// background. Each row shows the student's overall curriculum completion
// (TutorStudentOut.completed_percent, denormalized on StudentProfile — see
// backend lessons.services._update_completion_percent_cache) and links to
// that student's read-only calendar (see tutor-class-detail-page.tsx's
// StudentRow for the same destination).
export function MyStudentsSidebar({ students }: { students: TutorStudentOut[] }) {
  const t = useTranslations("TutorDashboard");

  const studentsByClass = useMemo(() => {
    const groups = new Map<number, { className: string; students: TutorStudentOut[] }>();
    for (const s of students) {
      const group = groups.get(s.class_id);
      if (group) {
        group.students.push(s);
      } else {
        groups.set(s.class_id, { className: s.class_name, students: [s] });
      }
    }
    return Array.from(groups, ([classId, group]) => ({ classId, ...group })).sort((a, b) =>
      a.className.localeCompare(b.className, undefined, { numeric: true }),
    );
  }, [students]);

  return (
    <aside className="flex w-full flex-col gap-4 border-t border-gray-100 pt-4 lg:w-64 lg:shrink-0 lg:border-t-0 lg:border-l lg:pl-4 lg:pt-0">
      <h3 className="text-sm font-semibold text-gray-900">{t("myStudentsTitle")}</h3>

      {studentsByClass.length === 0 && <p className="text-sm text-gray-500">{t("noStudents")}</p>}

      {studentsByClass.map((group) => (
        <div key={group.classId} className="flex flex-col gap-1">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t("classLabel", { name: group.className })}
          </h4>
          <ul className="flex flex-col divide-y divide-gray-50">
            {group.students.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/tutor/students/${s.id}/calendar`}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <SimpleEntityIcon fallback={User} />
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  <span className="shrink-0 text-xs font-medium text-gray-500">
                    {Math.round(s.completed_percent)}%
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </aside>
  );
}
