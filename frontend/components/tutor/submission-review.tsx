"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListTutorLessonCommentsQueryKey,
  getTutoringApiGetSubmissionQueryKey,
  useTutoringApiGetSubmission,
  useTutoringApiGrade,
  useTutoringApiRequestRevision,
  useTutoringApiResolveNeedHelp,
} from "@/lib/api/browser/tutor/tutor";
import type { SubmissionDetailOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { Link } from "@/i18n/navigation";
import { StatusBadge } from "@/components/status-badge";
import { PageContainer } from "@/components/page-container";
import { SubmissionThread } from "@/components/submission-thread";
import { SubmissionComments } from "./submission-comments";

// Invalidated (not just refetched) on every mutation below so the tutor
// dashboard's Need Help / Pending Review columns drop the item the next
// time they're viewed — the mutations themselves already return the fresh
// SubmissionDetailOut, applied directly to this page's query cache.
function invalidateFeeds(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["/api/tutor/need-help"] });
  queryClient.invalidateQueries({ queryKey: ["/api/tutor/pending-review"] });
}

function GradeFields({
  gradingType,
  gradePoints,
  setGradePoints,
  gradeResult,
  setGradeResult,
}: {
  gradingType: string;
  gradePoints: string;
  setGradePoints: (v: string) => void;
  gradeResult: "pass" | "fail" | "";
  setGradeResult: (v: "pass" | "fail" | "") => void;
}) {
  const t = useTranslations("SubmissionReview");

  if (gradingType === "binary") {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t("gradeResultLabel")}</span>
        <div className="flex gap-4">
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="radio"
              name="grade-result"
              checked={gradeResult === "pass"}
              onChange={() => setGradeResult("pass")}
            />
            {t("passOption")}
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="radio"
              name="grade-result"
              checked={gradeResult === "fail"}
              onChange={() => setGradeResult("fail")}
            />
            {t("failOption")}
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="grade-points" className="text-sm font-medium">
        {t("gradePointsLabel")}
      </label>
      <input
        id="grade-points"
        type="number"
        min={1}
        max={12}
        value={gradePoints}
        onChange={(e) => setGradePoints(e.target.value)}
        className="w-24 rounded-md border border-gray-300 p-2 text-sm"
      />
    </div>
  );
}

function useGradeFieldsState(gradingType: string) {
  const [gradePoints, setGradePoints] = useState("");
  const [gradeResult, setGradeResult] = useState<"pass" | "fail" | "">("");

  const isValid = gradingType === "binary" ? gradeResult !== "" : gradePoints !== "";
  const payload =
    gradingType === "binary"
      ? { grade_result: gradeResult || null, grade_points: null }
      : { grade_points: gradePoints ? Number(gradePoints) : null, grade_result: null };

  return { gradePoints, setGradePoints, gradeResult, setGradeResult, isValid, payload };
}

function NeedHelpPanel({ detail }: { detail: SubmissionDetailOut }) {
  const t = useTranslations("SubmissionReview");
  const queryClient = useQueryClient();
  const [toStatus, setToStatus] = useState<"in_progress" | "completed">("in_progress");
  const [feedback, setFeedback] = useState("");
  const grade = useGradeFieldsState(detail.grading_type);
  const resolve = useTutoringApiResolveNeedHelp();

  const canSubmit = toStatus === "in_progress" || grade.isValid;

  const handleSubmit = () => {
    resolve.mutate(
      {
        studentLessonId: detail.student_lesson_id,
        data: { to_status: toStatus, feedback, ...(toStatus === "completed" ? grade.payload : {}) },
      },
      {
        onSuccess: (result) => {
          queryClient.setQueryData(
            getTutoringApiGetSubmissionQueryKey(detail.student_lesson_id),
            result,
          );
          // Resolving back to in-progress with feedback posts a reply comment
          // server-side — refetch so it shows up in SubmissionComments below.
          queryClient.invalidateQueries({
            queryKey: getListTutorLessonCommentsQueryKey(detail.student_lesson_id),
          });
          invalidateFeeds(queryClient);
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-4 rounded-md border border-gray-200 p-4">
      <h3 className="text-sm font-semibold">{t("resolveNeedHelpTitle")}</h3>

      {detail.help_note && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
          <p className="text-xs font-medium text-amber-800">{t("helpNoteTitle")}</p>
          <p className="text-sm whitespace-pre-wrap">{detail.help_note}</p>
        </div>
      )}

      {detail.submissions.length > 0 && <SubmissionThread submissions={detail.submissions} />}

      <div className="flex gap-4">
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="radio"
            name="resolve-to-status"
            checked={toStatus === "in_progress"}
            onChange={() => setToStatus("in_progress")}
          />
          {t("backToInProgressButton")}
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="radio"
            name="resolve-to-status"
            checked={toStatus === "completed"}
            onChange={() => setToStatus("completed")}
          />
          {t("markCompletedButton")}
        </label>
      </div>

      {toStatus === "completed" && <GradeFields gradingType={detail.grading_type} {...grade} />}

      <div className="flex flex-col gap-1">
        <label htmlFor="resolve-feedback" className="text-sm font-medium">
          {t("feedbackLabel")}
        </label>
        <textarea
          id="resolve-feedback"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={2}
          className="rounded-md border border-gray-300 p-2 text-sm"
        />
      </div>

      <button
        type="button"
        disabled={!canSubmit || resolve.isPending}
        onClick={handleSubmit}
        className="self-start rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {t("resolveButton")}
      </button>
    </div>
  );
}

function PendingReviewPanel({ detail }: { detail: SubmissionDetailOut }) {
  const t = useTranslations("SubmissionReview");
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState("");
  const grade = useGradeFieldsState(detail.grading_type);
  const gradeSubmission = useTutoringApiGrade();
  const requestRevision = useTutoringApiRequestRevision();

  const applyResult = (result: SubmissionDetailOut) => {
    queryClient.setQueryData(getTutoringApiGetSubmissionQueryKey(detail.student_lesson_id), result);
    invalidateFeeds(queryClient);
  };

  const handleGrade = () => {
    gradeSubmission.mutate(
      { studentLessonId: detail.student_lesson_id, data: { feedback, ...grade.payload } },
      { onSuccess: applyResult },
    );
  };

  const handleRequestRevision = () => {
    requestRevision.mutate(
      { studentLessonId: detail.student_lesson_id, data: { feedback } },
      { onSuccess: applyResult },
    );
  };

  const isPending = gradeSubmission.isPending || requestRevision.isPending;

  return (
    <div className="flex flex-col gap-4 rounded-md border border-gray-200 p-4">
      <h3 className="text-sm font-semibold">{t("gradeSectionTitle")}</h3>

      {detail.submissions.length === 0 ? (
        <p className="text-sm text-gray-500">{t("noSubmissions")}</p>
      ) : (
        <SubmissionThread submissions={detail.submissions} />
      )}

      <GradeFields gradingType={detail.grading_type} {...grade} />

      <div className="flex flex-col gap-1">
        <label htmlFor="review-feedback" className="text-sm font-medium">
          {t("feedbackLabel")}
        </label>
        <textarea
          id="review-feedback"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={2}
          className="rounded-md border border-gray-300 p-2 text-sm"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={!grade.isValid || isPending}
          onClick={handleGrade}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {t("completeButton")}
        </button>
        <button
          type="button"
          disabled={!feedback.trim() || isPending}
          onClick={handleRequestRevision}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-50"
        >
          {t("requestRevisionButton")}
        </button>
      </div>
    </div>
  );
}

export function SubmissionReview({ studentLessonId }: { studentLessonId: number }) {
  const t = useTranslations("SubmissionReview");
  const { data, isLoading, isError } = useTutoringApiGetSubmission(studentLessonId);

  if (isLoading) {
    return <p className="p-6 text-sm text-gray-500">{t("loading")}</p>;
  }
  if (isError || !data) {
    return <p className="p-6 text-sm text-red-600">{t("error")}</p>;
  }

  return (
    <PageContainer title={data.lesson_title} maxWidthClassName="xl:max-w-2xl">
      <div className="mb-4 flex flex-col gap-4">
        <Link href="/" className="self-start text-sm text-blue-600 underline hover:no-underline">
          {t("back")}
        </Link>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-medium">{data.student_name}</p>
            <p className="text-sm text-gray-500">
              {data.class_name} · {data.subject_name}
            </p>
          </div>
          <StatusBadge status={data.status} />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {data.status === "need_help" && <NeedHelpPanel detail={data} />}
        {data.status === "pending_review" && <PendingReviewPanel detail={data} />}
        {data.status !== "need_help" && data.status !== "pending_review" && (
          <p className="text-sm text-gray-500">{t("notActionable")}</p>
        )}

        <SubmissionComments studentLessonId={studentLessonId} />
      </div>
    </PageContainer>
  );
}
