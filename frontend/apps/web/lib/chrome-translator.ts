// Wraps Chrome's built-in on-device Translator API (self.Translator — see
// https://developer.chrome.com/docs/ai/translator-api), the same engine
// behind Chrome's right-click "Translate to..." context menu item. Used by
// read-along-content.tsx's "Перекласти" selection button. The API only
// exists in recent Chrome builds, so callers must feature-detect via
// isTranslatorSupported() before use.
import type { SpeechLanguage } from "@school-ahead/api-client";

interface ChromeTranslator {
  translate(text: string): Promise<string>;
}

interface ChromeTranslatorStatic {
  create(options: { sourceLanguage: string; targetLanguage: string }): Promise<ChromeTranslator>;
}

declare global {
  interface Window {
    Translator?: ChromeTranslatorStatic;
  }
}

export function isTranslatorSupported(): boolean {
  return typeof window !== "undefined" && "Translator" in window;
}

// One translator per source/target pair, reused across calls — creating one
// can trigger an on-device language-pack download, so it's worth not
// repeating per selection. Failed creations are evicted so a later retry
// (e.g. once the language pack finishes downloading) isn't stuck rejecting.
const translators = new Map<string, Promise<ChromeTranslator>>();

function getTranslator(sourceLanguage: string, targetLanguage: string): Promise<ChromeTranslator> {
  const key = `${sourceLanguage}:${targetLanguage}`;
  let pending = translators.get(key);
  if (!pending) {
    pending = window.Translator!.create({ sourceLanguage, targetLanguage }).catch((error: unknown) => {
      translators.delete(key);
      throw error;
    });
    translators.set(key, pending);
  }
  return pending;
}

export async function translateText(
  text: string,
  sourceLanguage: SpeechLanguage,
  targetLanguage: SpeechLanguage,
): Promise<string> {
  const translator = await getTranslator(sourceLanguage, targetLanguage);
  return translator.translate(text);
}
