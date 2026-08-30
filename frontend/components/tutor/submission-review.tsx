"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { User } from "lucide-react";
import {
  getListTutorLessonCommentsQueryKey,
  getTutoringApiGetSubmissionQueryKey,
  useTutoringApiGetSubmission,
  useTutoringApiGrade,
  useTutoringApiRequestRevision,
  useTutoringApiResolveNeedHelp,
} from "@/lib/api/browser/tutor/tutor";
import type { LessonSubmissionOut, SubmissionDetailOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { Link } from "@/i18n/navigation";
import { StatusBadge } from "@/components/status-badge";
import { PageContainer } from "@/components/page-container";
import { Markdown } from "@/components/markdown";
import { ImageLightbox } from "@/components/image-lightbox";
import { SubmissionComments } from "./submission-comments";

const DUE_DATE_FORMAT = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short" });
const SUBMITTED_AT_FORMAT = new Intl.DateTimeFormat("uk-UA", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"]);

function fileNameFromUrl(url: string): string {
  const path = url.split(/[?#]/)[0];
  return path.split("/").pop() || path;
}

function isImageFile(url: string): boolean {
  const extension = fileNameFromUrl(url).split(".").pop()?.toLowerCase();
  return !!extension && IMAGE_EXTENSIONS.has(extension);
}

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

// Left panel's content for status=need_help — the tutor either sends the
// student back to work (optionally with a note) or marks the lesson
// completed outright (e.g. after resolving the question live). See
// lesson_services.resolve_need_help.
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
    <div className="flex flex-col gap-4">
      {detail.help_note && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
          <p className="text-xs font-medium text-amber-800">{t("helpNoteTitle")}</p>
          <p className="text-sm whitespace-pre-wrap">{detail.help_note}</p>
        </div>
      )}

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

// Left panel's content for status=pending_review — grade the latest
// submission (shown on the right panel) or send it back for revision.
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
    <div className="flex flex-col gap-4">
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

// One submission's attachment/comment in the right panel — an image gets an
// inline click-to-zoom preview (ImageLightbox) on top of the same file's
// entry in the compact "Files" row below it (open in a new tab / attempt a
// download; the download attribute is only honored by browsers for
// same-origin files — Django's media host being cross-origin from the
// Next.js app, it degrades to opening the file, same as the view link).
// The tutor's past reply threads directly under the submission it answers,
// same as the student wizard's own SubmissionThread.
function SubmissionAttachmentEntry({ submission }: { submission: LessonSubmissionOut }) {
  const t = useTranslations("SubmissionReview");
  // latestBadge/noFile/tutorReplyLabel are shared with the student-facing
  // SubmissionThread (components/submission-thread.tsx) rather than
  // duplicated under SubmissionReview.
  const tThread = useTranslations("SubmissionThread");

  return (
    <li className="rounded-md border border-gray-200 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <time className="text-xs text-gray-400">{new Date(submission.submitted_at).toLocaleString()}</time>
        {submission.is_latest && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
            {tThread("latestBadge")}
          </span>
        )}
      </div>

      {submission.comment && <p className="mt-1 whitespace-pre-wrap">{submission.comment}</p>}

      {submission.file && isImageFile(submission.file) && (
        <ImageLightbox src={submission.file} alt={fileNameFromUrl(submission.file)} />
      )}

      {submission.file ? (
        <div className="mt-2">
          <p className="text-xs font-medium text-gray-500">{t("filesTitle")}</p>
          <div className="mt-1 flex items-center justify-between gap-3 rounded-md bg-gray-50 px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-gray-700">{fileNameFromUrl(submission.file)}</span>
            <div className="flex shrink-0 gap-3">
              <a
                href={submission.file}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 underline hover:no-underline"
              >
                {t("viewLink")}
              </a>
              <a href={submission.file} download className="text-blue-600 underline hover:no-underline">
                {t("downloadLink")}
              </a>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-1 text-gray-500">{tThread("noFile")}</p>
      )}

      {submission.tutor_feedback && (
        <div className="mt-3 ml-4 border-l-2 border-blue-300 pl-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-blue-700">{tThread("tutorReplyLabel")}</p>
            {submission.feedback_at && (
              <time className="text-xs text-gray-400">{new Date(submission.feedback_at).toLocaleString()}</time>
            )}
          </div>
          <p className="mt-1 whitespace-pre-wrap">{submission.tutor_feedback}</p>
        </div>
      )}
    </li>
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

  const isActionable = data.status === "need_help" || data.status === "pending_review";
  const latestSubmission = data.submissions.find((s) => s.is_latest);

  return (
    <PageContainer>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Left panel: the lesson/task/student being reviewed */}
        <div className="flex bg-white min-w-0 flex-1 flex-col gap-4 rounded-md border border-gray-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <Link href={`/tutor/lessons/${data.lesson_id}`} className="text-lg font-semibold hover:underline">
                {data.lesson_title}
              </Link>
              <p className="mt-0.5 text-sm text-gray-500">
                <Link href={`/tutor/classes/${data.class_id}`} className="hover:underline">
                  {data.class_name}
                </Link>{" "}
                ·{" "}
                <Link href={`/tutor/subjects/${data.subject_id}`} className="hover:underline">
                  {data.subject_name}
                </Link>
              </p>
            </div>
            <Link
              href={`/tutor/students/${data.student_id}/calendar`}
              className="flex shrink-0 items-center gap-2 hover:underline"
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                <User className="size-4" />
              </span>
              <span className="font-medium text-gray-900">{data.student_name}</span>
            </Link>
          </div>

          {data.task_content && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {t("taskContentTitle")}
              </h3>
              <div className="mt-1 rounded-md bg-gray-100 p-3">
                <Markdown content={data.task_content} embedYoutube embedPdf />
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-6 border-t border-gray-100 pt-3 text-sm">
            <div>
              <p className="text-xs font-medium text-gray-500">{t("dueDateLabel")}</p>
              <p className="text-gray-900">{DUE_DATE_FORMAT.format(new Date(`${data.scheduled_date}T00:00:00`))}</p>
            </div>
            {latestSubmission && (
              <div>
                <p className="text-xs font-medium text-gray-500">{t("submissionDateLabel")}</p>
                <p className="text-gray-900">{SUBMITTED_AT_FORMAT.format(new Date(latestSubmission.submitted_at))}</p>
              </div>
            )}
            <div>
              <StatusBadge status={data.status} />
            </div>
          </div>

          <div className="border-t border-gray-100 pt-3">
            {data.submissions.length === 0 ? (
              <p className="text-sm text-gray-500">{t("noSubmissions")}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {data.submissions.map((submission) => (
                  <SubmissionAttachmentEntry key={submission.id} submission={submission} />
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right panel: the tutor's response/grading action */}
        <div className="flex w-full flex-col bg-white gap-4 rounded-md border border-gray-200 p-4 lg:w-96 lg:shrink-0">
          <h3 className="text-sm font-semibold">{t("tutorFeedbackTitle")}</h3>
          {data.status === "need_help" && <NeedHelpPanel detail={data} />}
          {data.status === "pending_review" && <PendingReviewPanel detail={data} />}
          {!isActionable && <p className="text-sm text-gray-500">{t("notActionable")}</p>}
        </div>
      </div>

      <div className="mt-6">
        <SubmissionComments studentLessonId={studentLessonId} />
      </div>
    </PageContainer>
  );
}
