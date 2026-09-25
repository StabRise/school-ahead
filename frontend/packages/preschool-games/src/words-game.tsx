"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { speak, type SpeechLanguage } from "@school-ahead/api-client";
import { useRewardWordsGame } from "@school-ahead/api-client/browser/auth/auth";
import {
  useListReadingConsonants,
  useListReadingSyllables,
} from "@school-ahead/api-client/browser/reading/reading";
import { PreschoolButton } from "@school-ahead/preschool-ui";
import { GAME_SETTINGS_BUTTON_POSITION, GAME_SETTINGS_PANEL_POSITION } from "./kit/game-controls";
import { playCelebrationChime, playMatchSound, playMissSound } from "./kit/sound-effects";
import { FullscreenOverlay } from "./kit/fullscreen-overlay";
import { useDiamondMilestoneReward } from "./kit/use-diamond-milestone-reward";
import { WordCardRow, lgCardSizeRem } from "./lib/syllable-card";
import {
  isVowel,
  splitIntoReadingSegments,
  syllableForDisplay,
  toWordsGameCards,
  WORDS_GAME_DIAMOND_THRESHOLD,
  type WordsGameCard,
} from "./lib/words-game";
import { useWordsGameStore, type WordsGameShow } from "./stores/words-game-store";

// The "Слова" (Words) minigame at /games/words — see docs/preschool/games/
// words.md. One reading.Syllable card at a time: its syllable in big
// colored letters (consonant blue, vowel red), its picture, and its word
// broken into syllable cards the way the "Казки" stories write them
// (lib/syllable-card.tsx's WordCardRow). ◀ / ▶ on the sides flip through
// the chosen letter's cards; ✅ / ❌ at the bottom are for whoever listens
// to the child read (✅ moves on, ❌ reads the card aloud to help). Every
// 30 cards looked at award a Diamond; the counter top-right shows how many.

// Backend lessons.models.QuizLanguage — also the Piper voices TTS has.
const GAME_LANGUAGES: readonly SpeechLanguage[] = ["uk", "en", "pl", "es"];

// The handwriting ("прописні") font for the syllable, per language — the
// @font-face rules live in apps/web's globals.css. A language missing here
// has print only, and the setting is hidden for it.
const HANDWRITING_FONTS: Partial<Record<SpeechLanguage, string>> = {
  uk: '"Propysy", cursive',
  pl: '"Elementarz", cursive',
};

export function WordsGame() {
  const t = useTranslations("WordsGame");
  const locale = useLocale();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsPanelRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const counterRef = useRef<HTMLDivElement>(null);
  // Cards looked at this visit, across every letter — the Diamond counter.
  const [seen, setSeen] = useState(0);

  const language = useWordsGameStore((s) => s.language);
  const setLanguage = useWordsGameStore((s) => s.setLanguage);
  const storedConsonant = useWordsGameStore((s) => s.consonant);
  const setConsonant = useWordsGameStore((s) => s.setConsonant);
  const muted = useWordsGameStore((s) => s.muted);
  const setMuted = useWordsGameStore((s) => s.setMuted);
  const show = useWordsGameStore((s) => s.show);
  const setShow = useWordsGameStore((s) => s.setShow);
  const handwriting = useWordsGameStore((s) => s.handwriting);
  const setHandwriting = useWordsGameStore((s) => s.setHandwriting);
  const wordHandwriting = useWordsGameStore((s) => s.wordHandwriting);
  const setWordHandwriting = useWordsGameStore((s) => s.setWordHandwriting);
  const handwritingFont = HANDWRITING_FONTS[language];

  const consonantsQuery = useListReadingConsonants({ language }, { query: { staleTime: Infinity } });
  const consonants = useMemo(
    () => [...(consonantsQuery.data ?? [])].sort((a, b) => a.localeCompare(b, language)),
    [consonantsQuery.data, language],
  );
  // A letter persisted from an earlier visit (or another language) that
  // this language has no cards for falls back to its first letter.
  const consonant = consonants.includes(storedConsonant) ? storedConsonant : (consonants[0] ?? "");

  const syllablesQuery = useListReadingSyllables(
    { consonant, language },
    { query: { enabled: consonant !== "", staleTime: Infinity } },
  );
  const cards = useMemo(() => toWordsGameCards(syllablesQuery.data ?? [], language), [syllablesQuery.data, language]);
  const isLoading = consonantsQuery.isLoading || (consonant !== "" && syllablesQuery.isLoading);

  // Closes the settings panel on a click/tap outside it — same pattern as
  // reading-game.tsx.
  useEffect(() => {
    if (!settingsOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (settingsPanelRef.current?.contains(target)) return;
      if (settingsButtonRef.current?.contains(target)) return;
      setSettingsOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [settingsOpen]);

  const rewardWordsGame = useRewardWordsGame();
  useDiamondMilestoneReward({
    mode: "count",
    count: seen,
    threshold: WORDS_GAME_DIAMOND_THRESHOLD,
    rewardMutation: rewardWordsGame,
    originRef: counterRef,
    onMilestone: playCelebrationChime,
  });

  const languageName = (code: string) => {
    try {
      const name = new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code;
      return name.charAt(0).toUpperCase() + name.slice(1);
    } catch {
      return code;
    }
  };

  return (
    <div className="relative flex flex-1 flex-col">
      <button
        ref={settingsButtonRef}
        type="button"
        aria-label={t("settingsButton")}
        onClick={() => setSettingsOpen((current) => !current)}
        className={`${GAME_SETTINGS_BUTTON_POSITION} flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white text-lg shadow-lg ring-2 ring-gray-200`}
      >
        ⚙️
      </button>

      {settingsOpen && (
        <div
          ref={settingsPanelRef}
          className={`${GAME_SETTINGS_PANEL_POSITION} flex w-60 flex-col gap-3 rounded-2xl bg-white p-4 text-sm shadow-lg ring-2 ring-gray-200`}
        >
          <label className="flex flex-col gap-1">
            <span className="font-medium text-gray-700">{t("languageLabel")}</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as SpeechLanguage)}
              className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700"
            >
              {GAME_LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {languageName(code)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-gray-700">{t("letterLabel")}</span>
            <select
              value={consonant}
              onChange={(e) => setConsonant(e.target.value)}
              disabled={consonants.length === 0}
              className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 disabled:opacity-50"
            >
              {consonants.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 font-medium text-gray-700">{t("showLabel")}</legend>
            {(["syllable", "icon", "word"] as const).map((part) => (
              <div key={part} className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={show[part]} onChange={(e) => setShow(part, e.target.checked)} />
                  <span className="text-gray-700">{t(`show.${part}`)}</span>
                </label>
                {/* How the syllable / word is written — only for a language
                    with a handwriting font. */}
                {handwritingFont && part === "syllable" && (
                  <select
                    value={handwriting ? "handwriting" : "print"}
                    onChange={(e) => setHandwriting(e.target.value === "handwriting")}
                    disabled={!show.syllable}
                    aria-label={t("syllableStyleLabel")}
                    className={STYLE_SELECT_CLASS}
                  >
                    <option value="print">{t("letterStylePrint")}</option>
                    <option value="handwriting">{t("letterStyleHandwriting")}</option>
                  </select>
                )}
                {handwritingFont && part === "word" && (
                  <select
                    value={wordHandwriting ? "handwriting" : "cards"}
                    onChange={(e) => setWordHandwriting(e.target.value === "handwriting")}
                    disabled={!show.word}
                    aria-label={t("wordStyleLabel")}
                    className={STYLE_SELECT_CLASS}
                  >
                    <option value="cards">{t("wordStyleCards")}</option>
                    <option value="handwriting">{t("letterStyleHandwriting")}</option>
                  </select>
                )}
              </div>
            ))}
          </fieldset>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={muted} onChange={(e) => setMuted(e.target.checked)} />
            <span className="font-medium text-gray-700">{t("mutedLabel")}</span>
          </label>
        </div>
      )}

      <div
        ref={counterRef}
        role="status"
        aria-label={t("counterLabel", { count: seen })}
        className="pointer-events-none absolute right-4 top-14 z-10 flex items-center gap-1 rounded-full bg-white px-3 py-2 shadow-lg ring-2 ring-sky-200"
      >
        <span aria-hidden="true" className="text-lg">
          🃏
        </span>
        <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-sky-500 px-2 text-sm font-extrabold text-white">
          {seen}
        </span>
      </div>

      {isLoading ? null : cards.length === 0 ? (
        <p className="m-auto text-center text-lg font-semibold text-gray-500">{t("empty")}</p>
      ) : (
        <WordsDeck
          key={`${language}:${consonant}`}
          cards={cards}
          language={language}
          muted={muted}
          show={show}
          syllableFont={handwriting ? handwritingFont : undefined}
          wordFont={wordHandwriting ? handwritingFont : undefined}
          onCardShown={() => setSeen((current) => current + 1)}
        />
      )}
    </div>
  );
}

// One letter's deck — remounted (key) when the language/letter changes, so
// it starts back at the first card without an effect resetting it.
function WordsDeck({
  cards,
  language,
  muted,
  show,
  syllableFont,
  wordFont,
  onCardShown,
}: {
  cards: WordsGameCard[];
  language: SpeechLanguage;
  muted: boolean;
  show: WordsGameShow;
  // A handwriting font-family for the syllable; print when undefined.
  syllableFont?: string;
  // A handwriting font-family for the word, written out as text in place
  // of its syllable cards; cards when undefined.
  wordFont?: string;
  onCardShown: () => void;
}) {
  const t = useTranslations("WordsGame");
  const [index, setIndex] = useState(0);
  // The word's syllable-card row blown up full-screen, like a tapped
  // "Казки" story card (stories-game.tsx's StoryBody).
  const [wordOpen, setWordOpen] = useState(false);
  const card = cards[index];
  const wordSegments = useMemo(
    () => splitIntoReadingSegments(card.word).map((text) => ({ kind: "text" as const, text })),
    [card.word],
  );

  // The first card counts as looked at the moment the deck appears; every
  // flip after that counts in `go` below. The ref keeps React's dev-mode
  // double effect run from counting it twice.
  const firstCardCountedRef = useRef(false);
  const onCardShownRef = useRef(onCardShown);
  useEffect(() => {
    onCardShownRef.current = onCardShown;
  });
  useEffect(() => {
    if (firstCardCountedRef.current) return;
    firstCardCountedRef.current = true;
    onCardShownRef.current();
  }, []);

  const go = (delta: number) => {
    setIndex((current) => (current + delta + cards.length) % cards.length);
    onCardShown();
  };

  const playSyllable = () => {
    if (muted) return Promise.resolve();
    if (card.syllableAudio) return playUrl(card.syllableAudio);
    speak(card.syllable, language, "short");
    return Promise.resolve();
  };
  const playWord = () => {
    if (muted) return;
    if (card.wordAudio) void playUrl(card.wordAudio);
    else speak(card.word, language, "short");
  };

  const handleRight = () => {
    playMatchSound();
    go(1);
  };
  const handleWrong = () => {
    playMissSound();
    // Reads the card aloud so the child hears how it sounds.
    void playSyllable().then(playWord);
  };

  return (
    <>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-16 pb-28 pt-6 sm:gap-6">
        {show.syllable && (
          <button
            type="button"
            onClick={() => void playSyllable()}
            aria-label={t("syllableLabel", { syllable: card.syllable })}
            style={syllableFont ? { fontFamily: syllableFont } : undefined}
            className={`cursor-pointer text-[6rem] leading-none sm:text-[9rem] ${
              syllableFont ? "font-normal" : "font-extrabold tracking-wider"
            }`}
          >
            {[...syllableForDisplay(card.syllable, language)].map((letter, letterIndex) => (
              <span key={letterIndex} style={{ color: isVowel(letter) ? "#dc2626" : "#0369a1" }}>
                {letter}
              </span>
            ))}
          </button>
        )}

        {show.icon && (
          <button type="button" onClick={playWord} aria-label={card.word} className="cursor-pointer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={card.image}
              alt=""
              draggable={false}
              className="h-28 w-28 rounded-2xl bg-white object-contain shadow-lg ring-4 ring-amber-200 sm:h-40 sm:w-40"
            />
          </button>
        )}

        {show.word && (
          <button
            type="button"
            onClick={() => {
              playWord();
              setWordOpen(true);
            }}
            aria-label={card.word}
            className="cursor-pointer"
          >
            {wordFont ? (
              <HandwrittenWord word={card.word} font={wordFont} sizeRem={handwrittenWordSizeRem(card.word)} />
            ) : (
              <WordCardRow segments={wordSegments} size="lg" cardSizeRem={wordCardSizeRem(card.word)} />
            )}
          </button>
        )}
      </div>

      {wordOpen && (
        <FullscreenOverlay onClose={() => setWordOpen(false)} closeLabel={t("closeWordLabel")}>
          {wordFont ? (
            <HandwrittenWord
              word={card.word}
              font={wordFont}
              sizeRem={handwrittenWordSizeRem(card.word) * 2}
              className="rounded-3xl bg-white px-8 py-4 shadow-lg"
            />
          ) : (
            <WordCardRow segments={wordSegments} size="lg" cardSizeRem={lgCardSizeRem(wordSegments.length)} />
          )}
        </FullscreenOverlay>
      )}

      <div className="fixed inset-y-0 left-4 z-30 flex items-center">
        <PreschoolButton
          icon="◀"
          label={t("previousButton")}
          onClick={() => go(-1)}
          compact={false}
          sizeClassName="h-16 w-16"
          ringColorClassName="ring-sky-400"
          position="static"
          className="text-sky-600"
        />
      </div>
      <div className="fixed inset-y-0 right-4 z-30 flex items-center">
        <PreschoolButton
          icon="▶"
          label={t("nextButton")}
          onClick={() => go(1)}
          compact={false}
          sizeClassName="h-16 w-16"
          ringColorClassName="ring-sky-400"
          position="static"
          className="text-sky-600"
        />
      </div>

      <div className="fixed inset-x-0 bottom-6 z-30 flex justify-center gap-8">
        <PreschoolButton
          icon="✅"
          label={t("rightButton")}
          onClick={handleRight}
          compact={false}
          sizeClassName="h-20 w-20"
          ringColorClassName="ring-emerald-400"
          position="static"
        />
        <PreschoolButton
          icon="❌"
          label={t("wrongButton")}
          onClick={handleWrong}
          compact={false}
          sizeClassName="h-20 w-20"
          ringColorClassName="ring-rose-400"
          position="static"
        />
      </div>
    </>
  );
}

const STYLE_SELECT_CLASS =
  "rounded-lg border border-gray-300 bg-white px-1.5 py-0.5 text-xs text-gray-700 disabled:opacity-50";

// The word written out in a handwriting font, one color so the cursive
// letters stay joined — the "Прописні" word style.
function HandwrittenWord({
  word,
  font,
  sizeRem,
  className = "",
}: {
  word: string;
  font: string;
  sizeRem: number;
  className?: string;
}) {
  return (
    <span
      style={{ fontFamily: font, fontSize: `${sizeRem}rem` }}
      className={`block whitespace-nowrap leading-tight text-gray-800 ${className}`}
    >
      {word}
    </span>
  );
}

// Handwritten words shrink with length like the word cards below, so a long
// word still fits a phone screen.
function handwrittenWordSizeRem(word: string): number {
  return Math.max(2.5, Math.min(5, 30 / Math.max(word.length, 1)));
}

// Word cards shrink as the word gets longer so the row always fits a phone
// screen — 5rem for a 2-card word, down to 2.75rem (the stories' inline size).
function wordCardSizeRem(word: string): number {
  const count = splitIntoReadingSegments(word).length;
  return Math.max(2.75, Math.min(5, 18 / Math.max(count, 1)));
}

function playUrl(url: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const audio = new Audio(url);
      audio.addEventListener("ended", () => resolve(), { once: true });
      audio.addEventListener("error", () => resolve(), { once: true });
      void audio.play().catch(() => resolve());
    } catch {
      resolve();
    }
  });
}
