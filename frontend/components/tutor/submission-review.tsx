"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { File as FileIcon, User, X } from "lucide-react";
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
import { Markdown } from "@/components/markdown";
import { SubmissionThread } from "@/components/submission-thread";
import { FileDropzone } from "@/components/file-dropzone";
import { AnnotatableImageLightbox } from "./annotatable-image-lightbox";
import { SubmissionComments } from "./submission-comments";

const DUE_DATE_FORMAT = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short" });
const SUBMITTED_AT_FORMAT = new Intl.DateTimeFormat("uk-UA", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

// Invalidated (not just refetched) on every mutation below so the tutor
// dashboard's Need Help / Pending Review columns drop the item the next
// time they're viewed — the mutations themselves already return the fresh
// SubmissionDetailOut, applied directly to this page's query cache.
function invalidateFeeds(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["/api/tutor/need-help"] });
  queryClient.invalidateQueries({ queryKey: ["/api/tutor/pending-review"] });
}

// A live preview URL for a File the tutor has attached but not yet sent.
// Creation and revocation happen inside the *same* effect run (not a
// useMemo'd creation paired with a differently-scoped cleanup) — React's
// dev-mode Strict Mode double-invokes effects (mount → cleanup → mount)
// without re-running useMemo, so a memoized URL gets revoked out from under
// itself on the phantom first mount, leaving a broken <img> forever. Pairing
// create+revoke 1:1 per effect run survives that double-invoke correctly.
function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      const clear = () => setUrl(null);
      clear();
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const applyUrl = () => setUrl(objectUrl);
    applyUrl();
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return url;
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

// One pending attachment's thumbnail + remove button in PendingReviewPanel
// — its own component (rather than inline in a .map()) purely so
// useObjectUrl can be called once per file, which a bare loop can't do.
// Two sources feed the same list: AnnotatableImageLightbox's drawn PNGs
// (named after whichever of the student's images they came from) and
// whatever the tutor picks straight from their computer below — so this
// only shows a real thumbnail for images and falls back to a generic file
// icon for anything else (a PDF, a doc, ...). Captioned with the file's own
// name and the student's, e.g. "photo-annotated.png - Діана Мельник".
function AttachedFilePreview({
  file,
  studentName,
  onRemove,
}: {
  file: File;
  studentName: string;
  onRemove: () => void;
}) {
  const t = useTranslations("SubmissionReview");
  const isImage = file.type.startsWith("image/");
  const url = useObjectUrl(isImage ? file : null);

  return (
    <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 p-2">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-gray-200 text-gray-500">
          <FileIcon className="h-5 w-5" />
        </div>
      )}
      <span className="min-w-0 flex-1 truncate text-xs text-gray-600">
        {t("attachedFileLabel", { fileName: file.name, studentName })}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t("removeAttachedFile")}
        className="shrink-0 text-gray-400 hover:text-red-600"
      >
        <X className="h-4 w-4" />
      </button>
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
        className="self-start cursor-pointer rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-gray-900"
      >
        {t("resolveButton")}
      </button>
    </div>
  );
}

// Left panel's content for status=pending_review — grade the latest
// submission (shown on the right panel) or send it back for revision.
// `feedback`/`attachedFiles` (and their setters) are lifted to
// SubmissionReview, not owned here — AnnotatableImageLightbox's "Send for
// revision" shortcut needs to trigger the exact same request-revision call
// this panel's own button does, using whatever's already in this form plus
// the newly-drawn image, so the submit action has to live one level up
// where both this panel and every AnnotatableImageLightbox instance (one
// per image, rendered via SubmissionThread's renderImage below) can reach it.
function PendingReviewPanel({
  detail,
  feedback,
  onFeedbackChange,
  attachedFiles,
  onAttachedFilesChange,
  onRequestRevision,
  isRequestRevisionPending,
  onResult,
}: {
  detail: SubmissionDetailOut;
  feedback: string;
  onFeedbackChange: (value: string) => void;
  attachedFiles: File[];
  onAttachedFilesChange: (files: File[]) => void;
  onRequestRevision: () => void;
  isRequestRevisionPending: boolean;
  onResult: (result: SubmissionDetailOut) => void;
}) {
  const t = useTranslations("SubmissionReview");
  const grade = useGradeFieldsState(detail.grading_type);
  const gradeSubmission = useTutoringApiGrade();

  const handleGrade = () => {
    gradeSubmission.mutate(
      { studentLessonId: detail.student_lesson_id, data: { feedback, ...grade.payload } },
      { onSuccess: onResult },
    );
  };

  // Picking/dropping more files adds to the current selection — same as
  // TaskStep's dropzone on the student side — rather than replacing it, so
  // the tutor can build up several attachments across multiple picks.
  const addFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    onAttachedFilesChange([...attachedFiles, ...Array.from(fileList)]);
  };

  const isPending = gradeSubmission.isPending || isRequestRevisionPending;
  const canRequestRevision = feedback.trim().length > 0 || attachedFiles.length > 0;

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
          onChange={(e) => onFeedbackChange(e.target.value)}
          rows={2}
          className="rounded-md border border-gray-300 p-2 text-sm"
        />

        <FileDropzone hint={t("uploadFileHint")} onFilesSelected={addFiles} />

        {attachedFiles.map((file, index) => (
          <AttachedFilePreview
            key={`${file.name}-${index}`}
            file={file}
            studentName={detail.student_name}
            onRemove={() => onAttachedFilesChange(attachedFiles.filter((_, i) => i !== index))}
          />
        ))}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={!grade.isValid || isPending}
          onClick={handleGrade}
          className="cursor-pointer rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-gray-900"
        >
          {t("completeButton")}
        </button>
        <button
          type="button"
          disabled={!canRequestRevision || isPending}
          onClick={onRequestRevision}
          className="cursor-pointer rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
        >
          {t("requestRevisionButton")}
        </button>
      </div>
    </div>
  );
}

export function SubmissionReview({ studentLessonId }: { studentLessonId: number }) {
  const t = useTranslations("SubmissionReview");
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useTutoringApiGetSubmission(studentLessonId);
  // Lifted above both panels: any submission's image (left panel) can feed
  // this one pending reply — drawing on several images and attaching each
  // one piles them all up here, same as files the tutor picks straight from
  // their computer in PendingReviewPanel's own upload control — which
  // either that panel's submit button or AnnotatableImageLightbox's own
  // "Send for revision" shortcut can send, so the request-revision call
  // itself lives here too rather than inside either of those.
  const [attachedFeedbackFiles, setAttachedFeedbackFiles] = useState<File[]>([]);
  const [feedback, setFeedback] = useState("");
  const requestRevision = useTutoringApiRequestRevision();

  if (isLoading) {
    return <p className="p-6 text-sm text-gray-500">{t("loading")}</p>;
  }
  if (isError || !data) {
    return <p className="p-6 text-sm text-red-600">{t("error")}</p>;
  }

  const isActionable = data.status === "need_help" || data.status === "pending_review";
  const latestSubmission = data.submissions.find((s) => s.is_latest);

  // Shared by grading and both revision paths (PendingReviewPanel's own
  // button, and AnnotatableImageLightbox's "Send for revision" shortcut) —
  // resets the draft reply once whichever action actually goes through.
  const applyResult = (result: SubmissionDetailOut) => {
    queryClient.setQueryData(getTutoringApiGetSubmissionQueryKey(studentLessonId), result);
    invalidateFeeds(queryClient);
    setAttachedFeedbackFiles([]);
    setFeedback("");
  };

  const handleRequestRevision = () => {
    requestRevision.mutate(
      { studentLessonId, data: { feedback, images: attachedFeedbackFiles } },
      { onSuccess: applyResult },
    );
  };

  // AnnotatableImageLightbox's "Send for revision" — attach this image and
  // submit right away with whatever's already in the form, instead of
  // making the tutor close the dialog and hit Send separately.
  const handleAttachAndSend = (file: File) => {
    const nextFiles = [...attachedFeedbackFiles, file];
    setAttachedFeedbackFiles(nextFiles);
    requestRevision.mutate(
      { studentLessonId, data: { feedback, images: nextFiles } },
      { onSuccess: applyResult },
    );
  };

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

          {data.submissions.length > 0 && (
            <div className="border-t border-gray-100 pt-3">
              <SubmissionThread
                submissions={data.submissions}
                renderImage={(file, alt) => (
                  <AnnotatableImageLightbox
                    src={file}
                    alt={alt}
                    canAttach={data.status === "pending_review"}
                    onAttach={(f) => setAttachedFeedbackFiles((prev) => [...prev, f])}
                    onAttachAndSend={handleAttachAndSend}
                  />
                )}
              />
            </div>
          )}
        </div>

        {/* Right panel: the tutor's response/grading action */}
        <div className="flex w-full flex-col bg-white gap-4 rounded-md border border-gray-200 p-4 lg:w-96 lg:shrink-0">
          <h3 className="text-sm font-semibold">{t("tutorFeedbackTitle")}</h3>
          {data.status === "need_help" && <NeedHelpPanel detail={data} />}
          {data.status === "pending_review" && (
            <PendingReviewPanel
              detail={data}
              feedback={feedback}
              onFeedbackChange={setFeedback}
              attachedFiles={attachedFeedbackFiles}
              onAttachedFilesChange={setAttachedFeedbackFiles}
              onRequestRevision={handleRequestRevision}
              isRequestRevisionPending={requestRevision.isPending}
              onResult={applyResult}
            />
          )}
          {!isActionable && <p className="text-sm text-gray-500">{t("notActionable")}</p>}

          <div className="border-t border-gray-100 pt-4">
            <SubmissionComments studentLessonId={studentLessonId} />
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
