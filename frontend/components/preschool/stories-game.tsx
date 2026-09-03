"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import { useRouter } from "@/i18n/navigation";
import { useStories, useStory, type Story, type StoryWordSegment, type StorySummary } from "@/lib/story";
import { remarkStoryCards, STORY_CARD_TAG } from "@/lib/story-markdown";
import { parseSyllableGroup } from "@/lib/story-parser";
import { StoryBook } from "@/components/preschool/story-book";

// Preschool "Казки" (Stories) reading minigame — see docs/preschool/games/
// reading/Stories.md for the design brief. Two screens:
//   - a picker (StoryPicker) listing every <slug>/story.md under
//     public/static/stories (see lib/story.ts's useStories);
//   - the story itself (StoryPage) — its body is real Markdown, rendered
//     with react-markdown (same library as components/markdown.tsx), so
//     headings/emphasis/lists/blockquotes/etc. all render normally. On top
//     of that, lib/story-markdown.ts's remarkStoryCards plugin recognizes
//     "{...}" anywhere in the Markdown and turns it into a <story-card>
//     element (StoryCard below) — purely visual, tapping one just opens it
//     bigger, no read-aloud — rendered as one of two things:
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

// Renders one "{...}" reference found anywhere in the story's Markdown —
// react-markdown dispatches to this via the `components` map, keyed by
// STORY_CARD_TAG, for every <story-card raw="..."> element
// lib/story-markdown.ts's remarkStoryCards plugin inserts. `raw` is the
// group's unparsed inner content; parseSyllableGroup (lib/story-parser.ts)
// is the same pure segment parser the unit tests cover.
function StoryCard({
  raw,
  storySlug,
  onOpen,
}: {
  raw: string;
  storySlug: string;
  onOpen: (segments: StoryWordSegment[]) => void;
}) {
  const segments = useMemo(() => parseSyllableGroup(raw), [raw]);
  if (segments.length === 0) return null;

  if (isIllustration(segments)) {
    return (
      // not-prose: the .prose typography plugin styling the story body
      // (see StoryPage below) puts a large top/bottom margin on every
      // <img>, including the ones inside our own cards — not-prose opts
      // this whole subtree back out of that (see Tailwind Typography's
      // docs), which is what keeps the card row from ballooning in height.
      <button type="button" onClick={() => onOpen(segments)} className="not-prose mx-auto block cursor-pointer">
        <StoryIllustration url={storyImageUrl(storySlug, segments[0].filename)} size="sm" />
      </button>
    );
  }

  return (
    <button type="button" onClick={() => onOpen(segments)} className="not-prose mx-0.5 cursor-pointer align-middle">
      <WordCardRow segments={segments} storySlug={storySlug} size="sm" />
    </button>
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
        // No enclosing frame here — the books sit directly on
        // StoriesShell's own gradient background, same one-frame
        // convention as game-choice.tsx's GamePicker (a plain row of
        // individually-framed cards, not a second bordered box around
        // the whole group).
        <ul className="flex flex-wrap justify-center gap-x-6 gap-y-8">
          {stories.map((story) => (
            <li key={story.slug}>
              <StoryBook title={story.title} coverUrl={story.cover} onClick={() => onSelect(story.slug)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StoryPage({ slug, story, onBack }: { slug: string; story: Story; onBack: () => void }) {
  const t = useTranslations("StoriesGame");
  const [fullscreenSegments, setFullscreenSegments] = useState<StoryWordSegment[] | null>(null);

  const markdownComponents = useMemo(
    (): Components =>
      ({
        [STORY_CARD_TAG]: ({ raw }: { raw: string }) => (
          <StoryCard raw={raw} storySlug={slug} onOpen={setFullscreenSegments} />
        ),
      }) as unknown as Components,
    [slug],
  );

  return (
    // rounded-3xl (matching StoriesShell's own rounding) + a plain
    // paper-colored fill, no separate ring/shadow — StoriesShell already
    // provides the game's one frame, so this only needs to change the
    // background color, not add a second border on top of it.
    <div className="relative flex flex-1 flex-col overflow-y-auto rounded-3xl bg-[#fffdf7] p-4 sm:p-8">
      <div className="mb-4">
        <button
          type="button"
          onClick={onBack}
          title={t("backToListButton")}
          aria-label={t("backToListButton")}
          className="flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-3xl shadow-lg ring-2 ring-white transition hover:scale-105"
        >
          📚
        </button>
      </div>

      <div className="mb-6 text-center">
        {story.subtitle && <p className="text-sm italic text-gray-400">{story.subtitle}</p>}
        <h2 className="text-3xl font-extrabold text-gray-800">{story.title}</h2>
      </div>

      {/* prose-lg for the fairy-tale-sized body text (headings, emphasis,
          lists, blockquotes — anything real Markdown supports); max-w-none
          since the mx-auto max-w-2xl wrapper already constrains width. */}
      <div className="prose prose-lg mx-auto max-w-2xl text-gray-700 prose-p:leading-loose">
        <ReactMarkdown remarkPlugins={[remarkStoryCards, remarkBreaks]} components={markdownComponents}>
          {story.body}
        </ReactMarkdown>
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
  return (
    <div className="relative flex min-h-[32rem] flex-1 flex-col overflow-hidden rounded-3xl bg-gradient-to-b from-amber-100 via-orange-50 to-rose-100 ring-4 ring-inset ring-white/90 shadow-lg">
      {slug && story ? (
        <StoryPage slug={slug} story={story} onBack={onBack} />
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
