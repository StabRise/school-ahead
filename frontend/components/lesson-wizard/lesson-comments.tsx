"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  getListLessonCommentsQueryKey,
  useAddLessonComment,
  useListLessonComments,
} from "@/lib/api/browser/student-lessons/student-lessons";
import { CommentsThread } from "@/components/comments-thread";

export function LessonComments({ studentLessonId }: { studentLessonId: number }) {
  const queryClient = useQueryClient();
  const { data: comments } = useListLessonComments(studentLessonId);
  const addComment = useAddLessonComment();

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
    <CommentsThread comments={comments} onSubmit={handleSubmit} isSubmitting={addComment.isPending} />
  );
}
