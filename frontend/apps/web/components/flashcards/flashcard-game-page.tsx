"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PageContainer } from "@/components/page-container";
import { flashcardImageUrl, useFlashcardSet, type FlashcardItem } from "@/lib/flashcards";
import { FlashcardLearnDeck } from "./flashcard-learn-deck";
import { FlashcardQuiz, type CategorizedFlashcardItem } from "./flashcard-quiz";
import { CardFaceSettingsPanel } from "./card-face-settings-panel";
import { useFlashcardsStore } from "@/stores/flashcards-store";

type GameMode = "learn" | "quiz";
const ALL_TOPICS = "all";

// The direct link a lesson embeds (docs/preschool/games/cards.md,
// /games/cards/<group>/<set>) — one set's whole play experience: pick which
// topic(s) to study (every category flattened, or just one), which mode
// (Навчання/flip cards vs Тест/quiz — see FlashcardLearnDeck/FlashcardQuiz),
// and what each card's front/back actually shows (CardFaceSettingsPanel;
// both modes render through the same CardFaceContent, so the same
// front/back choice applies to either).
export function FlashcardGamePage({ group, set }: { group: string; set: string }) {
  const t = useTranslations("FlashcardsGame");
  const { groupTitle, set: flashcardSet, isLoading } = useFlashcardSet(group, set);
  const [topic, setTopic] = useState<string>(ALL_TOPICS);
  const [mode, setMode] = useState<GameMode>("quiz");
  // Persisted (localStorage) and shared across every card set the student
  // opens — see stores/flashcards-store.ts.
  const frontConfig = useFlashcardsStore((s) => s.frontConfig);
  const setFrontConfig = useFlashcardsStore((s) => s.setFrontConfig);
  const backConfig = useFlashcardsStore((s) => s.backConfig);
  const setBackConfig = useFlashcardsStore((s) => s.setBackConfig);

  const filteredCategories = useMemo(() => {
    if (!flashcardSet) return [];
    return topic === ALL_TOPICS ? flashcardSet.categories : flashcardSet.categories.filter((c) => c.title === topic);
  }, [flashcardSet, topic]);

  const filteredItems = useMemo(
    (): FlashcardItem[] => filteredCategories.flatMap((category) => category.items),
    [filteredCategories],
  );

  // Quiz distractors need to know each card's own category (see
  // FlashcardQuiz's buildQuestions) — Навчання doesn't care, it just wants
  // the flat list above.
  const categorizedItems = useMemo(
    (): CategorizedFlashcardItem[] =>
      filteredCategories.flatMap((category) =>
        category.items.map((item) => ({ item, categoryTitle: category.title })),
      ),
    [filteredCategories],
  );

  const resolveImage = useCallback(
    (item: FlashcardItem) => (item.image ? flashcardImageUrl(group, set, item.image) : null),
    [group, set],
  );

  if (!flashcardSet) {
    return (
      <PageContainer title={isLoading ? t("loading") : t("notFound")}>
        <Link href={`/games/cards/${encodeURIComponent(group)}`} className="text-sm text-slate-500 hover:underline dark:text-slate-400">
          ← {t("backToSetsButton")}
        </Link>
      </PageContainer>
    );
  }

  return (
    <PageContainer title={flashcardSet.title} maxWidthClassName="xl:max-w-4xl">
      <div className="mb-6 flex flex-col gap-1">
        <Link
          href={`/games/cards/${encodeURIComponent(group)}`}
          className="text-sm text-slate-500 hover:underline dark:text-slate-400"
        >
          ← {groupTitle ?? t("backToSetsButton")}
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">{t("topicLabel")}</span>
          <select
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-slate-800 outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value={ALL_TOPICS}>{t("allTopicsOption")}</option>
            {flashcardSet.categories.map((category) => (
              <option key={category.title} value={category.title}>
                {category.title}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-3">
          <CardFaceSettingsPanel
            frontConfig={frontConfig}
            onFrontConfigChange={setFrontConfig}
            backConfig={backConfig}
            onBackConfigChange={setBackConfig}
          />

          <div className="inline-flex overflow-hidden rounded-full border border-slate-300 text-sm font-medium dark:border-slate-600">
            <button
              type="button"
              onClick={() => setMode("learn")}
              className={`px-4 py-1.5 transition-colors ${
                mode === "learn"
                  ? "bg-slate-900 text-white dark:bg-slate-50 dark:text-slate-900"
                  : "bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              }`}
            >
              {t("modeLearn")}
            </button>
            <button
              type="button"
              onClick={() => setMode("quiz")}
              className={`px-4 py-1.5 transition-colors ${
                mode === "quiz"
                  ? "bg-slate-900 text-white dark:bg-slate-50 dark:text-slate-900"
                  : "bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              }`}
            >
              {t("modeQuiz")}
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-center">
        {mode === "learn" ? (
          <FlashcardLearnDeck
            key={`learn:${topic}`}
            items={filteredItems}
            resolveImage={resolveImage}
            frontConfig={frontConfig}
            backConfig={backConfig}
          />
        ) : (
          <FlashcardQuiz
            key={`quiz:${topic}:${JSON.stringify(backConfig)}`}
            items={categorizedItems}
            resolveImage={resolveImage}
            frontConfig={frontConfig}
            backConfig={backConfig}
          />
        )}
      </div>
    </PageContainer>
  );
}
