"use client";

import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListLessonCommentsQueryKey,
  useResolveOwnNeedHelp,
} from "@school-ahead/api-client/browser/student-lessons/student-lessons";

// Self-service resolution: the student toggles this once they no longer
// need help, reverting NeedHelp -> InProgress and marking the originating
// help-request comment resolved server-side. See the "State Transition &
// UI Rules" spec, section 2.3 ("Resolution Workflow").
export function ResolveNeedHelpButton({
  studentLessonId,
  onResolved,
}: {
  studentLessonId: number;
  onResolved: () => void;
}) {
  const t = useTranslations("NeedHelp");
  const queryClient = useQueryClient();
  const resolveNeedHelp = useResolveOwnNeedHelp();

  return (
    <button
      type="button"
      disabled={resolveNeedHelp.isPending}
      onClick={() =>
        resolveNeedHelp.mutate(
          { studentLessonId },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({
                queryKey: getListLessonCommentsQueryKey(studentLessonId),
              });
              onResolved();
            },
          },
        )
      }
      className="self-start rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
    >
      {resolveNeedHelp.isPending ? t("resolvePending") : t("resolveButton")}
    </button>
  );
}
