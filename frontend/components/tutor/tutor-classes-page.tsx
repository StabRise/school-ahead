"use client";

import { useTranslations } from "next-intl";
import type { TutorClassOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { useListTutorClasses } from "@/lib/api/browser/tutor/tutor";
import { Card } from "@/components/card";
import { PageContainer } from "@/components/page-container";

function ClassCard({ item }: { item: TutorClassOut }) {
  const t = useTranslations("TutorClasses");

  return (
    <Card
      href={`/tutor/classes/${item.id}`}
      className="flex h-full flex-col gap-3 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-gray-900">{item.name}</span>
        {item.is_class_teacher && (
          <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
            {t("youAreClassTeacher")}
          </span>
        )}
      </div>

      <span className="text-xs text-gray-500">{item.academic_year}</span>

      <span className="text-sm text-gray-700">
        {t("classTeacherLabel")}:{" "}
        <span className="font-medium">{item.class_teacher_name ?? t("classTeacherUnset")}</span>
      </span>

      <span className="text-xs text-gray-500">
        {t("studentsCount", { count: item.student_count })} ·{" "}
        {t("subjectsCount", { count: item.subject_count })}
      </span>
    </Card>
  );
}

export function TutorClassesPage() {
  const t = useTranslations("TutorClasses");
  const { data, isLoading, isError } = useListTutorClasses();

  const classes = data ?? [];

  return (
    <PageContainer title={t("title")} maxWidthClassName="xl:max-w-6xl">
      {isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
      {isError && <p className="text-sm text-red-600">{t("error")}</p>}

      {!isLoading && !isError && classes.length === 0 && (
        <p className="text-sm text-gray-500">{t("empty")}</p>
      )}

      {classes.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {classes.map((item) => (
            <li key={item.id}>
              <ClassCard item={item} />
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
