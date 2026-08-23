"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useGetMySubjects } from "@/lib/api/browser/academics/academics";
import { useGetSubjectProgress } from "@/lib/api/browser/student-lessons/student-lessons";
import type { SubjectOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { Cloud, Sun, DefaultStepIcon } from "@/components/preschool/decorations";

// One steady color per book — deterministic on subject id, same trick as
// the default view's SubjectCard (frontend/components/subjects/subject-card.tsx),
// SubjectOut still has no color field from the backend.
const BOOK_COLORS = [
  "from-rose-400 to-rose-600",
  "from-sky-400 to-sky-600",
  "from-emerald-400 to-emerald-600",
  "from-amber-400 to-amber-600",
  "from-violet-400 to-violet-600",
  "from-cyan-400 to-cyan-600",
];

// A book with its subject icon on the cover and a bookmark ribbon whose
// length grows with lesson progress — a bookshelf take on the default
// view's subject grid, restyled for a 6-year-old. See
// docs/views/preschool/README.md.
function Book({ subject }: { subject: SubjectOut }) {
  const progressQuery = useGetSubjectProgress(subject.id);
  const percent = Math.min(100, Math.max(0, progressQuery.data?.completed_percent ?? 0));
  const color = BOOK_COLORS[subject.id % BOOK_COLORS.length];
  const ribbonHeight = 10 + percent * 0.28;

  return (
    <Link
      href={`/subjects/${subject.id}`}
      aria-label={subject.name}
      className="group flex w-24 shrink-0 flex-col items-center gap-2 sm:w-28"
    >
      <div className="relative">
        <span
          className="absolute right-4 top-0 z-0 w-3 rounded-b-sm bg-rose-500 shadow-sm transition-[height]"
          style={{ height: `${ribbonHeight}px` }}
          aria-hidden="true"
        />
        <div
          className={`relative z-10 flex h-40 w-24 flex-col items-center rounded-t-xl rounded-b-md bg-gradient-to-b pt-3 shadow-lg transition-transform group-hover:-translate-y-1 group-active:scale-95 sm:w-28 ${color}`}
        >
          <span className="absolute bottom-2 left-2 top-2 w-[3px] rounded bg-white/30" aria-hidden="true" />
          <span className="absolute bottom-2 left-4 top-2 w-[2px] rounded bg-white/20" aria-hidden="true" />

          <span className="mr-2 flex h-20 w-20 shrink-0 items-center justify-center self-end overflow-hidden rounded-xl border-2 border-white/80 bg-white shadow">
            {subject.icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={subject.icon} alt="" className="h-full w-full object-cover" />
            ) : (
              <DefaultStepIcon />
            )}
          </span>

          <span className="mt-2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-extrabold text-amber-800 shadow-sm">
            {Math.round(percent)}%
          </span>
        </div>
      </div>

      <span className="line-clamp-2 text-center text-xs font-bold leading-tight text-emerald-900">
        {subject.name}
      </span>
    </Link>
  );
}

export function PreschoolSubjectsShelf() {
  const t = useTranslations("PreschoolSubjects");
  const { data, isLoading, isError } = useGetMySubjects();
  const subjects = data ?? [];

  return (
    <div className="relative flex flex-1 flex-col bg-gradient-to-b from-sky-200 via-emerald-100 to-lime-200">
      <div className="pointer-events-none absolute inset-0">
        <Cloud className="left-6 top-4 h-8 w-14 opacity-90" />
        <Cloud className="right-8 top-8 h-6 w-12 opacity-70" />
        <Sun className="right-12 top-4 h-10 w-10" />
      </div>

      <div className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 p-4 sm:p-6">
        <h1 className="text-center text-2xl font-extrabold text-emerald-900">{t("title")}</h1>

        {isLoading && <p className="text-center text-sm font-medium text-emerald-800">{t("loading")}</p>}
        {isError && <p className="text-center text-sm font-medium text-red-700">{t("error")}</p>}

        {!isLoading && !isError && subjects.length === 0 && (
          <p className="text-center text-sm font-medium text-emerald-800">{t("empty")}</p>
        )}

        {subjects.length > 0 && (
          <div className="rounded-3xl border-8 border-amber-900/80 bg-amber-100/60 p-4 shadow-xl sm:p-6">
            <ul className="flex flex-wrap justify-center gap-x-4 gap-y-6">
              {subjects.map((subject) => (
                <li key={subject.id}>
                  <Book subject={subject} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
