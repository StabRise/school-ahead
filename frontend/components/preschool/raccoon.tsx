// The quiz mascot — cheers when the answer is right, droops when it's
// wrong, and points at the correct card when the child is stuck. See
// docs/interfaces/student/preschool/lesson.md ("Игровая поляна").
export type RaccoonMood = "idle" | "happy" | "sad" | "hint";

const MOOD_ANIMATION: Record<RaccoonMood, string | undefined> = {
  idle: "raccoon-breathe 3s ease-in-out infinite",
  happy: "raccoon-bounce 0.6s ease-in-out 2",
  sad: "raccoon-shake 0.5s ease-in-out",
  hint: "raccoon-breathe 3s ease-in-out infinite",
};

function Face({ mood }: { mood: RaccoonMood }) {
  if (mood === "happy") {
    return (
      <>
        <path d="M18 30q4 3 8 0" stroke="#1f2937" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M15 21q2-2 4 0" stroke="#1f2937" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M27 21q2-2 4 0" stroke="#1f2937" strokeWidth="2" fill="none" strokeLinecap="round" />
      </>
    );
  }
  if (mood === "sad") {
    return (
      <>
        <path d="M18 32q4 -3 8 0" stroke="#1f2937" strokeWidth="2" fill="none" strokeLinecap="round" />
        <circle cx="17" cy="21" r="2.2" fill="#1f2937" />
        <circle cx="29" cy="21" r="2.2" fill="#1f2937" />
        <path d="M13 17l4 2M33 17l-4 2" stroke="#1f2937" strokeWidth="1.6" strokeLinecap="round" />
      </>
    );
  }
  return (
    <>
      <circle cx="17" cy="21" r="2.2" fill="#1f2937" />
      <circle cx="29" cy="21" r="2.2" fill="#1f2937" />
      <path d="M20 29q3 2 6 0" stroke="#1f2937" strokeWidth="2" fill="none" strokeLinecap="round" />
    </>
  );
}

export function Raccoon({ mood = "idle", className = "" }: { mood?: RaccoonMood; className?: string }) {
  return (
    <div
      className={className}
      style={{
        animation: MOOD_ANIMATION[mood],
        transformOrigin: "50% 100%",
      }}
    >
      <svg viewBox="0 0 46 50" className="h-full w-full" aria-hidden="true">
        {/* ears */}
        <circle cx="10" cy="10" r="7" fill="#78716c" />
        <circle cx="36" cy="10" r="7" fill="#78716c" />
        <circle cx="10" cy="10" r="3.4" fill="#44403c" />
        <circle cx="36" cy="10" r="3.4" fill="#44403c" />
        {/* head */}
        <circle cx="23" cy="24" r="19" fill="#a8a29e" />
        {/* mask */}
        <path d="M8 20c2-6 8-9 15-9s13 3 15 9c-3 3-7 5-15 5s-12-2-15-5z" fill="#f5f5f4" />
        <Face mood={mood} />
        <ellipse cx="23" cy="25.5" rx="2.6" ry="1.8" fill="#1f2937" />
        {/* tail stripes peeking from behind */}
        <rect x="1" y="38" width="10" height="6" rx="3" fill="#78716c" />
        <rect x="35" y="38" width="10" height="6" rx="3" fill="#78716c" />
      </svg>
      {mood === "hint" && (
        <svg viewBox="0 0 24 24" className="mx-auto -mt-1 h-6 w-6 animate-bounce" aria-hidden="true">
          <path
            d="M12 4v13m0 0l-5-5m5 5l5-5"
            stroke="#f59e0b"
            strokeWidth="2.6"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
}
