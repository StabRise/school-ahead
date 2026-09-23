"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  getListSubjectNotesQueryKey,
  useCreateSubjectNote,
  useDeleteSubjectNote,
  useListSubjectNotes,
  useUpdateSubjectNote,
} from "@school-ahead/api-client/browser/academics/academics";
import type { SubjectNoteOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { Markdown, MarkdownEditor } from "@school-ahead/markdown-editor";
import { useDialogs } from "@/components/dialogs/app-dialogs";

// Today as YYYY-MM-DD in the student's own timezone (not UTC's), for the
// date input's default.
function toLocalIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

// The date + Markdown form shared by "new note" and editing an existing one.
function NoteForm({
  initial,
  pending,
  onSave,
  onCancel,
}: {
  initial: { date: string; content: string };
  pending: boolean;
  onSave: (value: { date: string; content: string }) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("SubjectNotes");
  const [date, setDate] = useState(initial.date);
  const [content, setContent] = useState(initial.content);

  return (
    <div className="flex flex-col gap-3 rounded-md border border-gray-200 p-3">
      <label className="flex items-center gap-2 text-sm text-gray-700">
        {t("dateLabel")}
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-gray-500 focus:outline-none"
        />
      </label>
      <MarkdownEditor value={content} onChange={setContent} rows={8} />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          {t("cancelButton")}
        </button>
        <button
          type="button"
          onClick={() => onSave({ date, content })}
          disabled={pending || !content.trim() || !date}
          className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {t("saveButton")}
        </button>
      </div>
    </div>
  );
}

function NoteItem({ subjectId, note }: { subjectId: number; note: SubjectNoteOut }) {
  const t = useTranslations("SubjectNotes");
  const format = useFormatter();
  const dialogs = useDialogs();
  const queryClient = useQueryClient();
  const updateNote = useUpdateSubjectNote();
  const deleteNote = useDeleteSubjectNote();
  const [editing, setEditing] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: getListSubjectNotesQueryKey(subjectId) });

  if (editing) {
    return (
      <li>
        <NoteForm
          initial={{ date: note.date, content: note.content }}
          pending={updateNote.isPending}
          onCancel={() => setEditing(false)}
          onSave={(value) =>
            updateNote.mutate(
              { noteId: note.id, data: value },
              {
                onSuccess: () => {
                  setEditing(false);
                  void refresh();
                },
                onError: () => dialogs.error(t("saveError")),
              },
            )
          }
        />
      </li>
    );
  }

  const handleDelete = async () => {
    if (!(await dialogs.confirm({ message: t("confirmDelete"), tone: "danger" }))) return;
    deleteNote.mutate(
      { noteId: note.id },
      { onSuccess: () => void refresh(), onError: () => dialogs.error(t("deleteError")) },
    );
  };

  return (
    <li className="flex flex-col gap-2 rounded-md border border-gray-200 p-3">
      <div className="flex items-center justify-between gap-2">
        {/* Noon, so the day doesn't shift in a timezone west of UTC. */}
        <span className="text-xs font-medium text-gray-500">
          {format.dateTime(new Date(`${note.date}T12:00:00`), { dateStyle: "long" })}
        </span>
        <span className="flex gap-1">
          <button
            type="button"
            title={t("editButton")}
            aria-label={t("editButton")}
            onClick={() => setEditing(true)}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title={t("deleteButton")}
            aria-label={t("deleteButton")}
            onClick={handleDelete}
            disabled={deleteNote.isPending}
            className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </span>
      </div>
      <Markdown content={note.content} />
    </li>
  );
}

// The subject page's "Нотатки" tab — the student's own Markdown notes on this
// subject (backend academics.SubjectNote), newest date first. Private: only
// the student who wrote a note ever sees it.
export function SubjectNotesTab({ subjectId }: { subjectId: number }) {
  const t = useTranslations("SubjectNotes");
  const dialogs = useDialogs();
  const queryClient = useQueryClient();
  const { data: notes, isLoading, isError } = useListSubjectNotes(subjectId);
  const createNote = useCreateSubjectNote();
  const [adding, setAdding] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {adding ? (
        <NoteForm
          initial={{ date: toLocalIsoDate(new Date()), content: "" }}
          pending={createNote.isPending}
          onCancel={() => setAdding(false)}
          onSave={(value) =>
            createNote.mutate(
              { subjectId, data: value },
              {
                onSuccess: () => {
                  setAdding(false);
                  void queryClient.invalidateQueries({ queryKey: getListSubjectNotesQueryKey(subjectId) });
                },
                onError: () => dialogs.error(t("saveError")),
              },
            )
          }
        />
      ) : (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("addButton")}
          </button>
        </div>
      )}

      {isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
      {isError && <p className="text-sm text-red-600">{t("error")}</p>}
      {notes && notes.length === 0 && !adding && <p className="text-sm text-gray-500">{t("empty")}</p>}
      {notes && notes.length > 0 && (
        <ul className="flex flex-col gap-3">
          {notes.map((note) => (
            <NoteItem key={note.id} subjectId={subjectId} note={note} />
          ))}
        </ul>
      )}
    </div>
  );
}
