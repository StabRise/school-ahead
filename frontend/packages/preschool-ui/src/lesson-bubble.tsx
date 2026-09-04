"use client";

import Link from "next/link";
import type { CalendarItemOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { DefaultStepIcon } from "./decorations";

// A small round subject/lesson icon that links straight into the lesson —
// used by the calendar's day cards and the "tails" backlog cards. See
// docs/interfaces/preschool.md.
export function LessonBubble({ item }: { item: CalendarItemOut }) {
  const isCompleted = item.status === "completed";
  const src = item.lesson_icon ?? item.subject_icon;

  return (
    <Link
      href={`/lessons/${item.id}`}
      aria-label={item.lesson_title}
      title={item.lesson_title}
      className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-[3px] border-white bg-white shadow-md transition-transform active:scale-95 ${
        isCompleted ? "opacity-60 grayscale" : "hover:scale-110"
      }`}
    >
      <div className="h-11 w-11 overflow-hidden rounded-full">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="h-full w-full object-cover" />
        ) : (
          <DefaultStepIcon />
        )}
      </div>
      {isCompleted && (
        <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white shadow">
          <svg viewBox="0 0 24 24" className="h-3 w-3" aria-hidden="true">
            <path
              d="M5 13l4 4L19 7"
              stroke="currentColor"
              strokeWidth="3.4"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      )}
    </Link>
  );
}
