"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { User } from "lucide-react";
import type { TutorStudentOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { Link } from "@/i18n/navigation";

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
    <aside className="flex w-full flex-col gap-4 rounded-lg border border-blue-100 bg-blue-50 p-4 lg:w-64 lg:shrink-0">
      <h3 className="text-lg font-semibold text-gray-900">{t("myStudentsTitle")}</h3>

      {studentsByClass.length === 0 && <p className="text-sm text-gray-500">{t("noStudents")}</p>}

      {studentsByClass.map((group) => (
        <div key={group.classId} className="flex flex-col gap-1">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t("classLabel", { name: group.className })}
          </h4>
          <ul className="flex flex-col gap-0.5">
            {group.students.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/tutor/students/${s.id}/calendar`}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-white hover:text-blue-700"
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                    <User className="size-3.5" />
                  </span>
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
