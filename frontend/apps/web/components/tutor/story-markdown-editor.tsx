"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { StoryBody } from "@school-ahead/preschool-games";

// Same edit/preview-toggle textarea convention as components/markdown-editor.tsx,
// plus an "insert image" button (uploads immediately on file selection via
// `onUploadImage`, then splices the returned absolute URL into the textarea
// at the cursor as `{ <url> }` — the same card syntax static stories embed a
// local filename with, see frontend's lib/story-parser.ts). Preview mode
// renders through StoryBody, the actual game's body renderer, not a plain
// Markdown preview, so a tutor sees exactly what a student will see.
export function StoryMarkdownEditor({
  value,
  onChange,
  previewSlug,
  onUploadImage,
  rows = 14,
}: {
  value: string;
  onChange: (value: string) => void;
  previewSlug: string;
  onUploadImage: (file: File) => Promise<string>;
  rows?: number;
}) {
  const t = useTranslations("TutorStories");
  const [showPreview, setShowPreview] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageFileRef = useRef<HTMLInputElement>(null);

  const insertAtCursor = (text: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      onChange(`${value}\n${text}`);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    onChange(`${value.slice(0, start)}${text}${value.slice(end)}`);
    // Restore focus/cursor after React re-renders the textarea's value.
    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + text.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  const handleImageSelected = async () => {
    const file = imageFileRef.current?.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const url = await onUploadImage(file);
      insertAtCursor(`{ ${url} }`);
    } finally {
      setIsUploading(false);
      if (imageFileRef.current) imageFileRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <input
            ref={imageFileRef}
            type="file"
            accept="image/*"
            onChange={handleImageSelected}
            disabled={isUploading}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => imageFileRef.current?.click()}
            disabled={isUploading}
            className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            {isUploading ? t("uploadingImage") : t("insertImage")}
          </button>
        </div>
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
          <StoryBody slug={previewSlug} markdown={value} />
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm text-gray-900"
        />
      )}
    </div>
  );
}
