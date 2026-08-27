"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  useTutoringApiListAssignments,
  useTutoringApiListStudents,
  useTutoringApiNeedHelp,
  useTutoringApiPendingReview,
} from "@/lib/api/browser/tutor/tutor";
import type { TutorFeedItemOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/card";
import { PageContainer } from "@/components/page-container";

function FeedRow({ item, note }: { item: TutorFeedItemOut; note?: string }) {
  return (
    <li>
      <Card href={`/tutor/submissions/${item.student_lesson_id}`} className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-4">
          <p className="truncate font-medium">{item.student_name}</p>
          <StatusBadge status={item.status} />
        </div>
        <p className="truncate text-sm text-gray-700">{item.lesson_title}</p>
        <p className="truncate text-xs text-gray-500">
          {item.class_name} · {item.subject_name}
        </p>
        {note && <p className="truncate text-xs text-amber-700">{note}</p>}
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
}: {
  title: string;
  items: TutorFeedItemOut[];
  isLoading: boolean;
  isError: boolean;
  emptyLabel: string;
  errorLabel: string;
  showHelpNote?: boolean;
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
            <FeedRow key={item.student_lesson_id} item={item} note={showHelpNote ? item.help_note : undefined} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function TutorDashboard() {
  const t = useTranslations("TutorDashboard");
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

  return (
    <PageContainer title={t("title")} maxWidthClassName="xl:max-w-5xl">
      <div className="mb-6 flex flex-wrap gap-3">
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

      <div className="flex flex-col gap-8 md:flex-row md:gap-6">
        <FeedColumn
          title={t("needHelpTitle")}
          items={needHelp.data?.items ?? []}
          isLoading={needHelp.isLoading}
          isError={needHelp.isError}
          emptyLabel={t("needHelpEmpty")}
          errorLabel={t("error")}
          showHelpNote
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
    </PageContainer>
  );
}
