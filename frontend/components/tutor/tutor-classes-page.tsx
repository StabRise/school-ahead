"use client";

import { useTranslations } from "next-intl";
import type { TutorClassOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { useListTutorClasses } from "@/lib/api/browser/tutor/tutor";
import { Link } from "@/i18n/navigation";
import { SimplePageContainer } from "@/components/simple/page-container";

// Shared by every row so columns line up like a real table: class name
// (flexible) / teacher / student+subject counts.
const ROW_GRID = "grid grid-cols-[minmax(0,1fr)_10rem_10rem] items-center gap-3";

function ClassRow({ item }: { item: TutorClassOut }) {
  const t = useTranslations("TutorClasses");

  return (
    <li>
      <Link href={`/tutor/classes/${item.id}`} className={`${ROW_GRID} px-2 py-2 hover:bg-gray-50`}>
        <span className="min-w-0 truncate">
          <span className="font-medium text-gray-900">{item.name}</span>
          <span className="text-gray-400"> · </span>
          <span className="text-xs text-gray-500">{item.academic_year}</span>
          {item.is_class_teacher && <span className="ml-2 text-xs text-gray-400">{t("youAreClassTeacher")}</span>}
        </span>
        <span className="truncate text-xs text-gray-500">
          {t("classTeacherLabel")}: {item.class_teacher_name ?? t("classTeacherUnset")}
        </span>
        <span className="truncate text-xs text-gray-500">
          {t("studentsCount", { count: item.student_count })} ·{" "}
          {t("subjectsCount", { count: item.subject_count })}
        </span>
      </Link>
    </li>
  );
}

export function TutorClassesPage() {
  const t = useTranslations("TutorClasses");
  const { data, isLoading, isError } = useListTutorClasses();

  const classes = data ?? [];

  return (
    <SimplePageContainer title={t("title")}>
      {isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
      {isError && <p className="text-sm text-red-600">{t("error")}</p>}

      {!isLoading && !isError && classes.length === 0 && (
        <p className="text-sm text-gray-500">{t("empty")}</p>
      )}

      {classes.length > 0 && (
        <div className="overflow-x-auto">
          <ul className="min-w-[36rem] divide-y divide-gray-100">
            {classes.map((item) => (
              <ClassRow key={item.id} item={item} />
            ))}
          </ul>
        </div>
      )}
    </SimplePageContainer>
  );
}
