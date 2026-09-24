"use client";

import { useLocale } from "next-intl";
import type { QuizLanguage } from "@school-ahead/api-client/browser/schoolAheadAPI.schemas";

// Backend lessons.models.QuizLanguage — the languages a Story or a Syllable
// card can be in. Ukrainian first: it's the default everywhere.
export const CONTENT_LANGUAGES: readonly QuizLanguage[] = ["uk", "en", "pl", "es"];

// The language picker next to the tutor Stories / Syllables "Імпортувати
// ZIP" buttons and in the story editor. Names come from Intl.DisplayNames
// in the interface language, like the subtitles panel's dropdown.
export function ContentLanguageSelect({
  value,
  onChange,
  id,
  ariaLabel,
  disabled,
  className = "rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-700 disabled:opacity-50",
}: {
  value: QuizLanguage;
  onChange: (language: QuizLanguage) => void;
  id?: string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  const locale = useLocale();
  const languageName = (code: string) => {
    try {
      const name = new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code;
      return name.charAt(0).toUpperCase() + name.slice(1);
    } catch {
      return code;
    }
  };

  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value as QuizLanguage)}
      aria-label={ariaLabel}
      disabled={disabled}
      className={className}
    >
      {CONTENT_LANGUAGES.map((code) => (
        <option key={code} value={code}>
          {languageName(code)}
        </option>
      ))}
    </select>
  );
}
