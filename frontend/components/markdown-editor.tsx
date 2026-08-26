"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@/components/markdown";

// Raw-markdown textarea with a toggle to preview it rendered through the
// same <Markdown> component students/tutors see elsewhere — no separate
// WYSIWYG editor, since every Lesson field this edits is already
// tutor-authored plain markdown.
export function MarkdownEditor({
  value,
  onChange,
  rows = 10,
}: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  const t = useTranslations("MarkdownEditor");
  const [showPreview, setShowPreview] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowPreview((prev) => !prev)}
          className="text-xs font-medium text-blue-700 hover:underline"
        >
          {showPreview ? t("editButton") : t("previewButton")}
        </button>
      </div>
      {showPreview ? (
        <div className="min-h-32 rounded-md border border-gray-200 bg-gray-50 p-3">
          <Markdown content={value} embedYoutube embedPdf />
        </div>
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm text-gray-900"
        />
      )}
    </div>
  );
}
