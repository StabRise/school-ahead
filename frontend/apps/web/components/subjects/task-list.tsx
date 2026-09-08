"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, FileText, Image as ImageIcon, type LucideIcon } from "lucide-react";
import {
  getGetSubjectTaskProgressQueryKey,
  getListSubjectTasksQueryKey,
  useCompleteTask,
  useUncompleteTask,
} from "@school-ahead/api-client/browser/tasks/tasks";
import type { TaskOut, TopicOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { Link } from "@/i18n/navigation";

const TASK_KIND_ICON: Record<string, LucideIcon> = {
  markdown: FileText,
  image: ImageIcon,
};

export function groupTasksByTopicId(tasks: TaskOut[]) {
  const map = new Map<number, TaskOut[]>();
  for (const task of tasks) {
    const list = map.get(task.topic_id) ?? [];
    list.push(task);
    map.set(task.topic_id, list);
  }
  return map;
}

// Small circular icon-only toggle, same convention as
// flashcard-terms-list.tsx's "know it" button — lets a student flip a
// task's done state right from the row, without opening its detail page.
function TaskDoneToggleButton({
  task,
  subjectId,
  markDoneLabel,
  markNotDoneLabel,
}: {
  task: TaskOut;
  subjectId: number;
  markDoneLabel: string;
  markNotDoneLabel: string;
}) {
  const queryClient = useQueryClient();
  const completeTask = useCompleteTask();
  const uncompleteTask = useUncompleteTask();
  const mutation = task.is_done ? uncompleteTask : completeTask;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    mutation.mutate(
      { taskId: task.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSubjectTasksQueryKey(subjectId) });
          queryClient.invalidateQueries({ queryKey: getGetSubjectTaskProgressQueryKey(subjectId) });
        },
      },
    );
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={mutation.isPending}
      aria-pressed={task.is_done}
      aria-label={task.is_done ? markNotDoneLabel : markDoneLabel}
      title={task.is_done ? markNotDoneLabel : markDoneLabel}
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50 ${
        task.is_done ? "text-green-600 hover:bg-green-50" : "text-gray-300 hover:bg-gray-100 hover:text-gray-400"
      }`}
    >
      {task.is_done ? <CheckCircle2 className="size-4" /> : <Circle className="size-4" />}
    </button>
  );
}

// One row per Task — same compact icon-row language as
// SimpleSubjectLessonRow/LessonRow. `getHref` (student page) turns the
// title into a Link to the Task detail page; `doneToggle` (student page
// only) renders the icon-only done/not-done toggle; `renderRowActions` is
// where the tutor page plugs in its edit/delete icon buttons.
function TaskRow({
  task,
  getHref,
  doneToggle,
  renderRowActions,
}: {
  task: TaskOut;
  getHref?: (task: TaskOut) => string;
  doneToggle?: { subjectId: number; markDoneLabel: string; markNotDoneLabel: string };
  renderRowActions?: (task: TaskOut) => React.ReactNode;
}) {
  const Icon = TASK_KIND_ICON[task.kind] ?? FileText;
  const href = getHref?.(task);

  const content = (
    <>
      <Icon className="size-3.5 shrink-0 text-gray-400" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-xs text-gray-700">{task.title}</span>
    </>
  );

  return (
    <li className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-gray-50">
      {href ? (
        <Link href={href} className="flex min-w-0 flex-1 items-center gap-2">
          {content}
        </Link>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-2">{content}</span>
      )}
      {doneToggle && (
        <TaskDoneToggleButton
          task={task}
          subjectId={doneToggle.subjectId}
          markDoneLabel={doneToggle.markDoneLabel}
          markNotDoneLabel={doneToggle.markNotDoneLabel}
        />
      )}
      {renderRowActions?.(task)}
    </li>
  );
}

// Topic-grouped Task list — shared between the student's and tutor's
// Subject detail pages' Tasks tab, same as SimpleTopicSection/TopicSection
// share their grouping/empty-state shape while keeping role-specific
// behavior (navigation+completion vs edit/delete) out of this component.
export function TaskListSection({
  topic,
  tasks,
  emptyLabel,
  getHref,
  doneToggle,
  renderRowActions,
}: {
  topic: TopicOut;
  tasks: TaskOut[];
  emptyLabel: string;
  getHref?: (task: TaskOut) => string;
  doneToggle?: { subjectId: number; markDoneLabel: string; markNotDoneLabel: string };
  renderRowActions?: (task: TaskOut) => React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="px-1.5 text-xs font-medium text-gray-500">{topic.title}</div>
      {tasks.length === 0 ? (
        <p className="px-4 text-xs text-gray-400">{emptyLabel}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-gray-50 pl-3">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              getHref={getHref}
              doneToggle={doneToggle}
              renderRowActions={renderRowActions}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
