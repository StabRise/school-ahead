"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { User } from "lucide-react";
import {
  getTutoringApiNeedHelpQueryKey,
  useTutoringApiListAssignments,
  useTutoringApiListStudents,
  useTutoringApiNeedHelp,
  useTutoringApiPendingReview,
  useTutoringApiResolveNeedHelp,
} from "@school-ahead/api-client/browser/tutor/tutor";
import type { TutorFeedItemOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { Link, useRouter } from "@/i18n/navigation";
import { SimplePageContainer } from "@/components/simple/page-container";
import { SimpleEntityIcon } from "@/components/simple/entity-icon";
import { formatShortDate } from "@/components/simple/format";
import { MyStudentsSidebar } from "@/components/tutor/my-students-sidebar";

const UPDATED_AT_FORMAT = new Intl.DateTimeFormat("uk-UA", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

// The whole row navigates to the submission on click — a plain, keyboard-
// operable div (role="link"/tabIndex/Enter, same contract Card's onClick
// branch used before) rather than a real <a>, since this row also nests
// real <Link>s for the student/subject/class and, for "Потрібна допомога"
// rows, a real <button> for the quick action. Every nested Link/button
// stops the click from bubbling so it doesn't also trigger the row's own
// navigation.
function FeedRow({
  item,
  note,
  onMarkHelped,
  isResolvingThis,
}: {
  item: TutorFeedItemOut;
  note?: string;
  onMarkHelped?: (item: TutorFeedItemOut) => void;
  isResolvingThis?: boolean;
}) {
  const t = useTranslations("TutorDashboard");
  const router = useRouter();
  const isResolvable = onMarkHelped !== undefined;
  const stopPropagation = (e: React.SyntheticEvent) => e.stopPropagation();
  const goToSubmission = () => router.push(`/tutor/submissions/${item.student_lesson_id}`);

  return (
    <li>
      <div
        role="link"
        tabIndex={0}
        onClick={goToSubmission}
        onKeyDown={(e) => {
          if (e.key === "Enter") goToSubmission();
        }}
        className="flex cursor-pointer gap-3 rounded px-2 py-2 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        <SimpleEntityIcon fallback={User} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <Link
              href={`/tutor/students/${item.student_id}/calendar`}
              onClick={stopPropagation}
              className="truncate text-xs font-medium text-gray-500 hover:underline"
            >
              {item.student_name}
            </Link>
            <time className="shrink-0 text-xs text-gray-400">{UPDATED_AT_FORMAT.format(new Date(item.updated_at))}</time>
          </div>
          <Link
            href={`/tutor/subjects/${item.subject_id}`}
            onClick={stopPropagation}
            className="truncate text-sm font-medium text-gray-900 hover:underline"
          >
            {item.subject_name}
          </Link>
          <p className="truncate text-xs lowercase text-gray-500">{item.lesson_title}</p>
          {note && <p className="text-xs text-gray-600">«{note}»</p>}
          <p className="truncate text-xs text-gray-400">
            <Link href={`/tutor/classes/${item.class_id}`} onClick={stopPropagation} className="hover:underline">
              {item.class_name}
            </Link>{" "}
            · {formatShortDate(item.scheduled_date)}
          </p>
          {isResolvable && (
            <button
              type="button"
              disabled={isResolvingThis}
              onClick={(e) => {
                e.stopPropagation();
                onMarkHelped(item);
              }}
              className="mt-1 self-start rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {isResolvingThis ? t("markHelpedPending") : t("markHelpedButton")}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function FeedColumn({
  title,
  items,
  isLoading,
  isError,
  emptyLabel,
  errorLabel,
  showHelpNote,
  onMarkHelped,
  resolvingId,
}: {
  title: string;
  items: TutorFeedItemOut[];
  isLoading: boolean;
  isError: boolean;
  emptyLabel: string;
  errorLabel: string;
  showHelpNote?: boolean;
  onMarkHelped?: (item: TutorFeedItemOut) => void;
  resolvingId?: number;
}) {
  return (
    <div className="flex flex-1 flex-col gap-2">
      <h3 className="text-lg font-semibold">
        {title} <span className="text-sm font-normal text-gray-500">({items.length})</span>
      </h3>

      {isLoading && <p className="text-sm text-gray-500">...</p>}
      {isError && <p className="text-sm text-red-600">{errorLabel}</p>}

      {!isLoading && !isError && items.length === 0 && (
        <p className="text-sm text-gray-500">{emptyLabel}</p>
      )}

      {items.length > 0 && (
        <ul className="flex flex-col divide-y divide-gray-100">
          {items.map((item) => (
            <FeedRow
              key={item.student_lesson_id}
              item={item}
              note={showHelpNote ? item.help_note : undefined}
              onMarkHelped={onMarkHelped}
              isResolvingThis={resolvingId === item.student_lesson_id}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export function TutorDashboard() {
  const t = useTranslations("TutorDashboard");
  const queryClient = useQueryClient();
  const { data: assignments } = useTutoringApiListAssignments();
  const { data: students } = useTutoringApiListStudents();

  const [subjectId, setSubjectId] = useState<number | undefined>(undefined);
  const [classId, setClassId] = useState<number | undefined>(undefined);
  const [studentId, setStudentId] = useState<number | undefined>(undefined);

  const subjectOptions = useMemo(() => {
    const seen = new Map<number, string>();
    for (const a of assignments ?? []) seen.set(a.subject_id, a.subject_name);
    return Array.from(seen, ([id, name]) => ({ id, name }));
  }, [assignments]);

  const classOptions = useMemo(() => {
    const seen = new Map<number, string>();
    for (const a of assignments ?? []) seen.set(a.class_id, a.class_name);
    return Array.from(seen, ([id, name]) => ({ id, name }));
  }, [assignments]);

  const params = { subject: subjectId, class_id: classId, student: studentId };
  const needHelp = useTutoringApiNeedHelp(params);
  const pendingReview = useTutoringApiPendingReview(params);

  // "Учитель допоміг" quick action — resolves NeedHelp -> InProgress with a
  // fixed feedback note, threading a "question resolved with the teacher"
  // reply onto the open question (see backend lesson_services.resolve_need_help).
  // Distinct from the student's own "Я вже розібрався(лась)" self-resolve
  // (resolve-need-help-button.tsx), which instead lands
  // lesson_services.SELF_RESOLVED_NOTE on the question.
  const resolveNeedHelp = useTutoringApiResolveNeedHelp();
  const handleMarkHelped = (item: TutorFeedItemOut) => {
    resolveNeedHelp.mutate(
      {
        studentLessonId: item.student_lesson_id,
        data: { to_status: "in_progress", feedback: t("markHelpedComment") },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getTutoringApiNeedHelpQueryKey() });
        },
      },
    );
  };

  return (
    <SimplePageContainer>
      <div className="flex flex-col gap-8 bg-white lg:flex-row lg:items-start lg:gap-8">
        {/* Left: filters */}
        <div className="flex w-full flex-col gap-3 lg:w-48 lg:shrink-0">
          <select
            value={subjectId ?? ""}
            onChange={(e) => setSubjectId(e.target.value ? Number(e.target.value) : undefined)}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-700"
          >
            <option value="">{t("allSubjects")}</option>
            {subjectOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            value={classId ?? ""}
            onChange={(e) => setClassId(e.target.value ? Number(e.target.value) : undefined)}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-700"
          >
            <option value="">{t("allClasses")}</option>
            {classOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={studentId ?? ""}
            onChange={(e) => setStudentId(e.target.value ? Number(e.target.value) : undefined)}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-700"
          >
            <option value="">{t("allStudents")}</option>
            {(students ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Center: Потрібна допомога / На перевірці, stacked */}
        <div className="flex min-w-0 flex-1 flex-col gap-8">
          {resolveNeedHelp.isError && <p className="text-sm text-red-600">{t("markHelpedError")}</p>}

          <FeedColumn
            title={t("needHelpTitle")}
            items={needHelp.data?.items ?? []}
            isLoading={needHelp.isLoading}
            isError={needHelp.isError}
            emptyLabel={t("needHelpEmpty")}
            errorLabel={t("error")}
            showHelpNote
            onMarkHelped={handleMarkHelped}
            resolvingId={resolveNeedHelp.isPending ? resolveNeedHelp.variables?.studentLessonId : undefined}
          />
          <FeedColumn
            title={t("pendingReviewTitle")}
            items={pendingReview.data?.items ?? []}
            isLoading={pendingReview.isLoading}
            isError={pendingReview.isError}
            emptyLabel={t("pendingReviewEmpty")}
            errorLabel={t("error")}
          />
        </div>

        {/* Right: Мої учні, visually set apart from the white page background */}
        <MyStudentsSidebar students={students ?? []} />
      </div>
    </SimplePageContainer>
  );
}
