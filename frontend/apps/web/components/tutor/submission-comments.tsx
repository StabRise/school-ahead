"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  getListTutorLessonCommentsQueryKey,
  useAddTutorLessonComment,
  useListTutorLessonComments,
} from "@school-ahead/api-client/browser/tutor/tutor";
import { CommentsThread } from "@/components/comments-thread";

export function SubmissionComments({ studentLessonId }: { studentLessonId: number }) {
  const queryClient = useQueryClient();
  const { data: comments } = useListTutorLessonComments(studentLessonId);
  const addComment = useAddTutorLessonComment();

  const handleSubmit = (body: string) => {
    addComment.mutate(
      { studentLessonId, data: { body } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getListTutorLessonCommentsQueryKey(studentLessonId),
          });
        },
      },
    );
  };

  return (
    <CommentsThread comments={comments} onSubmit={handleSubmit} isSubmitting={addComment.isPending} />
  );
}
