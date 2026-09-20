"use client";

import { useTranslations } from "next-intl";
import { useGetToday } from "@school-ahead/api-client/browser/schedule/schedule";
import { PreschoolDashboard } from "@/components/preschool/dashboard";
import { SimpleDashboard } from "@/components/simple-dashboard";
import { SimplePageContainer } from "@/components/simple/page-container";
import { useAuthStore } from "@school-ahead/api-client";

// Local (not UTC) YYYY-MM-DD — avoids toISOString() shifting the date near
// midnight in timezones behind UTC.
function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Default and Simple are now the same dashboard (SimpleDashboard's dense
// table + collapsible stats section) — Default just turns `colorful` on to
// get back its colored status badges, dark-red overdue dates, blue
// histogram, and gradient progress bars. Preschool is its own thing: a hub of
// big cards (PreschoolDashboard), whose "My lessons" card opens the road that
// used to be this page — see components/preschool/lessons-road.tsx.
export function StudentDashboard() {
  const isPreschool = useAuthStore((state) => state.user?.interfaceMode === "preschool");
  return isPreschool ? <PreschoolDashboard /> : <ClassicStudentDashboard />;
}

function ClassicStudentDashboard() {
  const t = useTranslations("StudentDashboard");
  const isSimple = useAuthStore((state) => state.user?.interfaceMode === "simple");
  const { data, isLoading, isError } = useGetToday({ date: toLocalIsoDate(new Date()) });

  return (
    <SimplePageContainer title={t("title")}>
      {isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
      {isError && <p className="text-sm text-red-600">{t("error")}</p>}
      {!isLoading && !isError && (
        <SimpleDashboard lessons={data?.today ?? []} backlog={data?.backlog ?? []} colorful={!isSimple} />
      )}
    </SimplePageContainer>
  );
}
