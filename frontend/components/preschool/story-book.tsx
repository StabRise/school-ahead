"use client";

// One "book" card for the "Казки" minigame's picker (components/preschool/
// stories-game.tsx's StoryPicker) — a standalone component so the exact
// same look is used whether that picker is reached from the standalone
// /games/stories page or the inline post-lesson celebration overlay (see
// stories-game.tsx's StoriesGamePage vs. StoriesGame, both of which render
// StoryPicker). One card is the whole book cover: the square cover.<ext>
// image on top (docs/preschool/games/reading/Stories.md §3 — cover.jpeg
// etc. are square already), the story's title in a caption strip below it,
// both inside the same bordered/shadowed card so it reads as one physical
// book cover rather than a photo with a floating label underneath. Falls
// back to a 📖 placeholder where the image goes when the story has no
// cover art yet. Growing to 2x on hover (group-hover:scale-[2]) is the
// tap/click affordance for a child who hasn't learned "hover = interactive"
// yet — hover:z-20 lifts it above neighboring books on the shelf while
// enlarged, since a transform doesn't otherwise change stacking order.
export function StoryBook({
  title,
  coverUrl,
  onClick,
}: {
  title: string;
  coverUrl: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={title}
      className="group relative z-0 w-36 shrink-0 cursor-pointer hover:z-20 sm:w-40"
    >
      <div className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-lg ring-2 ring-gray-200 transition-transform duration-200 group-hover:scale-[2] group-active:scale-95">
        <div className="flex aspect-square w-full items-center justify-center bg-gradient-to-br from-amber-100 to-orange-200">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-5xl" aria-hidden="true">
              📖
            </span>
          )}
        </div>

        <div className="px-2 py-2">
          <span className="line-clamp-2 text-center text-sm font-bold leading-tight text-gray-700">{title}</span>
        </div>
      </div>
    </button>
  );
}
