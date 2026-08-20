import { Daisy, Tulip } from "@/components/preschool/decorations";

// The recurring "cottage window" screen — the lesson content, the quiz, and
// the theory check all live inside the same framed shape so every step
// reads as one consistent "colored screen" motif. See docs/interfaces/
// student/preschool/lesson.md.
export function ScreenFrame({
  children,
  maxWidthClassName = "max-w-xl",
}: {
  children: React.ReactNode;
  maxWidthClassName?: string;
}) {
  return (
    <div className={`relative w-full ${maxWidthClassName}`}>
      <svg viewBox="0 0 200 40" className="mx-auto -mb-1 w-40" aria-hidden="true">
        <path d="M0 40L100 2L200 40Z" fill="#92400e" />
      </svg>
      <div className="rounded-[2rem] border-[10px] border-amber-800 bg-sky-50 p-4 shadow-2xl">
        <div className="flex flex-col items-center gap-5 rounded-2xl bg-white p-4 [&_.prose]:max-w-none">
          {children}
        </div>
      </div>
      <Tulip className="absolute -bottom-5 left-2 h-10 w-10" />
      <Daisy className="absolute -bottom-5 right-2 h-8 w-8" color="#fca5a5" />
    </div>
  );
}
