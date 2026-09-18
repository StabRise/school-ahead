"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Crown } from "lucide-react";
import type { TutorClassOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { useListTutorClasses } from "@school-ahead/api-client/browser/tutor/tutor";
import { Link } from "@/i18n/navigation";
import { SimplePageContainer } from "@/components/simple/page-container";
import { SortableHeader, useSortState } from "@/components/simple/sortable-header";

// Shared by the header row and every body row so columns line up like a
// real table: class name (flexible) / year / teacher / student count /
// subject count.
const ROW_GRID = "grid grid-cols-[minmax(0,1fr)_8rem_10rem_5rem_6rem] items-center gap-3";

type SortKey = "name" | "year" | "teacher" | "students" | "subjects";

function ClassRow({ item }: { item: TutorClassOut }) {
  const t = useTranslations("TutorClasses");

  return (
    <li>
      <Link href={`/tutor/classes/${item.id}`} className={`${ROW_GRID} px-2 py-2 hover:bg-gray-50`}>
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium text-gray-900">{t("classTitle", { name: item.name })}</span>
          {item.is_class_teacher && (
            <span
              title={t("youAreClassTeacher")}
              aria-label={t("youAreClassTeacher")}
              className="inline-flex shrink-0 items-center rounded-full bg-blue-100 p-1 text-blue-700"
            >
              <Crown className="size-3" aria-hidden="true" />
            </span>
          )}
        </span>
        <span className="truncate text-xs text-gray-500">{item.academic_year}</span>
        <span className="truncate text-xs text-gray-500">{item.class_teacher_name ?? t("classTeacherUnset")}</span>
        <span className="truncate text-xs text-gray-500">{t("studentsCount", { count: item.student_count })}</span>
        <span className="truncate text-xs text-gray-500">{t("subjectsCount", { count: item.subject_count })}</span>
      </Link>
    </li>
  );
}

export function TutorClassesPage() {
  const t = useTranslations("TutorClasses");
  const { data, isLoading, isError } = useListTutorClasses();
  const { sort, toggleSort } = useSortState<SortKey>("name");

  const classes = useMemo(() => data ?? [], [data]);

  const sortedClasses = useMemo(() => {
    const sign = sort.direction === "asc" ? 1 : -1;
    return [...classes].sort((a, b) => {
      switch (sort.key) {
        case "year":
          return sign * a.academic_year.localeCompare(b.academic_year, "uk");
        case "teacher":
          return sign * (a.class_teacher_name ?? "").localeCompare(b.class_teacher_name ?? "", "uk");
        case "students":
          return sign * (a.student_count - b.student_count);
        case "subjects":
          return sign * (a.subject_count - b.subject_count);
        default:
          return sign * a.name.localeCompare(b.name, "uk");
      }
    });
  }, [classes, sort]);

  return (
    <SimplePageContainer title={t("title")}>
      {isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
      {isError && <p className="text-sm text-red-600">{t("error")}</p>}

      {!isLoading && !isError && classes.length === 0 && (
        <p className="text-sm text-gray-500">{t("empty")}</p>
      )}

      {classes.length > 0 && (
        <div className="overflow-x-auto">
          <div className={`${ROW_GRID} min-w-[40rem] px-2 pb-2`}>
            <SortableHeader
              label={t("columnClass")}
              active={sort.key === "name"}
              direction={sort.direction}
              onClick={() => toggleSort("name")}
            />
            <SortableHeader
              label={t("columnYear")}
              active={sort.key === "year"}
              direction={sort.direction}
              onClick={() => toggleSort("year")}
            />
            <SortableHeader
              label={t("columnTeacher")}
              active={sort.key === "teacher"}
              direction={sort.direction}
              onClick={() => toggleSort("teacher")}
            />
            <SortableHeader
              label={t("columnStudents")}
              active={sort.key === "students"}
              direction={sort.direction}
              onClick={() => toggleSort("students")}
            />
            <SortableHeader
              label={t("columnSubjects")}
              active={sort.key === "subjects"}
              direction={sort.direction}
              onClick={() => toggleSort("subjects")}
            />
          </div>
          <ul className="min-w-[40rem] divide-y divide-gray-100">
            {sortedClasses.map((item) => (
              <ClassRow key={item.id} item={item} />
            ))}
          </ul>
        </div>
      )}
    </SimplePageContainer>
  );
}
