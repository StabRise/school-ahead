"use client";

import { useTranslations } from "next-intl";
import { CheckCircle2, Clock, MessageCircleQuestion, User } from "lucide-react";
import type { LessonCommentOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { ResolveNeedHelpButton } from "./resolve-need-help-button";

// The "Пояснення" (Explanation) tab — only rendered once a help_request has
// ever been raised on this lesson (see lesson-wizard.tsx's `hasExplanation`).
// Unlike the general Comments tab, this shows only the question/answer pairs
// that came out of the "Потрібна допомога" flow: each help_request comment
// plus whatever reply the tutor threaded onto it (backend/lessons/services.py,
// resolve_need_help / resolve_own_help_request).
//
// `canSelfResolve` mirrors the same status gate as AssessmentStep's
// "need_help" branch — resolve_own_help_request requires StudentLesson to
// actually be in NeedHelp, so the button only appears on the still-pending
// question while that's true (there's at most one open question at a time).
export function ExplanationThread({
  comments,
  studentLessonId,
  canSelfResolve,
  onResolved,
}: {
  comments: LessonCommentOut[];
  studentLessonId: number;
  canSelfResolve: boolean;
  onResolved: () => void;
}) {
  const t = useTranslations("Explanation");

  const questions = comments
    .filter((comment) => comment.kind === "help_request")
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const repliesByQuestionId = new Map<number, LessonCommentOut[]>();
  for (const comment of comments) {
    if (comment.reply_to_id == null) continue;
    const replies = repliesByQuestionId.get(comment.reply_to_id) ?? [];
    replies.push(comment);
    repliesByQuestionId.set(comment.reply_to_id, replies);
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-gray-200 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <MessageCircleQuestion className="size-4 text-gray-500" />
        {t("title")}
      </h3>

      {questions.length === 0 && <p className="text-sm text-gray-500">{t("empty")}</p>}

      <div className="flex flex-col gap-4">
        {questions.map((question) => {
          const replies = repliesByQuestionId.get(question.id) ?? [];
          return (
            <div key={question.id} className="flex flex-col gap-2 rounded-md border border-gray-200 p-3">
              <div className="flex items-center justify-between gap-2">
                {question.is_resolved ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                    <CheckCircle2 className="size-3.5" />
                    {t("resolvedStatus")}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                    <Clock className="size-3.5" />
                    {t("pendingStatus")}
                  </span>
                )}
                <time className="text-xs text-gray-400">
                  {new Date(question.created_at).toLocaleString()}
                </time>
              </div>

              <p className="text-sm">
                <span className="font-semibold">{t("studentLabel")}: </span>
                {question.body}
              </p>

              {replies.map((reply) => (
                <div key={reply.id} className="flex items-start gap-2 rounded-md bg-gray-50 p-2">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                    <User className="size-3.5" />
                  </span>
                  <p className="text-sm whitespace-pre-wrap">{reply.body}</p>
                </div>
              ))}

              {/* Not yet resolved and never replied to — the only state a
                  student can self-resolve out of (see `canSelfResolve`). A
                  question the student resolved themselves without a tutor
                  reply just shows the "Вирішено" badge above with nothing
                  more here. */}
              {replies.length === 0 && !question.is_resolved && (
                <div className="flex flex-col items-start gap-2 rounded-md border border-dashed border-gray-300 bg-gray-50 px-3 py-2">
                  <p className="text-sm text-gray-400">{t("pendingReplyPlaceholder")}</p>
                  {canSelfResolve && (
                    <ResolveNeedHelpButton studentLessonId={studentLessonId} onResolved={onResolved} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
