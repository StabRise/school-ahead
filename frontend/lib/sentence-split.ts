// Splits text into sentences so a page can render each sentence as its own
// highlightable span while handing the same sentences to piper-tts's
// speakSequence() (lib/piper-tts.ts) for read-aloud playback with
// per-sentence progress. Used both for pasted plain text (paragraph by
// paragraph) and for a single block of text already extracted from a web
// page (see app/api/read-along/extract/route.ts).

export interface SentenceSplitParagraph {
  sentences: string[];
}

// Same punctuation set across English, Ukrainian, and Polish (Latin
// full stop/question/exclamation marks plus the ellipsis character), so one
// regex covers all three supported languages.
const SENTENCE_BOUNDARY = /(?<=[.!?…])\s+/;

export function splitIntoSentences(text: string): string[] {
  return text
    .split(SENTENCE_BOUNDARY)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function splitIntoSentenceParagraphs(text: string): SentenceSplitParagraph[] {
  return text
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => ({ sentences: splitIntoSentences(paragraph) }))
    .filter((paragraph) => paragraph.sentences.length > 0);
}
