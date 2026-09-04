import { useTranslations } from "next-intl";
import { PreschoolButton } from "@school-ahead/preschool-ui";
import { playPopSound } from "./sound-effects";

// The 🏠 "back to the game picker" button every game shows — replaces the
// old small "🔁 switch game" corner button with a big, round, thick-bordered
// PreschoolButton (see docs/interfaces): the clearest "home" symbol there
// is, always in the same top-left spot regardless of which game or screen
// it's on, bouncing on hover/press with a satisfying pop on activation.
// Either navigates to the standalone /games picker (game-play-page.tsx,
// pass `href`) or swaps local state back to the picker (game-choice.tsx's
// PreschoolCelebration, pass `onClick`) — same two shapes as before.
type HomeButtonProps = { href: string; onClick?: never } | { href?: never; onClick: () => void };

export function HomeButton(props: HomeButtonProps) {
  const t = useTranslations("PreschoolGameChoice");
  return (
    <PreschoolButton
      icon="🏠"
      label={t("switchGame")}
      ringColorClassName="ring-emerald-400"
      // Custom fixed position (not the "top-left" preset) — every game
      // renders under the app's own (non-fixed) header, so top-4 would sit
      // right on top of it instead of below it.
      position="static"
      className="fixed left-4 top-20"
      onActivate={playPopSound}
      {...props}
    />
  );
}
