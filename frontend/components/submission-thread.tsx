"use client";

import { useTranslations } from "next-intl";
import { Info } from "lucide-react";
import type { LessonSubmissionOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { ImageLightbox } from "@/components/image-lightbox";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"]);

function fileNameFromUrl(url: string): string {
  const path = url.split(/[?#]/)[0];
  return path.split("/").pop() || path;
}

function isImageFile(url: string): boolean {
  const extension = fileNameFromUrl(url).split(".").pop()?.toLowerCase();
  return !!extension && IMAGE_EXTENSIONS.has(extension);
}

// "Перевірено" once a tutor has actually left feedback; otherwise "Остання
// спроба" for the most recent attempt still awaiting review. Older,
// already-superseded attempts (rare — only reachable mid-resubmit) get no
// badge at all.
function SubmissionBadge({ submission }: { submission: LessonSubmissionOut }) {
  const t = useTranslations("SubmissionThread");

  if (submission.feedback_at) {
    return (
      <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
        {t("reviewedBadge")}
      </span>
    );
  }
  if (submission.is_latest) {
    return (
      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
        {t("latestBadge")}
      </span>
    );
  }
  return null;
}

// Renders one round-trip — the student's upload plus the tutor's check of
// it — as one card labeled by its chronological attempt number ("Спроба
// N"), independent of where SubmissionThread below actually places the
// card (newest first, so attempt 1 ends up at the bottom). Shared by the
// student lesson page and the tutor submission review page — `renderImage`
// is how the tutor page swaps in its editable AnnotatableImageLightbox for
// the student's own uploaded images (defaults to the plain, view-only
// ImageLightbox everyone else gets); past tutor replies (tutor_feedback_
// images) always stay view-only either way, since they're already sent.
function SubmissionEntry({
  submission,
  attemptNumber,
  renderImage,
}: {
  submission: LessonSubmissionOut;
  attemptNumber: number;
  renderImage: (file: string, alt: string) => React.ReactNode;
}) {
  const t = useTranslations("SubmissionThread");

  return (
    <li className="rounded-md border border-gray-200 p-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-gray-900">{t("attemptLabel", { number: attemptNumber })}</span>
        <SubmissionBadge submission={submission} />
      </div>

      <div className="mt-2">
        <time className="text-xs text-gray-400">{new Date(submission.submitted_at).toLocaleString()}</time>
        {submission.comment && <p className="mt-1 whitespace-pre-wrap">{submission.comment}</p>}
        {submission.files.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-start gap-3">
            {submission.files.map((file, index) =>
              isImageFile(file) ? (
                <span key={file}>{renderImage(file, fileNameFromUrl(file))}</span>
              ) : (
                <a
                  key={file}
                  href={file}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-blue-600 underline hover:no-underline"
                >
                  {t("fileLabel")} {index + 1}
                </a>
              ),
            )}
          </div>
        ) : (
          <p className="mt-1 text-gray-500">{t("noFile")}</p>
        )}
      </div>

      {(submission.tutor_feedback || submission.tutor_feedback_images.length > 0) && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium text-blue-700">{t("tutorReplyLabel")}</p>
              {submission.feedback_at && (
                <time className="text-xs text-blue-400">{new Date(submission.feedback_at).toLocaleString()}</time>
              )}
            </div>
            {submission.tutor_feedback_images.length > 0 && (
              <div className="mt-1 flex flex-wrap items-start gap-2">
                {submission.tutor_feedback_images.map((image, index) =>
                  isImageFile(image) ? (
                    <ImageLightbox key={image} src={image} alt={t("tutorReplyLabel")} />
                  ) : (
                    <a
                      key={image}
                      href={image}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block text-blue-600 underline hover:no-underline"
                    >
                      {t("fileLabel")} {index + 1}
                    </a>
                  ),
                )}
              </div>
            )}
            {submission.tutor_feedback && (
              <p className="mt-0.5 whitespace-pre-wrap text-blue-900">{submission.tutor_feedback}</p>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

function defaultRenderImage(file: string, alt: string) {
  return <ImageLightbox src={file} alt={alt} />;
}

// `renderImage` lets the tutor submission review page swap in its editable
// AnnotatableImageLightbox for the student's own uploaded images — omit it
// (as the student lesson page does) to get the plain view-only lightbox.
export function SubmissionThread({
  submissions,
  renderImage = defaultRenderImage,
}: {
  submissions: LessonSubmissionOut[];
  renderImage?: (file: string, alt: string) => React.ReactNode;
}) {
  if (submissions.length === 0) return null;

  // `submissions` arrives oldest-first (see StudentLessonOut.resolve_
  // submissions) — that's what "attempt 1" is numbered from — but the
  // newest attempt is what a student actually cares about seeing first, so
  // the list itself renders newest-first (attempt 1 pushed to the bottom).
  const newestFirst = submissions
    .map((submission, index) => ({ submission, attemptNumber: index + 1 }))
    .reverse();

  return (
    <ul className="flex flex-col gap-3">
      {newestFirst.map(({ submission, attemptNumber }) => (
        <SubmissionEntry
          key={submission.id}
          submission={submission}
          attemptNumber={attemptNumber}
          renderImage={renderImage}
        />
      ))}
    </ul>
  );
}
