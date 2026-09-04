import type { MaterialBlockOut } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";

// Shared "reading block" shape used by every read-along-style viewer —
// components/read-along-page.tsx (paste text or a link), and the lesson
// wizard's "Матеріали" tab (components/lesson-wizard/materials-step.tsx),
// which loads a StudentLessonMaterial's saved content in this exact shape
// (see backend/lessons/schemas.py's MaterialBlockOut).

export type ReadingBlock =
  | { kind: "heading"; sentences: string[] }
  | { kind: "paragraph"; sentences: string[] }
  | { kind: "image"; src: string; alt: string };

export function flatSentencesOf(blocks: ReadingBlock[]): string[] {
  return blocks.flatMap((block) => (block.kind === "image" ? [] : block.sentences));
}

// One entry per non-image block (heading or paragraph), giving the [start,
// end) range it occupies in flatSentencesOf(blocks)'s global sentence
// indexing — what the bottom control panel's "previous/next paragraph" and
// "from start" buttons jump between.
export function paragraphRangesOf(blocks: ReadingBlock[]): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  let index = 0;
  for (const block of blocks) {
    if (block.kind === "image") continue;
    const start = index;
    index += block.sentences.length;
    ranges.push({ start, end: index });
  }
  return ranges;
}

// A StudentLessonMaterial's saved content (MaterialBlockOut — one flat
// schema covering all three block kinds, since Ninja/Pydantic has no clean
// way to express a TS-style discriminated union) back into the
// discriminated ReadingBlock union the read-along components render/play.
export function readingBlocksFromMaterialBlocks(blocks: MaterialBlockOut[]): ReadingBlock[] {
  return blocks.map((block): ReadingBlock =>
    block.kind === "image"
      ? { kind: "image", src: block.src ?? "", alt: block.alt ?? "" }
      : { kind: block.kind === "heading" ? "heading" : "paragraph", sentences: block.sentences ?? [] },
  );
}
