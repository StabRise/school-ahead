"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { FileText, ListChecks, Monitor } from "lucide-react";
import { Link } from "@/i18n/navigation";

// Per-type icon, mirroring components/simple/lesson-type-icon.tsx's map —
// kept local (not imported) since this tile always renders it in white on
// a colored gradient, never the grey/colorful variants that map's own
// LESSON_TYPE_ICON_COLOR covers.
export const PRESCHOOL_LESSON_TYPE_ICON = {
  theory: Monitor,
  with_task: FileText,
  with_quiz: ListChecks,
} as const;

// One gradient per card, cycled by position within its block — the "candy
// shelf" palette from the preschool subject-detail mock (pink, sky, amber,
// emerald, violet, repeating), distinct from BOOK_COLORS in
// subjects-shelf.tsx (top-to-bottom book covers, not a grid of cards).
export const PRESCHOOL_CARD_GRADIENTS = [
  "from-rose-400 to-rose-600",
  "from-sky-400 to-sky-600",
  "from-amber-400 to-amber-500",
  "from-emerald-400 to-emerald-600",
  "from-violet-400 to-violet-600",
  "from-pink-400 to-pink-600",
];

// Every tile has the same fixed height, per breakpoint — never derived from
// its content, its picture's proportions or how many tiles are on screen.
// (An `aspect-video` picture box sized itself off the tile's width and
// collapsed to a sliver in iPad Safari, so cards got shorter the more of them
// had loaded.) The picture height is picked so the picture is roughly 16:9
// at the column width each grid layout gives it, and PICTURE + CAPTION add
// up to TILE_HEIGHT: 6rem+2.25rem, 8rem+2.25rem, 11rem+2.25rem.
const TILE_HEIGHT = "h-[8.25rem] sm:h-[10.25rem] lg:h-[13.25rem]";
const TILE_PICTURE_HEIGHT = "h-24 sm:h-32 lg:h-44";

// href is a plain (already locale-scoped-by-caller) path — same as every
// other call site of next-intl's Link in this codebase; omit it to render a
// non-interactive tile (the tutor's read-only "Preschool Preview" tab).
function CardShell({ href, className, children }: { href?: string; className: string; children: ReactNode }) {
  if (href) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return <div className={className}>{children}</div>;
}

export interface PreschoolLessonTileProps {
  href?: string;
  icon: string | null;
  subjectIcon: string | null;
  lessonType: string;
  title: string;
  topicTitle?: string;
  index: number;
}

// Shared by the real preschool subject-detail grid (preschool-subject-
// detail-page.tsx — student-facing, interactive) and the tutor's
// "Preschool Preview" tab (preschool-preview-tab.tsx — read-only, no href)
// so a tutor's preview genuinely matches what a preschool-mode student
// sees. `icon` (lesson.icon, a YouTube thumbnail or tutor upload) wins,
// falling back to `subjectIcon` — when present it takes over the whole
// tile (image-forward, like a book cover) with just the title captioned
// below; only a lesson with neither falls back to the plain gradient +
// lesson-type-glyph tile.
export function PreschoolLessonTile({
  href,
  icon,
  subjectIcon,
  lessonType,
  title,
  topicTitle,
  index,
}: PreschoolLessonTileProps) {
  const t = useTranslations("PreschoolSubjectDetail");
  const resolvedIcon = icon ?? subjectIcon;

  if (resolvedIcon) {
    return (
      <CardShell
        href={href}
        className={`group flex shrink-0 flex-col overflow-hidden rounded-2xl bg-white shadow-lg transition-transform hover:-translate-y-1 active:scale-95 ${TILE_HEIGHT}`}
      >
        <span className={`relative block w-full shrink-0 overflow-hidden bg-gray-100 ${TILE_PICTURE_HEIGHT}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- external/user-uploaded URL, not a static asset next/image can optimize */}
          <img src={resolvedIcon} alt="" className="absolute inset-0 h-full w-full object-cover" />
        </span>
        <span className="block h-9 shrink-0 truncate px-2 text-center text-xs font-bold leading-9 text-gray-700">
          {title}
        </span>
      </CardShell>
    );
  }

  const Icon = PRESCHOOL_LESSON_TYPE_ICON[lessonType as keyof typeof PRESCHOOL_LESSON_TYPE_ICON] ?? Monitor;
  const gradient = PRESCHOOL_CARD_GRADIENTS[index % PRESCHOOL_CARD_GRADIENTS.length];

  return (
    <CardShell
      href={href}
      className={`group flex shrink-0 flex-col gap-1.5 overflow-hidden rounded-2xl bg-gradient-to-br p-3 text-white shadow-lg transition-transform hover:-translate-y-1 active:scale-95 sm:p-4 ${TILE_HEIGHT} ${gradient}`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/25">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="w-fit shrink-0 rounded-full bg-white/25 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide">
        {t("lessonBadge", { index: index + 1 })}
      </span>
      <span className="line-clamp-2 text-sm font-extrabold leading-tight sm:text-base">{title}</span>
      {topicTitle && (
        <span className="hidden shrink-0 truncate text-xs font-medium text-white/80 sm:block">{topicTitle}</span>
      )}
    </CardShell>
  );
}
