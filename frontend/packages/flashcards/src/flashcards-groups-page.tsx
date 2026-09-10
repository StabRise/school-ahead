"use client";

import { useTranslations } from "next-intl";
import { LocaleLink as Link } from "./kit/locale-link";
import { PageShell as SimplePageContainer } from "./kit/page-shell";
import { useFlashcardGroups } from "./lib/flashcards";

// "Cards" study flashcards game's subject picker (docs/preschool/games/
// cards.md, /games/cards) — one tile per public/static/cards/<group> that
// has a title.json (see /api/flashcard-groups). Picking a group goes to
// /games/cards/<group> to then pick a set within it.
export function FlashcardsGroupsPage() {
  const t = useTranslations("FlashcardsGame");
  const groups = useFlashcardGroups();

  return (
    <SimplePageContainer title={t("groupsTitle")}>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">{t("groupsSubtitle")}</p>

      {groups.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">{t("noGroups")}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {groups.map((group) => (
            <li key={group.slug}>
              <Link
                href={`/games/cards/${encodeURIComponent(group.slug)}`}
                className="flex h-24 items-center justify-center rounded-xl border border-slate-200 bg-white p-4 text-center text-base font-medium text-slate-800 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                {group.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SimplePageContainer>
  );
}
