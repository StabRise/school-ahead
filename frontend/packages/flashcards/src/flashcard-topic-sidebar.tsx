"use client";

import { useTranslations } from "next-intl";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

export interface FlashcardTopicOption {
  value: string;
  label: string;
  // How many cards this topic filters down to (e.g. "Wzory (6)") — lets a
  // student gauge a topic's size before picking it, same info the ⚙
  // panel's plain <select> doesn't have room to show.
  count: number;
}

// Wide-screen-only table-of-contents sidebar for Навчання/Тест (docs/
// preschool/games/cards.md) — the same topic filter GameSettingsPanel's
// "Тема" <select> already drives (setTopic below is
// FlashcardGamePage's own setTopic, so picking a topic here or from the ⚙
// panel stays in sync), just surfaced as an always-visible list once
// there's enough width for one (`hidden lg:flex`, applied by the caller).
// Список mode doesn't get this sidebar since it already groups every card
// by topic inline. `collapsed` is persisted (stores/flashcards-store.ts)
// like the game's other shared UI preferences — collapsing shows just the
// toggle button, letting a wide-but-not-huge screen give that space back
// to the card itself.
export function FlashcardTopicSidebar({
  topics,
  activeTopic,
  onTopicChange,
  collapsed,
  onToggleCollapsed,
  className = "",
}: {
  topics: FlashcardTopicOption[];
  activeTopic: string;
  onTopicChange: (value: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  className?: string;
}) {
  const t = useTranslations("FlashcardsGame");

  if (collapsed) {
    return (
      <div className={`shrink-0 ${className}`}>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={t("expandTopicSidebarLabel")}
          title={t("expandTopicSidebarLabel")}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <PanelLeftOpen className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <aside className={`w-56 shrink-0 ${className}`}>
      <div className="rounded-lg border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-700">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {t("topicSidebarTitle")}
          </span>
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={t("collapseTopicSidebarLabel")}
            title={t("collapseTopicSidebarLabel")}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <PanelLeftClose className="size-4" />
          </button>
        </div>
        <ul className="flex max-h-[70vh] flex-col gap-0.5 overflow-y-auto p-1.5">
          {topics.map((topicOption) => (
            <li key={topicOption.value}>
              <button
                type="button"
                onClick={() => onTopicChange(topicOption.value)}
                aria-current={topicOption.value === activeTopic}
                className={`block w-full truncate rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
                  topicOption.value === activeTopic
                    ? "bg-slate-900 text-white dark:bg-slate-50 dark:text-slate-900"
                    : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                }`}
              >
                {topicOption.label}{" "}
                <span
                  className={
                    topicOption.value === activeTopic
                      ? "text-white/70 dark:text-slate-900/60"
                      : "text-slate-400 dark:text-slate-500"
                  }
                >
                  ({topicOption.count})
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
