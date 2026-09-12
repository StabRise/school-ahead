"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { StoryBody } from "@school-ahead/preschool-games";
import { StoryRichTextEditor } from "./story-rich-text-editor";

// Edit/preview toggle for Story.content — same convention as
// ../markdown-editor.tsx, but with two authoring aids specific to stories,
// both implemented in StoryRichTextEditor:
//   - a picture dropped from story-asset-sidebar.tsx (or already in the
//     text) renders inline as an actual image with a ✕ to remove it,
//     "рич текстового редактора" style, even though the underlying value
//     stays the plain "{ <url> }" text (see story-rich-text.ts);
//   - selecting a word shows a floating "format as card" button (see
//     story-card-format.ts) that rewrites it into the same consonant+vowel/
//     м'який знак card breakdown the reading minigame itself uses, e.g.
//     "яблуко" -> "{я-б-лу-ко}".
// Preview mode renders through StoryBody, the actual game's body renderer
// (also with a ✕ on each picture), not a plain Markdown preview, so a
// tutor sees exactly what a student will see.
export function StoryMarkdownEditor({
  value,
  onChange,
  previewSlug,
  rows = 14,
}: {
  value: string;
  onChange: (value: string) => void;
  previewSlug: string;
  rows?: number;
}) {
  const t = useTranslations("TutorStories");
  const [showPreview, setShowPreview] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-end">
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
          <StoryBody
            slug={previewSlug}
            markdown={value}
            onRemoveCard={(raw) => onChange(value.replace(`{${raw}}`, ""))}
          />
        </div>
      ) : (
        <StoryRichTextEditor value={value} onChange={onChange} rows={rows} />
      )}
    </div>
  );
}
