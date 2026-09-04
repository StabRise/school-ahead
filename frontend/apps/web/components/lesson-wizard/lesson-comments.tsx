"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  getListLessonCommentsQueryKey,
  useAddLessonComment,
} from "@school-ahead/api-client/browser/student-lessons/student-lessons";
import type { LessonCommentOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { CommentsThread } from "@/components/comments-thread";

// General, freestanding comments only — a help_request question and
// whatever the tutor replied to it are shown on their own "Пояснення"
// (Explanation) tab instead, see explanation-thread.tsx.
export function LessonComments({
  studentLessonId,
  comments,
}: {
  studentLessonId: number;
  comments: LessonCommentOut[] | undefined;
}) {
  const queryClient = useQueryClient();
  const addComment = useAddLessonComment();

  const helpRequestIds = new Set(
    (comments ?? []).filter((comment) => comment.kind === "help_request").map((comment) => comment.id),
  );
  const generalComments = comments?.filter(
    (comment) =>
      comment.kind !== "help_request" &&
      !(comment.reply_to_id != null && helpRequestIds.has(comment.reply_to_id)),
  );

  const handleSubmit = (body: string) => {
    addComment.mutate(
      { studentLessonId, data: { body } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListLessonCommentsQueryKey(studentLessonId) });
        },
      },
    );
  };

  return (
    <CommentsThread
      comments={generalComments}
      onSubmit={handleSubmit}
      isSubmitting={addComment.isPending}
    />
  );
}
