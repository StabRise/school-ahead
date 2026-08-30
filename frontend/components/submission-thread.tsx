"use client";

import { useTranslations } from "next-intl";
import { Info } from "lucide-react";
import type { LessonSubmissionOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { ImageLightbox } from "@/components/image-lightbox";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"]);

function isImageFile(url: string): boolean {
  const path = url.split(/[?#]/)[0];
  const extension = path.split(".").pop()?.toLowerCase();
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

// Renders a StudentLesson's practical-work submissions in chronological
// order, each immediately followed by the tutor's reply to *that*
// submission (if any) — visually tied to it in its own highlighted box, so
// a resubmit round never reads as an answer to the wrong attempt. Shared by
// the student lesson wizard and the tutor submission review screen.
function SubmissionEntry({ submission }: { submission: LessonSubmissionOut }) {
  const t = useTranslations("SubmissionThread");

  return (
    <li className="rounded-md border border-gray-200 p-4 text-sm">
      <div className="flex items-center justify-end">
        <SubmissionBadge submission={submission} />
      </div>

      <div className="mt-2 flex items-start gap-3">
        {submission.file && isImageFile(submission.file) && (
          <div className="shrink-0">
            <ImageLightbox src={submission.file} alt={t("fileLabel")} />
          </div>
        )}
        <div className="flex-1">
          <time className="text-xs text-gray-400">{new Date(submission.submitted_at).toLocaleString()}</time>
          {submission.comment && <p className="mt-1 whitespace-pre-wrap">{submission.comment}</p>}
          {submission.file ? (
            !isImageFile(submission.file) && (
              <a
                href={submission.file}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-blue-600 underline hover:no-underline"
              >
                {t("fileLabel")}
              </a>
            )
          ) : (
            <p className="mt-1 text-gray-500">{t("noFile")}</p>
          )}
        </div>
      </div>

      {submission.tutor_feedback && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium text-blue-700">{t("tutorReplyLabel")}</p>
              {submission.feedback_at && (
                <time className="text-xs text-blue-400">{new Date(submission.feedback_at).toLocaleString()}</time>
              )}
            </div>
            <p className="mt-0.5 whitespace-pre-wrap text-blue-900">{submission.tutor_feedback}</p>
          </div>
        </div>
      )}
    </li>
  );
}

export function SubmissionThread({ submissions }: { submissions: LessonSubmissionOut[] }) {
  if (submissions.length === 0) return null;

  return (
    <ul className="flex flex-col gap-3">
      {submissions.map((submission) => (
        <SubmissionEntry key={submission.id} submission={submission} />
      ))}
    </ul>
  );
}
