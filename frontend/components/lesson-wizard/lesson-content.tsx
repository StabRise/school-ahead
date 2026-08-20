import type { LessonAttachmentOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { Markdown } from "@/components/markdown";

// Renders a Lesson's markdown content (docs/interfaces/student/lesson.md:
// "Content Body (Markdown Format)"), plus any attached materials.
export function LessonContent({
  content,
  materials,
}: {
  content: string;
  materials: LessonAttachmentOut[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <Markdown content={content} embedYoutube />

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
