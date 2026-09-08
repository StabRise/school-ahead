import { create } from "zustand";
import { persist } from "zustand/middleware";

// Grid layouts FlashcardPrintPage lets a student pick between — columns
// stay fixed at 4 (the card width the print sheet's mm sizing is tuned
// for, docs/preschool/games/cards.md's original "4 per row" spec) while
// rows vary to trade card size for how many fit on one A4 sheet.
export interface PrintGridFormat {
  rows: 3 | 4 | 5;
  cols: 4;
}

export const PRINT_GRID_FORMATS: PrintGridFormat[] = [
  { rows: 3, cols: 4 },
  { rows: 4, cols: 4 },
  { rows: 5, cols: 4 },
];

export const DEFAULT_PRINT_GRID_FORMAT: PrintGridFormat = PRINT_GRID_FORMATS[0];

export function printGridFormatKey(format: PrintGridFormat): string {
  return `${format.rows}x${format.cols}`;
}

// A student's chosen print density — not tied to any one set, same as
// stores/flashcards-store.ts's frontConfig/backConfig, so it's persisted
// and shared across every set's print page.
interface FlashcardPrintFormatState {
  format: PrintGridFormat;
  setFormat: (format: PrintGridFormat) => void;
}

export const useFlashcardPrintFormatStore = create<FlashcardPrintFormatState>()(
  persist(
    (set) => ({
      format: DEFAULT_PRINT_GRID_FORMAT,
      setFormat: (format) => set({ format }),
    }),
    { name: "flashcard-print-format-store" },
  ),
);
