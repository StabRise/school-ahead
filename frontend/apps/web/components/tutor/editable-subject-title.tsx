"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Check, Loader2, Pencil, X } from "lucide-react";
import { getGetSubjectQueryKey } from "@school-ahead/api-client/browser/academics/academics";
import {
  getGetTutorClassQueryKey,
  getTutoringApiListAssignmentsQueryKey,
  useUpdateTutorSubject,
  useUploadTutorSubjectIcon,
} from "@school-ahead/api-client/browser/tutor/tutor";
import type { SubjectOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { SubjectIcon } from "@/components/subjects/subject-icon";
import { useDialogs } from "@/components/dialogs/app-dialogs";

// The Subject detail page's title: the subject's icon on the left (click it
// to pick a new image) and its name, editable in place (pencil -> input,
// Enter/check saves, Esc/X cancels). Both go through tutor-scoped endpoints
// (tutoring.api.update_tutor_subject / upload_tutor_subject_icon) — the
// academics PATCH is staff-only.
export function EditableSubjectTitle({ subject }: { subject: SubjectOut }) {
  const t = useTranslations("TutorSubjectDetail");
  const dialogs = useDialogs();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(subject.name);

  const updateSubject = useUpdateTutorSubject();
  const uploadIcon = useUploadTutorSubjectIcon();

  // The class page and the tutor's subjects list show this subject's name
  // and icon too, so refresh them along with the subject itself.
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetSubjectQueryKey(subject.id) });
    queryClient.invalidateQueries({ queryKey: getGetTutorClassQueryKey(subject.school_class_id) });
    queryClient.invalidateQueries({ queryKey: getTutoringApiListAssignmentsQueryKey() });
  };

  const startEditing = () => {
    setDraft(subject.name);
    setEditing(true);
  };

  const save = () => {
    const name = draft.trim();
    if (!name) return;
    if (name === subject.name) {
      setEditing(false);
      return;
    }
    updateSubject.mutate(
      { subjectId: subject.id, data: { name } },
      {
        onSuccess: () => {
          invalidate();
          setEditing(false);
        },
        onError: () => dialogs.error(t("subjectNameError")),
      },
    );
  };

  const handleIconPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so picking the same file again still fires onChange.
    e.target.value = "";
    if (!file) return;
    uploadIcon.mutate(
      { subjectId: subject.id, data: { file } },
      { onSuccess: invalidate, onError: () => dialogs.error(t("subjectIconError")) },
    );
  };

  return (
    <div className="flex min-w-0 items-center gap-3">
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploadIcon.isPending}
        title={t("changeSubjectIconButton")}
        aria-label={t("changeSubjectIconButton")}
        className="group relative shrink-0 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        <SubjectIcon id={subject.id} name={subject.name} iconUrl={subject.icon} />
        <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <Camera className="size-4" aria-hidden="true" />
        </span>
        {uploadIcon.isPending && (
          <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/45 text-white">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          </span>
        )}
      </button>
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleIconPicked} className="hidden" />

      {editing ? (
        <div className="flex min-w-0 items-center gap-1">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setEditing(false);
            }}
            aria-label={t("subjectNameLabel")}
            className="min-w-0 rounded-md border border-gray-300 px-2 py-1 text-xl font-semibold text-gray-900"
          />
          <button
            type="button"
            onClick={save}
            disabled={!draft.trim() || updateSubject.isPending}
            title={t("saveSubjectNameButton")}
            aria-label={t("saveSubjectNameButton")}
            className="shrink-0 rounded-md border border-gray-300 p-1.5 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Check className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            title={t("cancelSubjectNameButton")}
            aria-label={t("cancelSubjectNameButton")}
            className="shrink-0 rounded-md border border-gray-300 p-1.5 text-gray-700 hover:bg-gray-50"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div className="flex min-w-0 items-center gap-1">
          <h1 className="truncate text-xl font-semibold text-gray-900">{subject.name}</h1>
          <button
            type="button"
            onClick={startEditing}
            title={t("editSubjectNameButton")}
            aria-label={t("editSubjectNameButton")}
            className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <Pencil className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
