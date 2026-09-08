"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { FlashcardItem } from "@/lib/flashcards";
import { CARD_FIELDS, type CardFaceConfig } from "./card-face-config";
import { CardFaceContent } from "./card-face-content";

// "Тест" (Quiz) mode, docs/preschool/games/cards.md — the front face is
// shown as the question and the student picks the matching card from up to
// four back-face options (both faces rendered via the same
// CardFaceContent/CardFaceSettingsPanel configuration Навчання uses, so
// e.g. picking front=translation/back=term quizzes in the reverse
// direction just as validly as the term-first default). Matching is by
// card identity (id), not by comparing rendered text, so it stays correct
// no matter which fields are configured. Capped at QUESTIONS_PER_QUIZ
// random cards from the (already topic-filtered) pool per round, not one
// question per card — a big set would otherwise turn "Тест" into a slog,
// and a fixed round length is what makes a percentage score meaningful.
const OPTIONS_PER_QUESTION = 4;
const QUESTIONS_PER_QUIZ = 10;

export interface CategorizedFlashcardItem {
  item: FlashcardItem;
  categoryTitle: string;
}

interface QuizQuestion {
  item: FlashcardItem;
  options: FlashcardItem[];
}

function shuffle<T>(source: T[]): T[] {
  const copy = [...source];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// A rough fingerprint of what a card's back would render under the current
// backConfig — used to keep every option (including the correct one) from
// looking identical to another (e.g. two cards sharing the same
// translation), not as the actual correctness check (that's always by id).
function backSignature(item: FlashcardItem, backConfig: CardFaceConfig): string {
  return CARD_FIELDS.filter((field) => backConfig[field])
    .map((field) => {
      if (field === "term") return item.term;
      if (field === "translation") return item.translation ?? "";
      if (field === "definition") return item.definition ?? "";
      return item.image ?? "";
    })
    .join("|");
}

// Fills up to `count` distinct-looking options from `pool`, skipping any
// whose back content (or id) has already been used.
function pickDistractors(
  pool: CategorizedFlashcardItem[],
  usedSignatures: Set<string>,
  usedIds: Set<number>,
  backConfig: CardFaceConfig,
  count: number,
): FlashcardItem[] {
  const picked: FlashcardItem[] = [];
  for (const entry of shuffle(pool)) {
    if (picked.length >= count) break;
    if (usedIds.has(entry.item.id)) continue;
    const signature = backSignature(entry.item, backConfig);
    if (usedSignatures.has(signature)) continue;
    usedSignatures.add(signature);
    usedIds.add(entry.item.id);
    picked.push(entry.item);
  }
  return picked;
}

// Every question's wrong options come from the same розділ/category as its
// card first — only reaching into the rest of the (already topic-filtered)
// pool if that category alone doesn't have enough cards to fill all four
// options — so distractors stay contextually plausible instead of jumping
// between unrelated topics.
function buildQuestions(entries: CategorizedFlashcardItem[], backConfig: CardFaceConfig): QuizQuestion[] {
  const selected = shuffle(entries).slice(0, QUESTIONS_PER_QUIZ);
  return selected.map(({ item, categoryTitle }) => {
    const sameCategory = entries.filter((e) => e.categoryTitle === categoryTitle && e.item.id !== item.id);
    const otherCategories = entries.filter((e) => e.categoryTitle !== categoryTitle && e.item.id !== item.id);

    const usedSignatures = new Set([backSignature(item, backConfig)]);
    const usedIds = new Set([item.id]);
    const distractors = pickDistractors(sameCategory, usedSignatures, usedIds, backConfig, OPTIONS_PER_QUESTION - 1);
    if (distractors.length < OPTIONS_PER_QUESTION - 1) {
      distractors.push(
        ...pickDistractors(
          otherCategories,
          usedSignatures,
          usedIds,
          backConfig,
          OPTIONS_PER_QUESTION - 1 - distractors.length,
        ),
      );
    }

    return { item, options: shuffle([item, ...distractors]) };
  });
}

// One question round — its own selection/reveal state resets by remounting
// (key={index} in the parent) instead of an effect syncing to a changed
// prop.
function QuizQuestionCard({
  question,
  resolveImage,
  frontConfig,
  backConfig,
  onAnswered,
}: {
  question: QuizQuestion;
  resolveImage: (item: FlashcardItem) => string | null;
  frontConfig: CardFaceConfig;
  backConfig: CardFaceConfig;
  onAnswered: (correct: boolean) => void;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const handleSelect = (optionItem: FlashcardItem) => {
    if (selectedId !== null) return;
    setSelectedId(optionItem.id);
    onAnswered(optionItem.id === question.item.id);
  };

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <div className="flex w-full flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <CardFaceContent item={question.item} imageUrl={resolveImage(question.item)} config={frontConfig} size="lg" />
      </div>

      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
        {question.options.map((optionItem) => {
          const isCorrectOption = optionItem.id === question.item.id;
          const isSelected = optionItem.id === selectedId;
          const revealed = selectedId !== null;
          return (
            <button
              key={optionItem.id}
              type="button"
              onClick={() => handleSelect(optionItem)}
              disabled={revealed}
              className={`rounded-xl border px-4 py-3 transition-colors ${
                revealed && isCorrectOption
                  ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950"
                  : revealed && isSelected
                    ? "border-red-500 bg-red-50 dark:bg-red-950"
                    : "border-slate-200 bg-white hover:bg-slate-50 disabled:cursor-default dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
              }`}
            >
              <CardFaceContent item={optionItem} imageUrl={resolveImage(optionItem)} config={backConfig} size="sm" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function FlashcardQuiz({
  items,
  resolveImage,
  frontConfig,
  backConfig,
}: {
  items: CategorizedFlashcardItem[];
  resolveImage: (item: FlashcardItem) => string | null;
  frontConfig: CardFaceConfig;
  backConfig: CardFaceConfig;
}) {
  const t = useTranslations("FlashcardsGame");
  const questions = useMemo(() => buildQuestions(items, backConfig), [items, backConfig]);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState(false);

  if (questions.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">{t("quizNoItems")}</p>;
  }

  if (index >= questions.length) {
    const percent = Math.round((score / questions.length) * 100);
    return (
      <div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
        <p className="text-xl font-semibold text-slate-900 dark:text-slate-50">{t("quizCompleteTitle")}</p>

        <div className="w-full">
          <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{t("quizResultLabel")}</span>
            <span>{percent}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div
              className="h-full rounded-full bg-slate-900 transition-all dark:bg-slate-50"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t("quizCompleteScore", { score, total: questions.length })}
        </p>
        <button
          type="button"
          onClick={() => {
            setIndex(0);
            setScore(0);
            setAnswered(false);
          }}
          className="rounded-full bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-200"
        >
          {t("restartButton")}
        </button>
      </div>
    );
  }

  const question = questions[index];
  const isLast = index === questions.length - 1;

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-6">
      <div className="flex w-full items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>{t("quizProgressLabel", { current: index + 1, total: questions.length })}</span>
        <span>{t("quizScoreLabel", { score })}</span>
      </div>

      <QuizQuestionCard
        key={index}
        question={question}
        resolveImage={resolveImage}
        frontConfig={frontConfig}
        backConfig={backConfig}
        onAnswered={(correct) => {
          setAnswered(true);
          if (correct) setScore((current) => current + 1);
        }}
      />

      {answered && (
        <button
          type="button"
          onClick={() => {
            setIndex((current) => current + 1);
            setAnswered(false);
          }}
          className="rounded-full bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-200"
        >
          {isLast ? t("quizFinishButton") : t("quizNextButton")}
        </button>
      )}
    </div>
  );
}
