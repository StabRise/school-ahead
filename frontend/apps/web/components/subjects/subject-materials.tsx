"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, Trash2 } from "lucide-react";
import {
  getListSubjectMaterialsQueryKey,
  useAddSubjectMaterial,
  useDeleteSubjectMaterial,
  useListSubjectMaterials,
} from "@school-ahead/api-client/browser/academics/academics";
import { FileDropzone } from "@/components/file-dropzone";

// Subject-level PDF materials tab — a plain list of tutor-uploaded PDFs the
// student can view/download via direct link, same idiom as LessonAttachment
// on a lesson's Theory tab (components/lesson-wizard/lesson-content.tsx).
// `canManage` (tutor only) adds a title + single-file upload form (one PDF
// at a time, so its title can be set before it's sent — add another to
// upload several) and a delete button per row; students get a read-only
// list. Shared by both the student's and the tutor's Subject detail pages,
// same as SemesterPlan.
export function SubjectMaterials({ subjectId, canManage = false }: { subjectId: number; canManage?: boolean }) {
  const t = useTranslations("SubjectMaterials");
  const queryClient = useQueryClient();
  const materialsQuery = useListSubjectMaterials(subjectId);
  const addMaterial = useAddSubjectMaterial();
  const deleteMaterial = useDeleteSubjectMaterial();
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const materials = materialsQuery.data ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListSubjectMaterialsQueryKey(subjectId) });
  };

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    addMaterial.mutate(
      { subjectId, data: { title: title.trim() || file.name.replace(/\.pdf$/i, ""), file } },
      {
        onSuccess: () => {
          invalidate();
          setTitle("");
          setFile(null);
        },
      },
    );
  };

  const handleDelete = (materialId: number) => {
    if (!window.confirm(t("deleteConfirm"))) return;
    deleteMaterial.mutate({ materialId }, { onSuccess: invalidate, onError: () => window.alert(t("deleteError")) });
  };

  if (materialsQuery.isLoading) {
    return <p className="text-sm text-gray-500">{t("loading")}</p>;
  }
  if (materialsQuery.isError) {
    return <p className="text-sm text-red-600">{t("error")}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {canManage && (
        <form onSubmit={handleUpload} className="flex flex-col gap-2 rounded-md border border-gray-200 p-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="subject-material-title" className="text-xs font-medium text-gray-700">
              {t("titleLabel")}
            </label>
            <input
              id="subject-material-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("titlePlaceholder")}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
            />
          </div>

          <FileDropzone
            id="subject-material-upload"
            hint={t("uploadHint")}
            multiple={false}
            onFilesSelected={(files) => setFile(files?.[0] ?? null)}
          />
          {file && <p className="text-xs text-gray-500">{file.name}</p>}

          {addMaterial.isError && <p className="text-xs text-red-600">{t("uploadError")}</p>}

          <button
            type="submit"
            disabled={!file || addMaterial.isPending}
            className="self-end rounded-md bg-gray-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {addMaterial.isPending ? t("uploading") : t("uploadButton")}
          </button>
        </form>
      )}

      {materials.length === 0 ? (
        <p className="text-sm text-gray-500">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-gray-100">
          {materials.map((material) => (
            <li key={material.id} className="flex items-center gap-2 py-2">
              <FileText className="size-4 shrink-0 text-gray-400" aria-hidden="true" />
              <a
                href={material.file ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-sm text-blue-600 underline hover:no-underline"
              >
                {material.title || t("untitled")}
              </a>
              {canManage && (
                <button
                  type="button"
                  title={t("deleteButton")}
                  aria-label={t("deleteButton")}
                  onClick={() => handleDelete(material.id)}
                  disabled={deleteMaterial.isPending}
                  className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
