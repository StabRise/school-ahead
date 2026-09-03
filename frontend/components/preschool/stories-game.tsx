"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { speakSequence } from "@/lib/piper-tts";
import { useStories, useStory, type Story, type StoryWordSegment, type StorySummary } from "@/lib/story";
import { useStoriesGameStore } from "@/stores/stories-game-store";

// Preschool "Казки" (Stories) reading minigame — see docs/preschool/games/
// reading/Stories.md for the design brief. Two screens:
//   - a picker (StoryPicker) listing every <slug>/story.md under
//     public/static/stories (see lib/story.ts's useStories);
//   - the story itself (StoryPage), a "page" of prose where every "{...}"
//     group (see lib/story-parser.ts) is purely visual — tapping one just
//     opens it bigger, no read-aloud — but renders as one of two things:
//     - a lone image segment with nothing else, e.g. "{ img1.jpeg }", is a
//       full story illustration (StoryIllustration below): a plain
//       rectangular picture at its own aspect ratio, no card border;
//     - anything else ("{К - ВІ - Т - КА}", or an image mixed with letters)
//       is a syllable breakdown: a bordered row of cards, one per
//       "-"-separated segment (WordCardRow/WordSegmentCard below). Each
//       segment is its own card: a known two-letter syllable shows that
//       exact flashcard image from public/static/letters/<consonant>/
//       <syllable>.png (vowel red, consonant blue, same as everywhere else
//       that folder is used), a bare letter like "К" shows as plain colored
//       text, and a segment written as an image filename shows that photo
//       from public/static/stories/<slug>/<filename> instead.
//   Tapping either opens the same content full-screen (FullscreenOverlay).

const UK_VOWELS = new Set(["А", "О", "У", "Е", "И", "І", "Я", "Ю", "Є", "Ї"]);

function isVowelUk(letter: string): boolean {
  return UK_VOWELS.has(letter.toLocaleUpperCase("uk"));
}

function storyImageUrl(storySlug: string, filename: string): string {
  return `/static/stories/${encodeURIComponent(storySlug)}/${encodeURIComponent(filename)}`;
}

// A {...} group with exactly one image segment and nothing else (e.g.
// "{ img1.jpeg }") is a full illustration for the story, not a syllable
// breakdown — rendered as a plain rectangular picture (StoryIllustration
// below), not a bordered letter-card (WordCardRow/WordSegmentCard).
function isIllustration(segments: StoryWordSegment[]): segments is [{ kind: "image"; filename: string }] {
  return segments.length === 1 && segments[0].kind === "image";
}

// One card inside a {...} word breakdown, at either its small inline size
// (within running text) or its big full-screen size — same rendering rules
// either way, just bigger. A "text" segment that happens to be a known
// two-letter consonant+vowel syllable shows that exact flashcard image
// from the "Картки" game's asset folder instead of plain text — no need to
// ask the server which folders are "ready" (see /api/cards-game-modes)
// first, since a missing/not-yet-labeled file just 404s and onError falls
// back to colored letters. An "image" segment shows its own photo from
// this story's folder the same way, falling back to a "?" placeholder if
// it hasn't been uploaded yet.
function WordSegmentCard({
  segment,
  storySlug,
  size,
}: {
  segment: StoryWordSegment;
  storySlug: string;
  size: "sm" | "lg";
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const boxClass = size === "lg" ? "h-40 w-40 sm:h-60 sm:w-60" : "h-11 w-11";
  const cardClass = `${boxClass} shrink-0 rounded-lg border-2 border-gray-400 bg-white object-cover`;

  if (segment.kind === "image") {
    if (imageFailed) {
      return (
        <span aria-hidden="true" className={`flex ${boxClass} shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-gray-400`}>
          ?
        </span>
      );
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={storyImageUrl(storySlug, segment.filename)}
        alt=""
        draggable={false}
        className={cardClass}
        onError={() => setImageFailed(true)}
      />
    );
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
        size === "lg" ? "text-[75px] sm:text-[90px]" : "text-xl"
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
  storySlug,
  size,
}: {
  segments: StoryWordSegment[];
  storySlug: string;
  size: "sm" | "lg";
}) {
  return (
    <span
      className={`inline-flex items-center border-gray-700 bg-white shadow ${
        size === "lg" ? "gap-5 rounded-[1.875rem] border-[10px] p-5" : "gap-1 rounded-xl border-2 p-1"
      }`}
    >
      {segments.map((segment, index) => (
        <WordSegmentCard key={index} segment={segment} storySlug={storySlug} size={size} />
      ))}
    </span>
  );
}

// A full illustration for the story (see isIllustration above) — shown
// plain and rectangular, no card border, at its natural aspect ratio
// (object-contain, never cropped to a square). `size` picks inline
// (within running text, still fairly large per docs/preschool/games/
// reading/Stories.md) vs. full-screen (FullscreenOverlay).
function StoryIllustration({ url, size }: { url: string; size: "sm" | "lg" }) {
  const [imageFailed, setImageFailed] = useState(false);

  if (imageFailed) {
    return (
      <span
        aria-hidden="true"
        className={`flex items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-gray-400 ${
          size === "lg" ? "h-64 w-64" : "h-40 w-40"
        }`}
      >
        ?
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      draggable={false}
      onError={() => setImageFailed(true)}
      className={
        size === "lg"
          ? "max-h-[80vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
          : "max-h-64 w-auto rounded-lg object-contain shadow-md sm:max-h-80"
      }
    />
  );
}

// Shared full-screen chrome — a dark scrim that closes on tap anywhere
// (including the content itself, since nothing inside stops propagation),
// the ✕ button, Escape, or Space (a document-level listener rather than an
// onKeyDown on the div below, since nothing here auto-focuses that div on
// open — a keydown handler tied to its own focus would otherwise never
// fire from a plain mouse/tap click).
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

function StoryPage({
  slug,
  story,
  muted,
  onBack,
}: {
  slug: string;
  story: Story;
  muted: boolean;
  onBack: () => void;
}) {
  const t = useTranslations("StoriesGame");
  const [fullscreenSegments, setFullscreenSegments] = useState<StoryWordSegment[] | null>(null);
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
  // reading/Stories.md §5) — {...} word/image cards are purely visual
  // (tapping one just opens it bigger), so there's no text to read aloud
  // for them.
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
              if (isIllustration(part.segments)) {
                return (
                  <button
                    key={partIndex}
                    type="button"
                    onClick={() => setFullscreenSegments(part.segments)}
                    className="mx-auto block cursor-pointer"
                  >
                    <StoryIllustration url={storyImageUrl(slug, part.segments[0].filename)} size="sm" />
                  </button>
                );
              }
              return (
                <button
                  key={partIndex}
                  type="button"
                  onClick={() => setFullscreenSegments(part.segments)}
                  className="mx-0.5 cursor-pointer align-middle"
                >
                  <WordCardRow segments={part.segments} storySlug={slug} size="sm" />
                </button>
              );
            })}
          </p>
        ))}
      </div>

      {fullscreenSegments && (
        <FullscreenOverlay onClose={() => setFullscreenSegments(null)}>
          {isIllustration(fullscreenSegments) ? (
            <StoryIllustration url={storyImageUrl(slug, fullscreenSegments[0].filename)} size="lg" />
          ) : (
            <div className="max-w-full overflow-x-auto">
              <WordCardRow segments={fullscreenSegments} storySlug={slug} size="lg" />
            </div>
          )}
        </FullscreenOverlay>
      )}
    </div>
  );
}

// Shared outer chrome (mute button + gradient shell) plus the
// picker/story-page switch — `slug`/`onSelect`/`onBack` are supplied
// differently by the two exported components below: local state for the
// non-routed celebration-overlay context (StoriesGame), the URL for the
// standalone /games/stories[/<slug>] route (StoriesGamePage), so that
// context can deep-link a specific story and keep it open across a reload.
function StoriesShell({
  slug,
  story,
  stories,
  onSelect,
  onBack,
}: {
  slug: string | null;
  story: Story | null;
  stories: StorySummary[];
  onSelect: (slug: string) => void;
  onBack: () => void;
}) {
  const t = useTranslations("StoriesGame");
  const muted = useStoriesGameStore((s) => s.muted);
  const setMuted = useStoriesGameStore((s) => s.setMuted);

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

      {slug && story ? (
        <StoryPage slug={slug} story={story} muted={muted} onBack={onBack} />
      ) : (
        <StoryPicker stories={stories} onSelect={onSelect} />
      )}
    </div>
  );
}

// Non-routed variant for the post-lesson celebration overlay
// (components/preschool/game-choice.tsx's PreschoolCelebration) — an
// ephemeral inline pick, same as every other minigame there, so it just
// keeps which story is open in local state instead of the URL.
export function StoriesGame() {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const stories = useStories();
  const story = useStory(selectedSlug);

  return (
    <StoriesShell
      slug={selectedSlug}
      story={story}
      stories={stories}
      onSelect={setSelectedSlug}
      onBack={() => setSelectedSlug(null)}
    />
  );
}

// Routed variant for the standalone /games/stories[/<storySlug>] pages
// (see app/[locale]/(student)/games/stories/[storySlug]/page.tsx) — each
// story gets its own URL, so picking one navigates there (and pressing
// "back" navigates to the bare /games/stories picker) instead of touching
// local state, which is what makes a reload (F5) keep the same story open.
export function StoriesGamePage({ slug = null }: { slug?: string | null }) {
  const router = useRouter();
  const stories = useStories();
  const story = useStory(slug);

  return (
    <StoriesShell
      slug={slug}
      story={story}
      stories={stories}
      onSelect={(selectedSlug) => router.push(`/games/stories/${encodeURIComponent(selectedSlug)}`)}
      onBack={() => router.push("/games/stories")}
    />
  );
}
