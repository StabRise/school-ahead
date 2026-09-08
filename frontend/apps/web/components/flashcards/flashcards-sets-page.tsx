"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { SimplePageContainer } from "@/components/simple/page-container";
import { useFlashcardSets } from "@/lib/flashcards";

// One subject's set picker (docs/preschool/games/cards.md,
// /games/cards/<group>) — one row per public/static/cards/<group>/<set> that
// has a set.json (see /api/flashcard-sets). Picking a set goes to its
// direct-linkable game page, /games/cards/<group>/<set>.
export function FlashcardsSetsPage({ group }: { group: string }) {
  const t = useTranslations("FlashcardsGame");
  const { groupTitle, sets } = useFlashcardSets(group);

  return (
    <SimplePageContainer title={groupTitle ?? t("groupsTitle")}>
      <Link href="/games/cards" className="mb-4 inline-block text-sm text-slate-500 hover:underline dark:text-slate-400">
        ← {t("backToGroupsButton")}
      </Link>

      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">{t("setsSubtitle")}</p>

      {sets.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">{t("noSets")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sets.map((set) => (
            <li key={set.slug}>
              <Link
                href={`/games/cards/${encodeURIComponent(group)}/${encodeURIComponent(set.slug)}`}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-800 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                <span className="font-medium">{set.title}</span>
                <span className="text-sm text-slate-400 dark:text-slate-500">{t("itemsCount", { count: set.itemCount })}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SimplePageContainer>
  );
}
