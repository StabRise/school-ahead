"use client";

import { useMemo, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useGetMySubjects, useListSubjectGroups } from "@school-ahead/api-client/browser/academics/academics";
import { useGetSubjectProgress } from "@school-ahead/api-client/browser/student-lessons/student-lessons";
import type { SubjectOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { Cloud, Sun, DefaultStepIcon } from "./decorations";

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

// A book with its subject icon, name and a progress bar on the cover — a
// bookshelf take on the default view's subject grid, restyled for a
// 6-year-old. See docs/views/preschool/README.md.
//
// Hovering a book blows it up to 2x (raised above its neighbours with z-20)
// so a child can see it properly. Tailwind gates `group-hover:` behind
// `@media (hover: hover)`, so touch screens (iPad) skip the enlargement and
// just get the press-down feedback. The combined hover+press rule keeps the
// enlarged book from snapping back to normal size mid-click, which the plain
// press rule would otherwise do (it's emitted after the hover one).
function Book({ subject }: { subject: SubjectOut }) {
  const progressQuery = useGetSubjectProgress(subject.id);
  const percent = Math.round(Math.min(100, Math.max(0, progressQuery.data?.completed_percent ?? 0)));
  const color = BOOK_COLORS[subject.id % BOOK_COLORS.length];

  return (
    <Link
      href={`/subjects/${subject.id}`}
      aria-label={subject.name}
      className="group flex w-32 shrink-0 flex-col sm:w-36"
    >
      <div
        className={`relative flex h-44 flex-col items-center gap-1 rounded-t-xl rounded-b-md bg-gradient-to-b pb-2 pl-5 pr-1.5 pt-1.5 shadow-lg transition-transform duration-200 group-hover:z-20 group-hover:scale-200 group-active:scale-95 group-hover:group-active:scale-[1.9] sm:h-48 ${color}`}
      >
        <span className="absolute bottom-2 left-2 top-2 w-[3px] rounded bg-white/30" aria-hidden="true" />
        <span className="absolute bottom-2 left-4 top-2 w-[2px] rounded bg-white/20" aria-hidden="true" />

        {/* Takes all the height the name and progress row leave over, out to the right edge.
            The image is absolutely positioned rather than `h-full`: a percentage height
            inside a flex item isn't reliably resolved by Safari, which would show the
            image at its natural size, cropped, instead of scaled to cover. */}
        <span className="relative min-h-0 w-full flex-1 overflow-hidden rounded-xl border-2 border-white/80 bg-white shadow">
          {subject.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={subject.icon} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center">
              <DefaultStepIcon />
            </span>
          )}
        </span>

        {/* line-clamp needs `display: -webkit-box`, which `flex` on the same
            element overrides (it's emitted later) and silently disables the
            clamp — so the flex centering lives on a wrapper instead. */}
        <span className="flex h-8 w-full items-center justify-center">
          <span className="line-clamp-2 text-center text-xs font-extrabold leading-tight text-white drop-shadow">
            {subject.name}
          </span>
        </span>

        <div className="flex w-full items-center gap-1.5 px-1">
          <div
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-3 flex-1 overflow-hidden rounded-full bg-black/25"
          >
            <div className="h-full rounded-full bg-amber-300 transition-[width]" style={{ width: `${percent}%` }} />
          </div>
          <span className="w-8 text-right text-[11px] font-extrabold text-white drop-shadow">{percent}%</span>
        </div>
      </div>
    </Link>
  );
}

// A filter pill is a real link (`?group=<id>`, none for "all") rather than
// local state, so a reload or shared URL lands on the same category — the
// preschool counterpart of the `?tab=` convention (use-tab-query-param.ts).
function FilterPill({
  href,
  active,
  icon,
  title,
  children,
}: {
  href: string;
  active: boolean;
  icon?: ReactNode;
  // Tooltip + accessible name — for a pill that shows only an image.
  title?: string;
  children?: ReactNode;
}) {
  const iconOnly = children === undefined;
  return (
    <Link
      href={href}
      replace
      scroll={false}
      title={title}
      aria-label={title}
      aria-current={active ? "true" : undefined}
      className={`flex items-center gap-2 text-base font-extrabold transition-colors ${
        iconOnly ? "rounded-2xl p-1.5" : "rounded-full py-1.5 pl-2 pr-4"
      } ${active ? "bg-indigo-600 text-white shadow-lg" : "bg-slate-100 text-slate-800 hover:bg-slate-200"}`}
    >
      {icon}
      {children}
    </Link>
  );
}

export function PreschoolSubjectsShelf() {
  const t = useTranslations("PreschoolSubjects");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data, isLoading, isError } = useGetMySubjects({ has_lessons: true });
  const { data: subjectGroups } = useListSubjectGroups();
  const allSubjects = useMemo(() => data ?? [], [data]);

  // Groups are global (not per class), so only offer the ones this
  // student's class actually has a subject in — an empty category would
  // just be a dead-end tab. Subjects without a group appear under "all
  // books" only.
  const groups = useMemo(() => {
    const usedGroupIds = new Set(allSubjects.map((subject) => subject.group_id));
    return (subjectGroups ?? []).filter((group) => usedGroupIds.has(group.id));
  }, [allSubjects, subjectGroups]);

  const groupParam = searchParams.get("group");
  const activeGroup = groups.find((group) => String(group.id) === groupParam) ?? null;
  const subjects = activeGroup ? allSubjects.filter((subject) => subject.group_id === activeGroup.id) : allSubjects;

  return (
    <div className="relative flex flex-1 flex-col overflow-x-clip bg-gradient-to-b from-sky-200 via-emerald-100 to-lime-200">
      <div className="pointer-events-none absolute inset-0">
        <Cloud className="left-6 top-4 h-8 w-14 opacity-90" />
        <Cloud className="right-8 top-8 h-6 w-12 opacity-70" />
        <Sun className="right-12 top-4 h-10 w-10" />
      </div>

      <div className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 p-4 sm:p-6">
        <h1 className="text-center text-2xl font-extrabold text-emerald-900">{t("title")}</h1>

        {isLoading && <p className="text-center text-sm font-medium text-emerald-800">{t("loading")}</p>}
        {isError && <p className="text-center text-sm font-medium text-red-700">{t("error")}</p>}

        {groups.length > 0 && (
          <nav
            aria-label={t("filterLabel")}
            className="flex flex-wrap items-center justify-start gap-3 rounded-[2rem] border-4 border-yellow-200 bg-white/90 px-6 py-4 shadow-xl"
          >
            <FilterPill
              href={pathname}
              active={activeGroup === null}
              title={t("allBooks")}
              icon={
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/images/all-books.jpg" alt="" className="h-12 w-12 rounded-xl object-cover" />
              }
            />
            <span className="h-10 w-0.5 rounded-full bg-slate-300" aria-hidden="true" />
            {groups.map((group) => (
              <FilterPill
                key={group.id}
                href={`${pathname}?group=${group.id}`}
                active={activeGroup?.id === group.id}
                title={group.name}
                icon={
                  group.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={group.icon} alt="" className="h-12 w-12 rounded-xl object-cover" />
                  ) : undefined
                }
              >
                {/* No image uploaded yet — fall back to the name so the pill isn't blank. */}
                {group.icon ? undefined : group.name}
              </FilterPill>
            ))}
          </nav>
        )}

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
