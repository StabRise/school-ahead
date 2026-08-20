"use client";

import { useTranslations } from "next-intl";
import type { LessonSubmissionOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { ImageLightbox } from "@/components/image-lightbox";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"]);

function isImageFile(url: string): boolean {
  const path = url.split(/[?#]/)[0];
  const extension = path.split(".").pop()?.toLowerCase();
  return !!extension && IMAGE_EXTENSIONS.has(extension);
}

// Renders a StudentLesson's practical-work submissions in chronological
// order, each immediately followed by the tutor's reply to *that*
// submission (if any) — indented and visually tied to it, so a resubmit
// round never reads as an answer to the wrong attempt. Shared by the
// student lesson wizard and the tutor submission review screen.
function SubmissionEntry({ submission }: { submission: LessonSubmissionOut }) {
  const t = useTranslations("SubmissionThread");

  return (
    <li className="rounded-md border border-gray-200 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <time className="text-xs text-gray-400">
          {new Date(submission.submitted_at).toLocaleString()}
        </time>
        {submission.is_latest && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
            {t("latestBadge")}
          </span>
        )}
      </div>

      {submission.comment && <p className="mt-1 whitespace-pre-wrap">{submission.comment}</p>}
      {submission.file ? (
        isImageFile(submission.file) ? (
          <ImageLightbox src={submission.file} alt={t("fileLabel")} />
        ) : (
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

      {submission.tutor_feedback && (
        <div className="mt-3 ml-4 border-l-2 border-blue-300 pl-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-blue-700">{t("tutorReplyLabel")}</p>
            {submission.feedback_at && (
              <time className="text-xs text-gray-400">
                {new Date(submission.feedback_at).toLocaleString()}
              </time>
            )}
          </div>
          <p className="mt-1 whitespace-pre-wrap">{submission.tutor_feedback}</p>
        </div>
      )}
    </li>
  );
}

export function SubmissionThread({ submissions }: { submissions: LessonSubmissionOut[] }) {
  if (submissions.length === 0) return null;

  return (
    <ul className="flex flex-col gap-2">
      {submissions.map((submission) => (
        <SubmissionEntry key={submission.id} submission={submission} />
      ))}
    </ul>
  );
}
