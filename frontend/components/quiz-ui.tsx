"use client";

// Shared visual building blocks for the "big card" quiz format: a white
// rounded card topped by a gradient banner, with chunky tappable answer
// buttons underneath. Used by the preschool lesson quiz
// (components/preschool/quiz-game.tsx), the regular lesson quiz step
// (components/lesson-wizard/quiz-step.tsx), and the balloon-pop bonus quiz
// (components/preschool/balloon-quiz.tsx) so all three read as the same
// quiz experience. See docs/interfaces/student/preschool/lesson.md.

// Pastel fill + a darker border of the same hue, cycled per answer button.
export const QUIZ_ANSWER_STYLES = [
  { bg: "#86efac", border: "#16a34a" },
  { bg: "#fdba74", border: "#c2410c" },
  { bg: "#fde047", border: "#ca8a04" },
  { bg: "#bbf7d0", border: "#15803d" },
  { bg: "#7dd3fc", border: "#0284c7" },
  { bg: "#d8b4fe", border: "#7e22ce" },
  { bg: "#f9a8d4", border: "#db2777" },
];

export function QuizCard({ children }: { children: React.ReactNode }) {
  return <div className="w-full overflow-hidden rounded-[2rem] bg-white shadow-2xl">{children}</div>;
}

export function QuizBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative bg-gradient-to-r from-fuchsia-400 via-pink-400 to-amber-300 px-6 py-1 text-center sm:py-2">
      {children}
    </div>
  );
}

// The 🔊 read-aloud button — sits inline right after the question text (see
// QuestionRound in quiz-game.tsx and BalloonQuiz), not pinned to a corner,
// so it reads as part of the question rather than page chrome.
export function QuizReadAloudButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/90 text-base shadow-md transition-transform active:scale-95"
    >
      🔊
    </button>
  );
}

export type QuizAnswerStatus = "default" | "correct" | "incorrect" | "dimmed";

// One tappable answer — owns only the shared chrome (palette color, border,
// dim/reveal/pulse state); callers supply their own inner content (image,
// text, a bare number, ...) as `children` since that varies per quiz.
export function QuizAnswerButton({
  index,
  status = "default",
  pulse,
  disabled,
  onClick,
  className = "",
  children,
}: {
  index: number;
  status?: QuizAnswerStatus;
  pulse?: "hint" | "speaking";
  disabled: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const palette = QUIZ_ANSWER_STYLES[index % QUIZ_ANSWER_STYLES.length];
  const borderColor = status === "correct" ? "#16a34a" : status === "incorrect" ? "#dc2626" : palette.border;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-2xl border-4 shadow-md transition-transform disabled:cursor-default ${
        !disabled ? "active:scale-95" : ""
      } ${status === "incorrect" ? "opacity-90" : ""} ${status === "dimmed" ? "opacity-50" : ""} ${
        pulse === "speaking" ? "z-10 scale-110 ring-4 ring-sky-400 ring-offset-2" : ""
      } ${className}`}
      style={{
        backgroundColor: palette.bg,
        borderColor,
        animation:
          pulse === "hint"
            ? "card-correct-pulse 1s ease-in-out infinite"
            : pulse === "speaking"
              ? "card-speaking-pulse 0.9s ease-in-out infinite"
              : undefined,
      }}
    >
      {children}
    </button>
  );
}

// The optional-image-above-text layout shared by any answer button whose
// content is a picked choice's markdown/text (as opposed to balloon-quiz's
// picture-guessing mode, which fills the whole button with an image and has
// no text at all).
export function QuizChoiceContent({ image, imageAlt = "", children }: { image?: string | null; imageAlt?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-40 flex-col items-center justify-center gap-2 px-6 py-4 text-center text-lg font-extrabold uppercase text-gray-900 sm:min-w-48 sm:px-8 sm:py-5 sm:text-xl md:px-10 md:py-6 md:text-2xl lg:text-3xl">
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt={imageAlt} className="h-16 w-16 object-contain sm:h-20 sm:w-20 md:h-24 md:w-24" />
      )}
      <div className="[&_p]:m-0 [&_p]:text-lg sm:[&_p]:text-xl md:[&_p]:text-2xl lg:[&_p]:text-3xl">{children}</div>
    </div>
  );
}

// The overlay that covers the answer grid the instant the child taps an
// answer — a mascot (Raccoon, an emoji, flying stars, ...) plus an optional
// message, on a translucent blurred backdrop so it reads as feedback rather
// than a fresh screen.
export function QuizFeedbackOverlay({
  mascot,
  message,
  roundedClassName = "rounded-b-[2rem]",
}: {
  mascot: React.ReactNode;
  message?: React.ReactNode;
  roundedClassName?: string;
}) {
  return (
    <div
      className={`absolute inset-0 flex flex-col items-center justify-center gap-2 ${roundedClassName} bg-white/85 backdrop-blur-sm`}
      role="status"
    >
      {mascot}
      {message}
    </div>
  );
}
