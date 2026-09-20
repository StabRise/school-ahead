"use client";

import { useMemo, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useGetMySubjects, useListSubjectGroups } from "@school-ahead/api-client/browser/academics/academics";
import { useListPublicSubjects } from "@school-ahead/api-client/browser/public/public";
import {
  useGetSubjectProgress,
  useListFavoriteSubjectIds,
} from "@school-ahead/api-client/browser/student-lessons/student-lessons";
import type { SubjectOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { Cloud, Sun, DefaultStepIcon } from "./decorations";
import { PreschoolOptionsGear } from "./options-gear";
import {
  groupsForDisplay,
  subjectsForDisplay,
  unmarkedGroupIdsOf,
  DEFAULT_SUBJECTS_DISPLAY_MODE,
  SUBJECTS_DISPLAY_MODES,
  type SubjectsDisplayMode,
} from "./subjects-display";
import { useSubjectsDisplayStore } from "./subjects-display-store";

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

// What a book needs from a subject — both SubjectOut (a student's own class)
// and PublicSubjectOut (a visitor who isn't signed in, which has no tutor mark)
// fit.
type ShelfSubject = Pick<SubjectOut, "id" | "name" | "icon" | "group_id"> & { is_marked?: boolean };

const DISPLAY_MODE_EMOJI: Record<SubjectsDisplayMode, string> = {
  marked: "⭐",
  all: "📚",
  favorites: "❤️",
};

// A book with its subject icon, name and (for a signed-in student) a progress
// bar on the cover — a bookshelf take on the default view's subject grid,
// restyled for a 6-year-old. See docs/views/preschool/README.md.
//
// `percent` is null when there is no progress to show (a visitor who isn't
// signed in has none), which leaves the bar off the cover.
//
// Hovering a book blows it up to 2x (raised above its neighbours with z-20)
// so a child can see it properly. Tailwind gates `group-hover:` behind
// `@media (hover: hover)`, so touch screens (iPad) skip the enlargement and
// just get the press-down feedback. The combined hover+press rule keeps the
// enlarged book from snapping back to normal size mid-click, which the plain
// press rule would otherwise do (it's emitted after the hover one).
function BookCover({ subject, percent }: { subject: ShelfSubject; percent: number | null }) {
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

        {percent !== null && (
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
        )}
      </div>
    </Link>
  );
}

// The student's own book: the cover plus how far through the subject they are.
function StudentBook({ subject }: { subject: ShelfSubject }) {
  const progressQuery = useGetSubjectProgress(subject.id);
  const percent = Math.round(Math.min(100, Math.max(0, progressQuery.data?.completed_percent ?? 0)));
  return <BookCover subject={subject} percent={percent} />;
}

// The picture in an icon-only filter pill. Big, with next to no pill around it —
// and the pill and the frame around the row share its `rounded-xl` corners
// — the backend's thumbnail for a group's icon (SUBJECT_GROUP_ICON_SIDE in
// backend/common/images.py) is twice this, for retina screens.
const FILTER_ICON_CLASS = "h-22 w-22 rounded-xl object-cover";

// A filter pill is a real link (`?group=<id>`, none when no group is chosen)
// rather than local state, so a reload or shared URL lands on the same
// category — the preschool counterpart of the `?tab=` convention
// (use-tab-query-param.ts). A pill is a toggle: the chosen one links back to
// the bare page.
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
        iconOnly ? "rounded-xl p-0" : "rounded-full py-1.5 pl-2 pr-4"
      } ${active ? "bg-indigo-600 text-white shadow-lg ring-2 ring-indigo-600" : "bg-slate-100 text-slate-800 hover:bg-slate-200"}`}
    >
      {icon}
      {children}
    </Link>
  );
}

const NO_FAVORITES: ReadonlySet<number> = new Set();
const PUBLIC_DISPLAY_MODES: SubjectsDisplayMode[] = ["marked", "all"];

// The shelf itself — the category filter and the books — for whichever
// subjects it is handed. The two exports below only differ in where those come
// from, whether a book shows progress, and which views the ⚙️ offers (`modes`:
// a visitor who isn't signed in has no favourites, so no such view).
function SubjectsShelf({
  subjects: fetchedSubjects,
  favoriteIds,
  isLoading: subjectsLoading,
  isError,
  isStudent,
  modes,
}: {
  subjects: ShelfSubject[];
  favoriteIds: ReadonlySet<number>;
  isLoading: boolean;
  isError: boolean;
  isStudent: boolean;
  modes: SubjectsDisplayMode[];
}) {
  const t = useTranslations("PreschoolSubjects");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: subjectGroups, isLoading: groupsLoading } = useListSubjectGroups();
  // The "marked" view needs to know which categories are unmarked (their subjects
  // are hidden), so nothing is drawn until they have arrived — otherwise those
  // subjects would show for a moment and then disappear.
  const isLoading = subjectsLoading || groupsLoading;
  const chosenMode = useSubjectsDisplayStore((state) => state.mode);
  const setMode = useSubjectsDisplayStore((state) => state.setMode);
  // The choice is remembered on the device, so it can be a view this shelf
  // doesn't offer — "favourites", chosen while signed in, then a visitor on the
  // same device — in which case the default one shows.
  const mode: SubjectsDisplayMode = modes.includes(chosenMode) ? chosenMode : DEFAULT_SUBJECTS_DISPLAY_MODE;

  // What the ⚙️ chose (see subjects-display.ts), then — of what is left — the
  // categories worth offering: an empty one would just be a dead end. Groups
  // are global (not per class). Subjects without a group show only while no
  // group is chosen.
  const unmarkedGroupIds = useMemo(() => unmarkedGroupIdsOf(subjectGroups ?? []), [subjectGroups]);
  const allSubjects = useMemo(
    () => (isLoading ? [] : subjectsForDisplay(mode, fetchedSubjects, { favoriteIds, unmarkedGroupIds })),
    [isLoading, mode, fetchedSubjects, favoriteIds, unmarkedGroupIds],
  );
  const groups = useMemo(
    () => groupsForDisplay(mode, subjectGroups ?? [], allSubjects),
    [mode, subjectGroups, allSubjects],
  );

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

      {/* The ⚙️ is pinned to the screen's top-right corner, like the minigames'
          (out of the layout), so the column below clears it: on screens too
          narrow to leave room beside the column it starts lower. */}
      <div className="absolute right-3 top-3 z-20">
        <PreschoolOptionsGear
          value={mode}
          options={modes.map((option) => ({
            value: option,
            emoji: DISPLAY_MODE_EMOJI[option],
            label: t(`display.${option}`),
          }))}
          onChange={setMode}
          buttonLabel={t("settingsButton")}
          title={t("displayTitle")}
        />
      </div>

      <div
        className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 p-4 pt-14 sm:p-6 sm:pt-14 xl:pt-6"
      >
        {/* No visible heading, but the page keeps its <h1> for screen readers. */}
        <h1 className="sr-only">{t("title")}</h1>

        {isLoading && <p className="text-center text-sm font-medium text-emerald-800">{t("loading")}</p>}
        {isError && <p className="text-center text-sm font-medium text-red-700">{t("error")}</p>}

        {groups.length > 0 && (
          <nav
            aria-label={t("filterLabel")}
            className="flex flex-wrap items-center justify-center gap-0.5 rounded-xl border-4 border-yellow-200 bg-white/90 px-1.5 py-1 shadow-xl"
          >
            {groups.map((group) => (
              <FilterPill
                key={group.id}
                // The active group's pill links back to the bare page, so tapping
                // it again clears the filter and every book shows.
                href={activeGroup?.id === group.id ? pathname : `${pathname}?group=${group.id}`}
                active={activeGroup?.id === group.id}
                title={group.name}
                icon={
                  group.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={group.icon} alt="" className={FILTER_ICON_CLASS} />
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
          <p className="text-center text-sm font-medium text-emerald-800">
            {mode === "favorites" ? t("emptyFavorites") : t("empty")}
          </p>
        )}

        {subjects.length > 0 && (
          <div className="rounded-3xl border-8 border-amber-900/80 bg-amber-100/60 p-4 shadow-xl sm:p-6">
            <ul className="flex flex-wrap justify-center gap-x-4 gap-y-6">
              {subjects.map((subject) => (
                <li key={subject.id}>
                  {isStudent ? <StudentBook subject={subject} /> : <BookCover subject={subject} percent={null} />}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// The signed-in student's own class — see StudentSubjectsView.
export function PreschoolSubjectsShelf() {
  const { data, isLoading, isError } = useGetMySubjects({ has_lessons: true });
  const favorites = useListFavoriteSubjectIds();
  const subjects = useMemo(() => data ?? [], [data]);
  const favoriteIds = useMemo(() => new Set(favorites.data ?? []), [favorites.data]);
  return (
    <SubjectsShelf
      subjects={subjects}
      favoriteIds={favoriteIds}
      isLoading={isLoading || favorites.isLoading}
      isError={isError}
      isStudent
      modes={SUBJECTS_DISPLAY_MODES}
    />
  );
}

// The same shelf for a visitor who isn't signed in: every subject of every
// class marked public (Class.is_public), no progress, and a ⚙️ with two views —
// what a tutor marked (the default) and everything; no favourites without an
// account. See docs/core/public_access.md.
export function PreschoolPublicSubjectsShelf() {
  const { data, isLoading, isError } = useListPublicSubjects();
  const subjects = useMemo(() => data ?? [], [data]);
  return (
    <SubjectsShelf
      subjects={subjects}
      favoriteIds={NO_FAVORITES}
      isLoading={isLoading}
      isError={isError}
      isStudent={false}
      modes={PUBLIC_DISPLAY_MODES}
    />
  );
}
