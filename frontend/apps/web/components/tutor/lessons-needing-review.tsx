"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ImagePlus, Loader2, Trash2 } from "lucide-react";
import {
  getListTutorLessonsNeedingReviewQueryKey,
  useDeleteTutorLesson,
  useListTutorLessonsNeedingReview,
  useSetTutorLessonNeedReview,
  useUpdateTutorLessonIcon,
} from "@school-ahead/api-client/browser/tutor/tutor";
import type { NeedReviewLessonOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { PreschoolLessonTile } from "@/components/subjects/preschool-lesson-tile";
import { useDialogs } from "@/components/dialogs/app-dialogs";

// One of the small round buttons down a card's right edge — same look as the
// corner buttons on the tutor's Preschool Preview tiles.
function CornerButton({
  label,
  onClick,
  disabled,
  hoverClassName,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  hoverClassName: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`rounded-full bg-black/40 p-1 text-white disabled:opacity-50 disabled:hover:bg-black/40 ${hoverClassName}`}
    >
      {children}
    </button>
  );
}

// A flagged lesson as the same card a preschool child sees on the subject page
// (PreschoolLessonTile) — the whole card opens the lesson for editing — with
// small buttons down its right edge: mark the problem as fixed, delete the
// lesson (with a stronger warning when students have it), and (only while the
// lesson has no picture of its own) load its YouTube thumbnail as one. The card is a sibling of the buttons, not their
// parent, so pressing one never also opens the lesson.
function NeedsReviewTile({ lesson, onChanged }: { lesson: NeedReviewLessonOut; onChanged: () => void }) {
  const t = useTranslations("TutorDashboard");
  const dialogs = useDialogs();
  const tSubject = useTranslations("TutorSubjectDetail");
  const markFixed = useSetTutorLessonNeedReview();
  const deleteLesson = useDeleteTutorLesson();
  const loadImage = useUpdateTutorLessonIcon();

  const handleFixed = () =>
    markFixed.mutate(
      { lessonId: lesson.id, data: { need_review: false } },
      { onSuccess: onChanged, onError: () => dialogs.error(t("needsReviewFixedError")) },
    );

  // A lesson students have can still be deleted, but their copies (and any
  // work on them) go with it — so that gets its own, blunter confirmation, and
  // the request says `force` (without it the backend refuses, see
  // tutoring.api.delete_lesson).
  const isAssigned = lesson.student_count > 0;
  const handleDelete = async () => {
    const confirmation = isAssigned
      ? t("needsReviewDeleteAssignedConfirm", { title: lesson.title, count: lesson.student_count })
      : tSubject("deleteLessonConfirm", { title: lesson.title });
    if (!(await dialogs.confirm({ message: confirmation, tone: "danger" }))) return;
    deleteLesson.mutate(
      { lessonId: lesson.id, params: isAssigned ? { force: true } : undefined },
      { onSuccess: onChanged, onError: () => dialogs.error(tSubject("deleteLessonError")) },
    );
  };

  const handleLoadImage = () =>
    loadImage.mutate(
      { lessonId: lesson.id },
      {
        onSuccess: (data) => {
          if (data.updated === 0) {
            dialogs.alert(tSubject("updateLessonIconNoVideo"));
            return;
          }
          onChanged();
        },
        onError: () => dialogs.error(tSubject("updateLessonIconsError")),
      },
    );

  return (
    <div className="relative" title={`${lesson.subject_name} · ${lesson.class_name} · ${lesson.topic_title}`}>
      <PreschoolLessonTile
        href={`/tutor/lessons/${lesson.id}`}
        icon={lesson.icon}
        subjectIcon={lesson.subject_icon}
        lessonType={lesson.lesson_type}
        title={lesson.title}
        topicTitle={lesson.topic_title}
        index={Math.max(0, lesson.order_index - 1)}
      />
      <div className="absolute right-1.5 top-1.5 flex flex-col gap-1">
        <CornerButton
          label={t("needsReviewFixedButton")}
          onClick={handleFixed}
          disabled={markFixed.isPending}
          hoverClassName="hover:bg-emerald-600"
        >
          <Check className="size-3" aria-hidden="true" />
        </CornerButton>
        <CornerButton
          label={
            isAssigned
              ? t("needsReviewDeleteAssignedButton", { count: lesson.student_count })
              : tSubject("deleteLessonButton")
          }
          onClick={handleDelete}
          disabled={deleteLesson.isPending}
          hoverClassName="hover:bg-red-600"
        >
          <Trash2 className="size-3" aria-hidden="true" />
        </CornerButton>
        {!lesson.icon && (
          <CornerButton
            label={tSubject("updateLessonIconButton")}
            onClick={handleLoadImage}
            disabled={loadImage.isPending}
            hoverClassName="hover:bg-sky-600"
          >
            {loadImage.isPending ? (
              <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            ) : (
              <ImagePlus className="size-3" aria-hidden="true" />
            )}
          </CornerButton>
        )}
      </div>
    </div>
  );
}

// The tutor dashboard's "lessons that need review" section: lessons a student
// flagged with the warning button on the preschool lesson screen (the video
// won't play, ...) — Lesson.need_review. Follows the dashboard's own
// subject/class filters (there's no student filter here: the flag is on the
// lesson, whoever reported it).
export function LessonsNeedingReview({ subjectId, classId }: { subjectId?: number; classId?: number }) {
  const t = useTranslations("TutorDashboard");
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useListTutorLessonsNeedingReview({ subject: subjectId, class_id: classId });
  const lessons = data ?? [];

  // The key without params matches the list under every filter.
  const reload = () => queryClient.invalidateQueries({ queryKey: getListTutorLessonsNeedingReviewQueryKey() });

  return (
    <div className="flex flex-1 flex-col gap-2">
      <h3 className="text-lg font-semibold">
        {t("needsReviewTitle")} <span className="text-sm font-normal text-gray-500">({lessons.length})</span>
      </h3>

      {isLoading && <p className="text-sm text-gray-500">...</p>}
      {isError && <p className="text-sm text-red-600">{t("error")}</p>}
      {!isLoading && !isError && lessons.length === 0 && (
        <p className="text-sm text-gray-500">{t("needsReviewEmpty")}</p>
      )}

      {lessons.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-2">
          {lessons.map((lesson) => (
            <NeedsReviewTile key={lesson.id} lesson={lesson} onChanged={reload} />
          ))}
        </div>
      )}
    </div>
  );
}
