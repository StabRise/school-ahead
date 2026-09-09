"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { FlipHorizontal2, FlipVertical2, Settings } from "lucide-react";
import { CARD_FIELDS, type CardField, type CardFaceConfig, type CardFlipOrientation } from "./card-face-config";

const FIELD_LABEL_KEY: Record<CardField, string> = {
  term: "fieldTerm",
  translation: "fieldTranslation",
  image: "fieldImage",
  definition: "fieldDefinition",
};

function toggleField(config: CardFaceConfig, field: CardField): CardFaceConfig {
  const nextValue = !config[field];
  // A face left with nothing checked has nothing to show — CardFaceContent
  // would fall back to whatever the card happens to have, silently
  // ignoring the student's choice, so refuse to uncheck the last box
  // instead.
  if (!nextValue && CARD_FIELDS.filter((f) => config[f]).length <= 1) return config;
  return { ...config, [field]: nextValue };
}

function FaceCheckboxGroup({
  title,
  config,
  onChange,
}: {
  title: string;
  config: CardFaceConfig;
  onChange: (config: CardFaceConfig) => void;
}) {
  const t = useTranslations("FlashcardsGame");
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">{title}</p>
      <div className="flex flex-col gap-1.5">
        {CARD_FIELDS.map((field) => (
          <label key={field} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              checked={config[field]}
              onChange={() => onChange(toggleField(config, field))}
              className="h-4 w-4 rounded border-slate-300 dark:border-slate-600"
            />
            {t(FIELD_LABEL_KEY[field])}
          </label>
        ))}
      </div>
    </div>
  );
}

// The single "⚙" popup covering both of a game session's settings (docs/
// preschool/games/cards.md): which топіки to study (Тема — same effect as
// before, just moved off the toolbar and into this panel) and what each
// card's front/back shows (Картка — CardFaceContent's config, persisted
// across every set via useFlashcardsStore). Same
// gear-button-toggles-a-panel-that-closes-on-outside-click pattern as
// @school-ahead/preschool-games' CardsGame settings panel.
export function GameSettingsPanel({
  topic,
  topics,
  onTopicChange,
  showLearnFilters,
  onlyDifficult,
  onOnlyDifficultChange,
  skipKnown,
  onSkipKnownChange,
  flipOrientation,
  onFlipOrientationChange,
  frontConfig,
  onFrontConfigChange,
  backConfig,
  onBackConfigChange,
}: {
  topic: string;
  topics: { value: string; label: string }[];
  onTopicChange: (topic: string) => void;
  // Навчання-only ("review only difficult" / "skip cards I know", and the
  // flip view below) — hidden in Тест, which always quizzes the full
  // topic-filtered pool and doesn't use FlipCard at all.
  showLearnFilters: boolean;
  onlyDifficult: boolean;
  onOnlyDifficultChange: (value: boolean) => void;
  skipKnown: boolean;
  onSkipKnownChange: (value: boolean) => void;
  flipOrientation: CardFlipOrientation;
  onFlipOrientationChange: (orientation: CardFlipOrientation) => void;
  frontConfig: CardFaceConfig;
  onFrontConfigChange: (config: CardFaceConfig) => void;
  backConfig: CardFaceConfig;
  onBackConfigChange: (config: CardFaceConfig) => void;
}) {
  const t = useTranslations("FlashcardsGame");
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={t("settingsButton")}
        title={t("settingsButton")}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <Settings className="size-4" />
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute left-0 top-full z-10 mt-2 flex w-72 flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t("topicLabel")}
            </p>
            <select
              value={topic}
              onChange={(e) => onTopicChange(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            >
              {topics.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {showLearnFilters && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t("modeLearn")}
              </p>
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={onlyDifficult}
                    onChange={(e) => onOnlyDifficultChange(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 dark:border-slate-600"
                  />
                  {t("onlyDifficultLabel")}
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={skipKnown}
                    onChange={(e) => onSkipKnownChange(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 dark:border-slate-600"
                  />
                  {t("skipKnownLabel")}
                </label>
              </div>

              <p className="mb-1.5 mt-3 text-xs font-medium text-slate-500 dark:text-slate-400">
                {t("flipViewLabel")}
              </p>
              <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 dark:border-slate-600">
                <button
                  type="button"
                  onClick={() => onFlipOrientationChange("vertical")}
                  aria-pressed={flipOrientation === "vertical"}
                  title={t("flipViewVertical")}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    flipOrientation === "vertical"
                      ? "bg-slate-900 text-white dark:bg-slate-50 dark:text-slate-900"
                      : "bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  }`}
                >
                  <FlipVertical2 className="size-3.5" />
                  {t("flipViewVertical")}
                </button>
                <button
                  type="button"
                  onClick={() => onFlipOrientationChange("horizontal")}
                  aria-pressed={flipOrientation === "horizontal"}
                  title={t("flipViewHorizontal")}
                  className={`flex items-center gap-1.5 border-l border-slate-300 px-2.5 py-1.5 text-xs font-medium transition-colors dark:border-slate-600 ${
                    flipOrientation === "horizontal"
                      ? "bg-slate-900 text-white dark:bg-slate-50 dark:text-slate-900"
                      : "bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  }`}
                >
                  <FlipHorizontal2 className="size-3.5" />
                  {t("flipViewHorizontal")}
                </button>
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t("cardSettingsLabel")}
            </p>
            <div className="flex flex-col gap-3">
              <FaceCheckboxGroup title={t("frontSideLabel")} config={frontConfig} onChange={onFrontConfigChange} />
              <FaceCheckboxGroup title={t("backSideLabel")} config={backConfig} onChange={onBackConfigChange} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
