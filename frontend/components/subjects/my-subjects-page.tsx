"use client";

import { useTranslations } from "next-intl";
import { useGetMySubjects } from "@/lib/api/browser/academics/academics";
import { PageContainer } from "@/components/page-container";
import { SubjectCard } from "./subject-card";

export function MySubjectsPage() {
  const t = useTranslations("MySubjects");
  const { data, isLoading, isError } = useGetMySubjects();

  const subjects = data ?? [];

  return (
    <PageContainer title={t("title")} maxWidthClassName="max-w-6xl">
      {isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
      {isError && <p className="text-sm text-red-600">{t("error")}</p>}

      {!isLoading && !isError && subjects.length === 0 && (
        <p className="text-sm text-gray-500">{t("empty")}</p>
      )}

      {subjects.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {subjects.map((subject) => (
            <li key={subject.id}>
              <SubjectCard subject={subject} />
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
