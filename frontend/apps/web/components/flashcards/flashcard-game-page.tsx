"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Layers, List, ListChecks, Printer } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { SimplePageContainer } from "@/components/simple/page-container";
import { flashcardImageUrl, useFlashcardSet, type FlashcardItem } from "@/lib/flashcards";
import { FlashcardLearnDeck } from "./flashcard-learn-deck";
import { FlashcardQuiz, type CategorizedFlashcardItem } from "./flashcard-quiz";
import { FlashcardTermsList } from "./flashcard-terms-list";
import { GameSettingsPanel } from "./game-settings-panel";
import { QuizResultsPanel } from "./quiz-results-panel";
import { useFlashcardsStore } from "@/stores/flashcards-store";
import { useFlashcardQuizResultsStore } from "@/stores/flashcard-quiz-results-store";
import { flashcardProgressKey, useFlashcardProgressStore, type FlashcardStatus } from "@/stores/flashcard-progress-store";
import { flashcardTopicKey, useFlashcardTopicStore } from "@/stores/flashcard-topic-store";

const ALL_TOPICS = "all";

// The direct link a lesson embeds (docs/preschool/games/cards.md,
// /games/cards/<group>/<set>) — one set's whole play experience: pick which
// topic(s) to study (every category flattened, or just one), which mode
// (Навчання/flip cards vs Тест/quiz — see FlashcardLearnDeck/FlashcardQuiz),
// and what each card's front/back actually shows, all from one ⚙ popup
// (GameSettingsPanel; both modes render through the same CardFaceContent,
// so the same front/back choice applies to either). Every completed Тест
// round is recorded (useFlashcardQuizResultsStore) and browsable from the
// 📊 popup (QuizResultsPanel).
export function FlashcardGamePage({ group, set }: { group: string; set: string }) {
  const t = useTranslations("FlashcardsGame");
  const { groupTitle, set: flashcardSet, isLoading } = useFlashcardSet(group, set);

  // Persisted (localStorage) but specific to this group+set — unlike
  // mode/frontConfig/backConfig below, narrowing "math/7 klasa" to one
  // topic shouldn't also narrow an unrelated set — see
  // stores/flashcard-topic-store.ts.
  const topicByCardSet = useFlashcardTopicStore((s) => s.topicByCardSet);
  const setTopicForCardSet = useFlashcardTopicStore((s) => s.setTopic);
  const persistedTopic = topicByCardSet[flashcardTopicKey(group, set)] ?? ALL_TOPICS;
  // A topic persisted from an earlier version of this set might not exist
  // anymore (e.g. a renamed/removed category) — fall back to "all" rather
  // than silently filtering everything out, same self-heal other games'
  // persisted settings use.
  const topic =
    persistedTopic === ALL_TOPICS || !flashcardSet || flashcardSet.categories.some((c) => c.title === persistedTopic)
      ? persistedTopic
      : ALL_TOPICS;
  const setTopic = useCallback(
    (value: string) => setTopicForCardSet(group, set, value),
    [setTopicForCardSet, group, set],
  );

  // Persisted (localStorage) and shared across every card set the student
  // opens — see stores/flashcards-store.ts.
  const mode = useFlashcardsStore((s) => s.mode);
  const setMode = useFlashcardsStore((s) => s.setMode);
  const frontConfig = useFlashcardsStore((s) => s.frontConfig);
  const setFrontConfig = useFlashcardsStore((s) => s.setFrontConfig);
  const backConfig = useFlashcardsStore((s) => s.backConfig);
  const setBackConfig = useFlashcardsStore((s) => s.setBackConfig);
  const flipOrientation = useFlashcardsStore((s) => s.flipOrientation);
  const setFlipOrientation = useFlashcardsStore((s) => s.setFlipOrientation);
  const addQuizAttempt = useFlashcardQuizResultsStore((s) => s.addAttempt);

  // "Знаю"/"Складно" marks, persisted per group+set+card — see
  // stores/flashcard-progress-store.ts and FlashcardLearnDeck.
  const statusByCard = useFlashcardProgressStore((s) => s.statusByCard);
  const setCardStatus = useFlashcardProgressStore((s) => s.setCardStatus);
  const getItemStatus = useCallback(
    (itemId: number): FlashcardStatus | undefined => statusByCard[flashcardProgressKey(group, set, itemId)],
    [statusByCard, group, set],
  );
  const setItemStatus = useCallback(
    (itemId: number, status: FlashcardStatus | null) => setCardStatus(flashcardProgressKey(group, set, itemId), status),
    [setCardStatus, group, set],
  );
  const [onlyDifficult, setOnlyDifficult] = useState(false);
  const [skipKnown, setSkipKnown] = useState(false);

  const filteredCategories = useMemo(() => {
    if (!flashcardSet) return [];
    return topic === ALL_TOPICS ? flashcardSet.categories : flashcardSet.categories.filter((c) => c.title === topic);
  }, [flashcardSet, topic]);

  const filteredItems = useMemo(
    (): FlashcardItem[] => filteredCategories.flatMap((category) => category.items),
    [filteredCategories],
  );

  // Навчання-only filters on top of the topic filter above — Тест always
  // quizzes the whole topic-filtered pool.
  const learnItems = useMemo(
    (): FlashcardItem[] =>
      filteredItems.filter((item) => {
        const status = getItemStatus(item.id);
        if (onlyDifficult && status !== "difficult") return false;
        if (skipKnown && status === "known") return false;
        return true;
      }),
    [filteredItems, getItemStatus, onlyDifficult, skipKnown],
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

  const handleQuizComplete = useCallback(
    (score: number, total: number) => {
      addQuizAttempt({ group, set, topic, score, total });
    },
    [addQuizAttempt, group, set, topic],
  );

  if (!flashcardSet) {
    return (
      <SimplePageContainer title={isLoading ? t("loading") : t("notFound")}>
        <Link href={`/games/cards/${encodeURIComponent(group)}`} className="text-sm text-slate-500 hover:underline dark:text-slate-400">
          ← {t("backToSetsButton")}
        </Link>
      </SimplePageContainer>
    );
  }

  const topicOptions = [
    { value: ALL_TOPICS, label: t("allTopicsOption") },
    ...flashcardSet.categories.map((category) => ({ value: category.title, label: category.title })),
  ];

  return (
    <SimplePageContainer>
      <div className="mb-4 flex items-center gap-3">
        <Link
          href={`/games/cards/${encodeURIComponent(group)}`}
          aria-label={groupTitle ?? t("backToSetsButton")}
          title={groupTitle ?? t("backToSetsButton")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-50">{flashcardSet.title}</h2>
      </div>

      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <GameSettingsPanel
            topic={topic}
            topics={topicOptions}
            onTopicChange={setTopic}
            showLearnFilters={mode === "learn"}
            onlyDifficult={onlyDifficult}
            onOnlyDifficultChange={setOnlyDifficult}
            skipKnown={skipKnown}
            onSkipKnownChange={setSkipKnown}
            flipOrientation={flipOrientation}
            onFlipOrientationChange={setFlipOrientation}
            frontConfig={frontConfig}
            onFrontConfigChange={setFrontConfig}
            backConfig={backConfig}
            onBackConfigChange={setBackConfig}
          />
          <QuizResultsPanel group={group} set={set} />
          <Link
            href={`/games/cards/${encodeURIComponent(group)}/${encodeURIComponent(set)}/print`}
            aria-label={t("printButton")}
            title={t("printButton")}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Printer className="size-4" />
          </Link>
        </div>

        <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 dark:border-slate-600">
          <button
            type="button"
            onClick={() => setMode("learn")}
            aria-label={t("modeLearn")}
            title={t("modeLearn")}
            className={`flex h-9 w-9 items-center justify-center transition-colors ${
              mode === "learn"
                ? "bg-slate-900 text-white dark:bg-slate-50 dark:text-slate-900"
                : "bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            }`}
          >
            <Layers className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setMode("quiz")}
            aria-label={t("modeQuiz")}
            title={t("modeQuiz")}
            className={`flex h-9 w-9 items-center justify-center border-l border-slate-300 transition-colors dark:border-slate-600 ${
              mode === "quiz"
                ? "bg-slate-900 text-white dark:bg-slate-50 dark:text-slate-900"
                : "bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            }`}
          >
            <ListChecks className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setMode("list")}
            aria-label={t("modeList")}
            title={t("modeList")}
            className={`flex h-9 w-9 items-center justify-center border-l border-slate-300 transition-colors dark:border-slate-600 ${
              mode === "list"
                ? "bg-slate-900 text-white dark:bg-slate-50 dark:text-slate-900"
                : "bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            }`}
          >
            <List className="size-4" />
          </button>
        </div>
      </div>

      <div className="flex justify-center">
        {mode === "learn" && (
          <FlashcardLearnDeck
            key={`learn:${topic}:${onlyDifficult}:${skipKnown}`}
            items={learnItems}
            resolveImage={resolveImage}
            frontConfig={frontConfig}
            backConfig={backConfig}
            flipOrientation={flipOrientation}
            getStatus={getItemStatus}
            onStatusChange={setItemStatus}
          />
        )}
        {mode === "quiz" && (
          <FlashcardQuiz
            key={`quiz:${topic}:${JSON.stringify(backConfig)}`}
            items={categorizedItems}
            resolveImage={resolveImage}
            frontConfig={frontConfig}
            backConfig={backConfig}
            getStatus={getItemStatus}
            onComplete={handleQuizComplete}
          />
        )}
        {mode === "list" && (
          <FlashcardTermsList
            categories={filteredCategories}
            resolveImage={resolveImage}
            getStatus={getItemStatus}
            onStatusChange={setItemStatus}
          />
        )}
      </div>
    </SimplePageContainer>
  );
}
