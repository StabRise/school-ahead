"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { LessonCommentOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { ChatIcon } from "@/components/lesson-wizard/chat-icon";

// Persistent comment thread — both the student and any tutor can post at
// any stage of the workflow, and posting never changes StudentLesson
// status. Help-request comments are visually distinguished (unique color +
// question icon) and show a "resolved" marker once the student
// self-resolves. See docs/core/lessons.md, "State Transition & UI Rules"
// sections 2.2-2.3. Shared between the student lesson wizard and the tutor
// submission review screen — only how comments are fetched/posted differs.
function CommentRow({ comment }: { comment: LessonCommentOut }) {
  const t = useTranslations("Comments");
  const isHelpRequest = comment.kind === "help_request";

  return (
    <div
      className={
        isHelpRequest
          ? "flex flex-col gap-1 rounded-md border border-amber-300 bg-amber-50 p-3"
          : "flex flex-col gap-1 rounded-md border border-gray-200 p-3"
      }
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
          {isHelpRequest && <ChatIcon className="size-3.5 text-amber-700" />}
          <span>{comment.author_name}</span>
        </div>
        <time className="text-xs text-gray-400">
          {new Date(comment.created_at).toLocaleString()}
        </time>
      </div>
      <p className="text-sm whitespace-pre-wrap">{comment.body}</p>
      {isHelpRequest && comment.is_resolved && (
        <p className="text-xs font-medium text-green-700">{t("resolvedBadge")}</p>
      )}
    </div>
  );
}

// A reply (e.g. a tutor's answer to a help_request) is nested directly under
// the comment it targets — mirroring how SubmissionThread ties tutor
// feedback to the specific submission it responds to — so it's visually
// unambiguous which question a reply answers even with many comments.
function CommentThreadItem({
  comment,
  repliesByParentId,
}: {
  comment: LessonCommentOut;
  repliesByParentId: Map<number, LessonCommentOut[]>;
}) {
  const t = useTranslations("Comments");
  const replies = repliesByParentId.get(comment.id) ?? [];

  return (
    <div className="flex flex-col gap-2">
      <CommentRow comment={comment} />
      {replies.map((reply) => (
        <div key={reply.id} className="ml-4 border-l-2 border-blue-300 pl-3">
          <p className="mb-1 text-xs font-medium text-blue-700">{t("replyBadge")}</p>
          <CommentRow comment={reply} />
        </div>
      ))}
    </div>
  );
}

export function CommentsThread({
  comments,
  onSubmit,
  isSubmitting,
}: {
  comments: LessonCommentOut[] | undefined;
  onSubmit: (body: string) => void;
  isSubmitting: boolean;
}) {
  const t = useTranslations("Comments");
  const [body, setBody] = useState("");

  const handleSubmit = () => {
    if (!body.trim()) return;
    onSubmit(body);
    setBody("");
  };

  const repliesByParentId = new Map<number, LessonCommentOut[]>();
  const topLevelComments: LessonCommentOut[] = [];
  for (const comment of comments ?? []) {
    if (comment.reply_to_id == null) {
      topLevelComments.push(comment);
      continue;
    }
    const replies = repliesByParentId.get(comment.reply_to_id) ?? [];
    replies.push(comment);
    repliesByParentId.set(comment.reply_to_id, replies);
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-gray-200 p-4">
      <h3 className="text-sm font-semibold">{t("title")}</h3>

      {(!comments || comments.length === 0) && (
        <p className="text-sm text-gray-500">{t("empty")}</p>
      )}

      {comments && comments.length > 0 && (
        <div className="flex flex-col gap-3">
          {topLevelComments.map((comment) => (
            <CommentThreadItem
              key={comment.id}
              comment={comment}
              repliesByParentId={repliesByParentId}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("placeholder")}
          rows={2}
          className="rounded-md border border-gray-300 p-2 text-sm"
        />
        <button
          type="button"
          disabled={isSubmitting || !body.trim()}
          onClick={handleSubmit}
          className="self-start rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {t("sendButton")}
        </button>
      </div>
    </div>
  );
}
