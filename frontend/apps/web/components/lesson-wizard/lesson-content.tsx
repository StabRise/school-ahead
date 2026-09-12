"use client";

import type { LessonAttachmentOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";
import { Markdown } from "@school-ahead/markdown-editor";
import { TranslatableContent } from "@/components/translatable-content";
import { useSynopsisLanguageStore } from "@/stores/synopsis-language-store";

// Renders a Lesson's markdown content (docs/interfaces/student/lesson.md:
// "Content Body (Markdown Format)"), plus any attached materials. Wrapped
// in TranslatableContent (translate-on-select, "add to dictionary"/"add to
// cards") whenever `studentLessonId` is given — omitted by the tutor's own
// preview of this same content (no StudentProfile to own a dictionary
// entry or card). Reuses the same persisted source-language preference the
// синопсис panel's picker controls (stores/synopsis-language-store.ts)
// rather than adding a second, separate language selector here.
export function LessonContent({
  content,
  materials,
  studentLessonId,
}: {
  content: string;
  materials: LessonAttachmentOut[];
  studentLessonId?: number;
}) {
  const sourceLanguage = useSynopsisLanguageStore((state) => state.synopsisLanguage);

  const body = <Markdown content={content} embedYoutube embedPdf />;

  return (
    <div className="flex flex-col gap-4">
      {studentLessonId !== undefined ? (
        <TranslatableContent sourceLanguage={sourceLanguage} studentLessonId={studentLessonId}>
          {body}
        </TranslatableContent>
      ) : (
        body
      )}

      {materials.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-gray-200 pt-3">
          {materials.map((material) => (
            <li key={material.id} className="text-sm">
              <a
                href={material.file ?? material.url}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 underline hover:no-underline"
              >
                {material.title || material.url || material.file}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
