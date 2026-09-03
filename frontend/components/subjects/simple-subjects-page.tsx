"use client";

import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { ArrowUpDown, BookOpen, ChevronDown, ChevronUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useGetMySubjects } from "@/lib/api/browser/academics/academics";
import { getGetSubjectProgressQueryOptions } from "@/lib/api/browser/student-lessons/student-lessons";
import { PageContainer } from "@/components/page-container";
import type { SubjectOut } from "@/lib/api/browser/schoolAheadAPI.schemas";

// Shared by the header row and every body row so columns line up like a
// real table: icon / subject name (flexible) / progress bar / percent.
const ROW_GRID = "grid grid-cols-[1.5rem_minmax(0,1fr)_8rem_2.5rem] items-center gap-3";

type SortKey = "name" | "progress";
type SortDirection = "asc" | "desc";

// Tiny grey subject icon — the real uploaded icon when there is one,
// otherwise a generic monochrome book icon instead of SubjectCard's colored
// letter-square fallback (that fallback clashes with the Simple view's
// black/grey/white-only palette).
function SimpleSubjectIcon({ iconUrl }: { iconUrl?: string | null }) {
  if (iconUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={iconUrl} alt="" className="size-4 shrink-0 rounded object-cover" />
    );
  }
  return <BookOpen className="size-4 shrink-0 text-gray-400" aria-hidden="true" />;
}

function SortableHeader({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 text-left text-xs font-medium text-gray-500 hover:text-gray-700"
    >
      {label}
      {active ? (
        direction === "asc" ? (
          <ChevronUp className="size-3" />
        ) : (
          <ChevronDown className="size-3" />
        )
      ) : (
        <ArrowUpDown className="size-3 text-gray-300" />
      )}
    </button>
  );
}

function SimpleSubjectRow({ subject, percent }: { subject: SubjectOut; percent: number }) {
  return (
    <li>
      <Link href={`/subjects/${subject.id}`} className={`${ROW_GRID} px-2 py-2 hover:bg-gray-50`}>
        <SimpleSubjectIcon iconUrl={subject.icon} />
        <span className="min-w-0 truncate font-medium text-gray-900">{subject.name}</span>
        <span className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <span className="block h-full rounded-full bg-gray-900" style={{ width: `${percent}%` }} />
        </span>
        <span className="text-right text-xs text-gray-500">{percent}%</span>
      </Link>
    </li>
  );
}

// Notion-style, monochrome alternative to the Standard "Мої предмети" card
// grid — a dense, borderless, sortable list of subject rows instead of
// shadowed cards, matching the Simple dashboard/calendar's visual language.
// See the Settings page's "Вигляд" section
// (components/settings/view-settings.tsx).
export function SimpleSubjectsPage() {
  const t = useTranslations("MySubjects");
  const { data, isLoading, isError } = useGetMySubjects();
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: "name", direction: "asc" });

  const subjects = useMemo(() => data ?? [], [data]);

  // Progress is fetched once here (rather than per-row, like SubjectCard
  // does) so every subject's percent is available up front to sort by —
  // same useQueries + query-options pattern as CoursePlan's per-topic
  // progress.
  const progressQueries = useQueries({
    queries: subjects.map((subject) => getGetSubjectProgressQueryOptions(subject.id)),
  });
  const percentBySubjectId = useMemo(() => {
    const map = new Map<number, number>();
    subjects.forEach((subject, index) => {
      const percent = progressQueries[index]?.data?.completed_percent ?? 0;
      map.set(subject.id, Math.round(Math.min(100, Math.max(0, percent))));
    });
    return map;
  }, [subjects, progressQueries]);

  const sortedSubjects = useMemo(() => {
    const sign = sort.direction === "asc" ? 1 : -1;
    return [...subjects].sort((a, b) => {
      if (sort.key === "name") {
        return sign * a.name.localeCompare(b.name, "uk");
      }
      return sign * ((percentBySubjectId.get(a.id) ?? 0) - (percentBySubjectId.get(b.id) ?? 0));
    });
  }, [subjects, sort, percentBySubjectId]);

  const handleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key ? { key, direction: prev.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" },
    );
  };

  return (
    <PageContainer title={t("title")}>
      {isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
      {isError && <p className="text-sm text-red-600">{t("error")}</p>}

      {!isLoading && !isError && subjects.length === 0 && <p className="text-sm text-gray-500">{t("empty")}</p>}

      {subjects.length > 0 && (
        <div className="overflow-x-auto">
          <div className={`${ROW_GRID} min-w-[28rem] px-2 pb-2`}>
            <span aria-hidden="true" />
            <SortableHeader
              label={t("columnSubject")}
              active={sort.key === "name"}
              direction={sort.direction}
              onClick={() => handleSort("name")}
            />
            <SortableHeader
              label={t("progressLabel")}
              active={sort.key === "progress"}
              direction={sort.direction}
              onClick={() => handleSort("progress")}
            />
            <span aria-hidden="true" />
          </div>
          <ul className="min-w-[28rem] divide-y divide-gray-100">
            {sortedSubjects.map((subject) => (
              <SimpleSubjectRow key={subject.id} subject={subject} percent={percentBySubjectId.get(subject.id) ?? 0} />
            ))}
          </ul>
        </div>
      )}
    </PageContainer>
  );
}
