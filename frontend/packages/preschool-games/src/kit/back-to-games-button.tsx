import Link from "next/link";
import { useTranslations } from "next-intl";

// The "🔁 switch game" corner button — either navigates to the standalone
// /games picker (game-play-page.tsx, pass `href`) or swaps local state back
// to the picker (game-choice.tsx's PreschoolCelebration, pass `onClick`).
type BackToGamesButtonProps = { href: string; onClick?: never } | { href?: never; onClick: () => void };

export function BackToGamesButton(props: BackToGamesButtonProps) {
  const t = useTranslations("PreschoolGameChoice");
  const className = "absolute bottom-4 left-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg shadow-lg ring-2 ring-gray-200";

  if (props.href) {
    return (
      <Link href={props.href} aria-label={t("switchGame")} className={className}>
        🔁
      </Link>
    );
  }
  return (
    <button type="button" aria-label={t("switchGame")} onClick={props.onClick} className={className}>
      🔁
    </button>
  );
}
