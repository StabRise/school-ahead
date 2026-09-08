"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Settings } from "lucide-react";
import { CARD_FIELDS, type CardField, type CardFaceConfig } from "./card-face-config";

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
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {title}
      </p>
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

// What each side of a card shows (docs/preschool/games/cards.md) — term,
// translation, image, definition, any combination, independently for the
// front and the back. Drives both game modes: FlipCard's two faces in
// Навчання, and the question/option cards in Тест. Same
// gear-button-toggles-a-panel-that-closes-on-outside-click pattern as
// @school-ahead/preschool-games' CardsGame settings panel.
export function CardFaceSettingsPanel({
  frontConfig,
  onFrontConfigChange,
  backConfig,
  onBackConfigChange,
}: {
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
        aria-label={t("cardSettingsButton")}
        className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <Settings className="size-4" />
        {t("cardSettingsButton")}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full z-10 mt-2 flex w-64 flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <FaceCheckboxGroup title={t("frontSideLabel")} config={frontConfig} onChange={onFrontConfigChange} />
          <FaceCheckboxGroup title={t("backSideLabel")} config={backConfig} onChange={onBackConfigChange} />
        </div>
      )}
    </div>
  );
}
