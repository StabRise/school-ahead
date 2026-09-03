"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { speakSequence } from "@/lib/piper-tts";
import {
  useStories,
  useStory,
  type LoadedStory,
  type StoryWordSegment,
  type StorySummary,
} from "@/lib/story";
import { useStoriesGameStore } from "@/stores/stories-game-store";

// Preschool "Казки" (Stories) reading minigame — see docs/preschool/games/
// reading/Stories.md for the design brief. Two screens:
//   - a picker (StoryPicker) listing every .md file under
//     public/static/stories (see lib/story.ts's useStories);
//   - the story itself (StoryPage), a "page" of prose with two ways a card
//     can be called out inline (see lib/story-parser.ts), both purely
//     visual — tapping either just opens it bigger, no read-aloud:
//     - "{К - ВІ - Т - КА}" renders as a bordered row of cards, one per
//       "-"-separated segment (WordCardRow/WordSegmentCard below). Each
//       segment is its own card: a known two-letter syllable shows that
//       exact flashcard image from public/static/letters/<consonant>/
//       <syllable>.png (vowel red, consonant blue, same as everywhere
//       else that folder is used), a bare letter like "К" shows as plain
//       colored text, and a segment itself written as "[Image #N]" pins a
//       specific photographed card to that slot instead (see Story.images);
//     - "[Image #25]" *outside* a {...} group is one standalone
//       photographed card sheet (StoryImagePart) from public/static/stories/
//       <slug>/<25>.<ext>.
//   Tapping a {...} row or a standalone image opens the same picture(s)
//   full-screen (FullscreenWordCards / FullscreenStoryImage).

const UK_VOWELS = new Set(["А", "О", "У", "Е", "И", "І", "Я", "Ю", "Є", "Ї"]);

function isVowelUk(letter: string): boolean {
  return UK_VOWELS.has(letter.toLocaleUpperCase("uk"));
}

// One card inside a {...} word breakdown, at either its small inline size
// (within running text) or its big full-screen size (FullscreenWordCards) —
// same rendering rules either way, just bigger. A "text" segment that
// happens to be a known two-letter consonant+vowel syllable shows that
// exact flashcard image from the "Картки" game's asset folder instead of
// plain text — no need to ask the server which folders are "ready" (see
// /api/cards-game-modes) first, since a missing/not-yet-labeled file just
// 404s and onError falls back to colored letters. An "image" segment
// (written as "[Image #N]" in the source) always shows that specific photo
// instead, falling back to a "?" placeholder if it hasn't been uploaded yet.
function WordSegmentCard({
  segment,
  images,
  size,
}: {
  segment: StoryWordSegment;
  images: Record<number, string>;
  size: "sm" | "lg";
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const boxClass = size === "lg" ? "h-16 w-16 sm:h-24 sm:w-24" : "h-11 w-11";
  const cardClass = `${boxClass} shrink-0 rounded-lg border-2 border-gray-400 bg-white object-cover`;

  if (segment.kind === "image") {
    const url = images[segment.number] ?? null;
    if (!url) {
      return (
        <span aria-hidden="true" className={`flex ${boxClass} shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-gray-400`}>
          ?
        </span>
      );
    }
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" draggable={false} className={cardClass} />;
  }

  const lower = segment.text.toLocaleLowerCase("uk");
  const canBeCardImage = lower.length === 2 && !imageFailed;

  if (canBeCardImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/static/letters/${encodeURIComponent(lower[0])}/${encodeURIComponent(lower)}.png`}
        alt={segment.text.toLocaleUpperCase("uk")}
        draggable={false}
        className={cardClass}
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <span
      className={`flex ${boxClass} shrink-0 items-center justify-center rounded-lg border-2 border-gray-400 bg-white font-extrabold ${
        size === "lg" ? "text-3xl sm:text-4xl" : "text-xl"
      }`}
    >
      {[...segment.text.toLocaleUpperCase("uk")].map((letter, index) => (
        <span key={index} style={{ color: isVowelUk(letter) ? "#dc2626" : "#0369a1" }}>
          {letter}
        </span>
      ))}
    </span>
  );
}

// The bordered "sheet" containing every card of one {...} word breakdown,
// in a single row — the same photograph-a-hand-drawn-sheet look as
// public/static/letters (docs/preschool/games/reading/Stories.md §3), just
// composed live from individual cards instead of being one photo itself.
function WordCardRow({
  segments,
  images,
  size,
}: {
  segments: StoryWordSegment[];
  images: Record<number, string>;
  size: "sm" | "lg";
}) {
  return (
    <span
      className={`inline-flex items-center border-gray-700 bg-white shadow ${
        size === "lg" ? "gap-2 rounded-xl border-4 p-2" : "gap-1 rounded-xl border-2 p-1"
      }`}
    >
      {segments.map((segment, index) => (
        <WordSegmentCard key={index} segment={segment} images={images} size={size} />
      ))}
    </span>
  );
}

// A "[Image #N]" reference (see lib/story-parser.ts) — a photographed
// hand-drawn card sheet for one word, same idea as public/static/letters'
// sheets (see backend's slice_flashcard_grid) but shown as one whole photo
// instead of sliced into per-syllable files (docs/preschool/games/reading/
// Stories.md §3). `url` is null when the referenced number hasn't had an
// image uploaded to public/static/stories/<slug>/<N>.<ext> yet.
function StoryImagePart({ url, onOpen }: { url: string | null; onOpen: () => void }) {
  if (!url) {
    return (
      <span
        aria-hidden="true"
        className="mx-0.5 inline-flex h-14 w-14 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 align-middle text-xs text-gray-400"
      >
        ?
      </span>
    );
  }
  return (
    <button type="button" onClick={onOpen} className="mx-0.5 inline-block cursor-pointer align-middle">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        draggable={false}
        className="h-14 max-w-[12rem] rounded-lg object-contain shadow ring-2 ring-white"
      />
    </button>
  );
}

// Shared full-screen chrome for both fullscreen variants below — a dark
// scrim that closes on tap anywhere (including the content itself, since
// nothing inside stops propagation), the ✕ button, Escape, or Space (a
// document-level listener rather than an onKeyDown on the div below, since
// nothing here auto-focuses that div on open — a keydown handler tied to
// its own focus would otherwise never fire from a plain mouse/tap click).
function FullscreenOverlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const t = useTranslations("StoriesGame");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" && e.key !== " ") return;
      e.preventDefault(); // Space would otherwise also scroll the page behind the overlay
      onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClose}
      className="fixed inset-0 z-50 flex cursor-pointer items-center justify-center bg-black/80 p-6"
    >
      {children}
      <button
        type="button"
        onClick={onClose}
        aria-label={t("closeImageLabel")}
        className="absolute right-4 top-4 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-white text-xl shadow-lg"
      >
        ✕
      </button>
    </div>
  );
}

function StoryPicker({ stories, onSelect }: { stories: StorySummary[]; onSelect: (slug: string) => void }) {
  const t = useTranslations("StoriesGame");
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="flex flex-col items-center gap-1">
        <p className="text-2xl font-bold text-gray-700">{t("pickerTitle")}</p>
        <p className="text-sm text-gray-500">{t("pickerSubtitle")}</p>
      </div>
      {stories.length === 0 ? (
        <p className="text-gray-500">{t("noStories")}</p>
      ) : (
        <div className="flex flex-wrap justify-center gap-4">
          {stories.map((story) => (
            <button
              key={story.slug}
              type="button"
              onClick={() => onSelect(story.slug)}
              className="flex w-56 cursor-pointer flex-col items-center gap-2 rounded-3xl bg-white p-6 text-center shadow-lg ring-2 ring-gray-200 transition hover:scale-[1.03]"
            >
              <span className="text-lg font-bold text-gray-700">{story.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// What's currently shown full-screen — either one standalone photo or one
// {...} word's whole card row.
type FullscreenContent = { kind: "image"; url: string } | { kind: "word"; segments: StoryWordSegment[] };

function StoryPage({ story, muted, onBack }: { story: LoadedStory; muted: boolean; onBack: () => void }) {
  const t = useTranslations("StoriesGame");
  const [fullscreen, setFullscreen] = useState<FullscreenContent | null>(null);
  // Bumped on every playPage call (and on unmount) so a stale in-flight
  // read-aloud can't keep going after a newer one (or a story switch) has
  // superseded it — same cancellation pattern as reading-game.tsx's
  // ReadingLevel prefetch effect, just via a ref instead of a boolean
  // closure since playPage recurses across an arbitrary number of parts.
  const tokenRef = useRef(0);

  useEffect(() => {
    const token = tokenRef;
    return () => {
      token.current++;
    };
  }, []);

  // "🔊 Прочитати" reads only the plain prose (docs/preschool/games/
  // reading/Stories.md §5) — {...} word breakdowns and [Image #N] cards are
  // purely visual (tapping one just opens it bigger, see FullscreenContent
  // above), so there's no text to read aloud for either.
  const playPage = async (): Promise<void> => {
    if (muted) return;
    const token = ++tokenRef.current;
    for (const paragraph of story.paragraphs) {
      for (const part of paragraph.parts) {
        if (token !== tokenRef.current) return;
        if (part.kind === "text" && part.text.trim()) await speakSequence([part.text], "uk", undefined, "sentence");
      }
    }
  };

  return (
    <div className="relative flex flex-1 flex-col overflow-y-auto rounded-3xl bg-[#fffdf7] p-4 shadow-inner ring-4 ring-inset ring-white/90 sm:p-8">
      <div className="mb-4 flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label={t("backButton")}
          onClick={onBack}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white text-lg shadow-lg ring-2 ring-gray-200"
        >
          ◀
        </button>
        {!muted && (
          <button
            type="button"
            onClick={() => void playPage()}
            className="flex cursor-pointer items-center gap-2 rounded-full bg-sky-500 px-4 py-2 text-sm font-bold text-white shadow-lg"
          >
            🔊 {t("readPageButton")}
          </button>
        )}
      </div>

      <div className="mb-6 text-center">
        {story.subtitle && <p className="text-sm italic text-gray-400">{story.subtitle}</p>}
        <h2 className="text-3xl font-extrabold text-gray-800">{story.title}</h2>
      </div>

      <div className="mx-auto flex max-w-2xl flex-col gap-4 text-xl leading-loose text-gray-700">
        {story.paragraphs.map((paragraph, paragraphIndex) => (
          // whitespace-pre-line preserves a single "\n" inside one
          // paragraph as an actual line break (e.g. Колобок.md's song
          // verses, several short lines with no blank line between them —
          // parseStoryParagraph keeps them as one paragraph's text) while
          // still collapsing runs of plain spaces normally.
          <p key={paragraphIndex} className="whitespace-pre-line">
            {paragraph.parts.map((part, partIndex) => {
              if (part.kind === "text") return <span key={partIndex}>{part.text}</span>;
              if (part.kind === "image") {
                const url = story.images[part.number] ?? null;
                return <StoryImagePart key={partIndex} url={url} onOpen={() => url && setFullscreen({ kind: "image", url })} />;
              }
              return (
                <button
                  key={partIndex}
                  type="button"
                  onClick={() => setFullscreen({ kind: "word", segments: part.segments })}
                  className="mx-0.5 cursor-pointer align-middle"
                >
                  <WordCardRow segments={part.segments} images={story.images} size="sm" />
                </button>
              );
            })}
          </p>
        ))}
      </div>

      {fullscreen?.kind === "image" && (
        <FullscreenOverlay onClose={() => setFullscreen(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fullscreen.url} alt="" className="max-h-[70vh] max-w-[80vw] rounded-2xl object-contain shadow-2xl" />
        </FullscreenOverlay>
      )}
      {fullscreen?.kind === "word" && (
        <FullscreenOverlay onClose={() => setFullscreen(null)}>
          <div className="max-w-full overflow-x-auto">
            <WordCardRow segments={fullscreen.segments} images={story.images} size="lg" />
          </div>
        </FullscreenOverlay>
      )}
    </div>
  );
}

export function StoriesGame() {
  const t = useTranslations("StoriesGame");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const muted = useStoriesGameStore((s) => s.muted);
  const setMuted = useStoriesGameStore((s) => s.setMuted);

  const stories = useStories();
  const story = useStory(selectedSlug);

  return (
    <div className="relative flex min-h-[32rem] flex-1 flex-col overflow-hidden rounded-3xl bg-gradient-to-b from-amber-100 via-orange-50 to-rose-100 ring-4 ring-inset ring-white/90 shadow-lg">
      <button
        type="button"
        aria-label={t("mutedLabel")}
        onClick={() => setMuted(!muted)}
        className="absolute left-4 top-4 z-10 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white text-lg shadow-lg ring-2 ring-gray-200"
      >
        {muted ? "🔇" : "🔊"}
      </button>

      {selectedSlug && story ? (
        <StoryPage story={story} muted={muted} onBack={() => setSelectedSlug(null)} />
      ) : (
        <StoryPicker stories={stories} onSelect={setSelectedSlug} />
      )}
    </div>
  );
}
