"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Baby } from "lucide-react";
import {
  getTutoringApiNeedHelpQueryKey,
  useTutoringApiListAssignments,
  useTutoringApiListStudents,
  useTutoringApiNeedHelp,
  useTutoringApiPendingReview,
  useTutoringApiResolveNeedHelp,
} from "@/lib/api/browser/tutor/tutor";
import type { TutorFeedItemOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { Link } from "@/i18n/navigation";
import { Card } from "@/components/card";
import { PageContainer } from "@/components/page-container";
import { MyStudentsSidebar } from "@/components/tutor/my-students-sidebar";

const UPDATED_AT_FORMAT = new Intl.DateTimeFormat("uk-UA", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const SCHEDULED_DATE_FORMAT = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short" });

// A row's "Учитель допоміг" quick action is only wired up for the "Потрібна
// допомога" column (see FeedColumn's `onMarkHelped` prop) — its presence is
// what decides whether the whole row can still be a clickable Card (see
// weekly-calendar.tsx's LessonCard for the same href-vs-buttons tradeoff):
// nesting a <button> inside the <a> Card renders would otherwise render
// invalid HTML.
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
  const isResolvable = onMarkHelped !== undefined;

  return (
    <li>
      <Card
        href={isResolvable ? undefined : `/tutor/submissions/${item.student_lesson_id}`}
        className="flex gap-3"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
          <Baby className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-xs font-medium text-gray-500">{item.student_name}</p>
            <time className="shrink-0 text-xs text-gray-400">{UPDATED_AT_FORMAT.format(new Date(item.updated_at))}</time>
          </div>
          <p className="truncate text-base font-semibold text-gray-900">{item.subject_name}</p>
          <p className="truncate text-sm lowercase text-gray-500">{item.lesson_title}</p>
          {note && <p className="text-sm text-gray-700">«{note}»</p>}
          <p className="truncate text-xs text-gray-500">
            {item.class_name} · {SCHEDULED_DATE_FORMAT.format(new Date(`${item.scheduled_date}T00:00:00`))}
          </p>
          {isResolvable && (
            <div className="mt-1 flex items-center gap-3">
              <button
                type="button"
                disabled={isResolvingThis}
                onClick={() => onMarkHelped(item)}
                className="self-start rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {isResolvingThis ? t("markHelpedPending") : t("markHelpedButton")}
              </button>
              <Link
                href={`/tutor/submissions/${item.student_lesson_id}`}
                className="text-xs text-blue-600 hover:underline"
              >
                {t("viewLink")}
              </Link>
            </div>
          )}
        </div>
      </Card>
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
        <ul className="flex flex-col gap-2">
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
    <PageContainer>
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
    </PageContainer>
  );
}
