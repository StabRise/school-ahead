"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Printer } from "lucide-react";
import { LocaleLink as Link } from "./kit/locale-link";
import { flashcardImageUrl, useFlashcardSet, type FlashcardItem } from "./lib/flashcards";
import { resolveVisibleCardFields, type CardFaceConfig } from "./card-face-config";
import { DefinitionMarkdown } from "./card-face-content";
import { useFlashcardsStore } from "./stores/flashcards-store";
import { flashcardTopicKey, useFlashcardTopicStore } from "./stores/flashcard-topic-store";
import {
  PRINT_GRID_FORMATS,
  printGridFormatKey,
  useFlashcardPrintFormatStore,
  type PrintGridFormat,
} from "./stores/flashcard-print-format-store";

const ALL_TOPICS = "all";

// Every literal Tailwind class this file could apply, keyed by the grid
// dimension it depends on — written out in full so Tailwind's static
// scanner (which reads this file's raw text, not runtime values) sees
// every candidate class regardless of which PrintGridFormat a student
// picks. A `grid-cols-${cols}` template string would never be found.
const COLS_CLASS: Record<PrintGridFormat["cols"], string> = { 4: "grid-cols-4" };
const ROWS_CLASS: Record<PrintGridFormat["rows"], string> = { 3: "grid-rows-3", 4: "grid-rows-4", 5: "grid-rows-5" };
// Denser formats (more rows) get a shorter card, so the starting (largest)
// font size still shrinks a tier at a time — PrintCardCell's auto-fit pass
// then shrinks further, per card, from whichever of these it started at.
const CELL_PADDING_CLASS: Record<PrintGridFormat["rows"], string> = { 3: "gap-1 p-[2mm]", 4: "gap-1 p-[1.5mm]", 5: "gap-0.5 p-[1mm]" };
const IMAGE_SIZE_CLASS: Record<PrintGridFormat["rows"], string> = { 3: "max-h-[22mm]", 4: "max-h-[16mm]", 5: "max-h-[12mm]" };
const TERM_BASE_PT: Record<PrintGridFormat["rows"], number> = { 3: 18, 4: 15, 5: 13 };
const DEFINITION_BASE_PT: Record<PrintGridFormat["rows"], number> = { 3: 12, 4: 10, 5: 8.5 };
// A card whose text doesn't fit its cell at the tier's base size (above)
// shrinks toward this floor rather than overflowing — see PrintCardCell's
// auto-fit effect.
const MIN_FONT_SCALE = 0.55;

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

// Pads a page's items out to exactly `pageSize` grid slots (nulls for the
// trailing empty cells on a partial last page) so front/back stay
// positionally aligned cell-for-cell regardless of how many cards actually
// landed on that page.
function toSlots(items: FlashcardItem[], pageSize: number): (FlashcardItem | null)[] {
  const slots: (FlashcardItem | null)[] = [...items];
  while (slots.length < pageSize) slots.push(null);
  return slots;
}

// Mirrors each row left-to-right, keeping row order — the back page's
// column order a "flip on long edge" duplex print needs so that after
// flipping the printed sheet over, every card's back lands directly behind
// its own front (see the on-screen duplex hint below).
function mirrorRowsForBack<T>(slots: T[], cols: number): T[] {
  const rows: T[][] = [];
  for (let i = 0; i < slots.length; i += cols) rows.push(slots.slice(i, i + cols));
  return rows.flatMap((row) => [...row].reverse());
}

// Starts each text field at its tier's (large) base size, then — once every
// card image on the page has settled (`imagesReady`, so a not-yet-loaded
// image doesn't make the cell look emptier than it'll actually be) —
// measures whether the cell's content overflows its fixed print-grid
// height and, if so, shrinks the fonts (not the image, which stays at its
// IMAGE_SIZE_CLASS cap) down toward MIN_FONT_SCALE until it fits. Runs as
// an imperative ref/style loop inside one useLayoutEffect rather than
// React state, so each shrink step's reflow can be measured synchronously
// (before paint) without an extra render per iteration.
function PrintCardCell({
  item,
  imageUrl,
  config,
  rows,
  imagesReady,
}: {
  item: FlashcardItem;
  imageUrl: string | null;
  config: CardFaceConfig;
  rows: PrintGridFormat["rows"];
  imagesReady: boolean;
}) {
  const shown = new Set(resolveVisibleCardFields(item, Boolean(imageUrl), config));
  const cellRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<HTMLParagraphElement>(null);
  const translationRef = useRef<HTMLParagraphElement>(null);
  const definitionRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const cell = cellRef.current;
    if (!cell) return;
    const candidates: ({ el: HTMLElement; base: number } | null)[] = [
      termRef.current && { el: termRef.current, base: TERM_BASE_PT[rows] },
      translationRef.current && { el: translationRef.current, base: TERM_BASE_PT[rows] },
      definitionRef.current && { el: definitionRef.current, base: DEFINITION_BASE_PT[rows] },
    ];
    const textEls = candidates.filter((entry): entry is { el: HTMLElement; base: number } => entry !== null);

    textEls.forEach(({ el, base }) => {
      el.style.fontSize = `${base}pt`;
    });
    if (!imagesReady || textEls.length === 0) return;

    let scale = 1;
    for (let i = 0; i < 6; i++) {
      const overflow = cell.scrollHeight - cell.clientHeight;
      if (overflow <= 0 || scale <= MIN_FONT_SCALE) break;
      const ratio = cell.clientHeight / cell.scrollHeight;
      const next = Math.max(MIN_FONT_SCALE, scale * ratio * 0.96);
      if (next >= scale - 0.005) break;
      scale = next;
      textEls.forEach(({ el, base }) => {
        el.style.fontSize = `${base * scale}pt`;
      });
    }
  }, [item.id, rows, imagesReady, config.term, config.translation, config.image, config.definition, imageUrl]);

  return (
    <div ref={cellRef} className={`flex h-full w-full flex-col items-center justify-center overflow-hidden text-center text-black ${CELL_PADDING_CLASS[rows]}`}>
      {shown.has("term") && (
        <p ref={termRef} className="leading-tight font-semibold" style={{ fontSize: `${TERM_BASE_PT[rows]}pt` }}>
          {item.term}
        </p>
      )}
      {shown.has("image") && imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className={`max-w-full object-contain ${IMAGE_SIZE_CLASS[rows]}`} />
      )}
      {shown.has("translation") && (
        <p ref={translationRef} className="leading-tight font-medium" style={{ fontSize: `${TERM_BASE_PT[rows]}pt` }}>
          {item.translation}
        </p>
      )}
      {shown.has("definition") && item.definition && (
        <div ref={definitionRef} className="leading-snug" style={{ fontSize: `${DEFINITION_BASE_PT[rows]}pt` }}>
          <DefinitionMarkdown content={item.definition} />
        </div>
      )}
    </div>
  );
}

function PrintPage({
  slots,
  resolveImage,
  config,
  format,
  imagesReady,
}: {
  slots: (FlashcardItem | null)[];
  resolveImage: (item: FlashcardItem) => string | null;
  config: CardFaceConfig;
  format: PrintGridFormat;
  imagesReady: boolean;
}) {
  return (
    <div className="print-sheet h-[297mm] w-[210mm] bg-white p-[10mm] shadow print:shadow-none">
      {/* No gap between cells and single-width lines everywhere (right/bottom
          per cell, left/top from this wrapper) — a doubled border at shared
          edges, or a gap between cards, would turn one straight scissors/paper-
          cutter pass per line into several. */}
      <div
        className={`grid h-full w-full border-t border-l border-dashed border-slate-300 print:border-slate-400 ${COLS_CLASS[format.cols]} ${ROWS_CLASS[format.rows]}`}
      >
        {slots.map((item, i) => (
          <div key={i} className="border-r border-b border-dashed border-slate-300 print:border-slate-400">
            {item && (
              <PrintCardCell item={item} imageUrl={resolveImage(item)} config={config} rows={format.rows} imagesReady={imagesReady} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// The printable-PDF companion to FlashcardGamePage (docs/preschool/games/
// cards.md) — /games/cards/<group>/<set>/print. Lays every card of the
// currently selected topic out on A4 sheets, one sheet of fronts (current
// frontConfig) immediately followed by one sheet of backs (backConfig,
// column-mirrored per row for double-sided printing — see
// mirrorRowsForBack), then the next page's front/back pair, and so on.
// Grid density (3×4/4×4/5×4 — see stores/flashcard-print-format-store.ts)
// is student-configurable via the toolbar's format dropdown, always 4
// cards wide since that's what the sheet's mm sizing is tuned for, with
// 3/4/5 rows trading card size for how many fit on a page. Reuses the
// same persisted
// topic/front/back config as the main game page
// (useFlashcardTopicStore/useFlashcardsStore) so "print what I'm currently
// studying" needs no extra setup. "Download" is the browser's own Print
// dialog (Save as PDF), same low-dependency approach as any other
// printable-worksheet page — no PDF library needed.
export function FlashcardPrintPage({ group, set }: { group: string; set: string }) {
  const t = useTranslations("FlashcardsGame");
  const { set: flashcardSet, isLoading } = useFlashcardSet(group, set);

  const topicByCardSet = useFlashcardTopicStore((s) => s.topicByCardSet);
  const setTopicForCardSet = useFlashcardTopicStore((s) => s.setTopic);
  const persistedTopic = topicByCardSet[flashcardTopicKey(group, set)] ?? ALL_TOPICS;
  const topic =
    persistedTopic === ALL_TOPICS || !flashcardSet || flashcardSet.categories.some((c) => c.title === persistedTopic)
      ? persistedTopic
      : ALL_TOPICS;
  const setTopic = useCallback((value: string) => setTopicForCardSet(group, set, value), [setTopicForCardSet, group, set]);

  const frontConfig = useFlashcardsStore((s) => s.frontConfig);
  const backConfig = useFlashcardsStore((s) => s.backConfig);
  const format = useFlashcardPrintFormatStore((s) => s.format);
  const setFormat = useFlashcardPrintFormatStore((s) => s.setFormat);

  const filteredCategories = useMemo(() => {
    if (!flashcardSet) return [];
    return topic === ALL_TOPICS ? flashcardSet.categories : flashcardSet.categories.filter((c) => c.title === topic);
  }, [flashcardSet, topic]);

  const items = useMemo((): FlashcardItem[] => filteredCategories.flatMap((c) => c.items), [filteredCategories]);
  const pageSize = format.rows * format.cols;
  const pages = useMemo(() => chunk(items, pageSize), [items, pageSize]);

  // Flattened front/back sheet pair per page, front immediately followed
  // by its back — rendered as direct DOM siblings (not nested in a
  // per-page wrapper) so globals.css's ".print-sheet + .print-sheet" page
  // break rule sees every sheet as adjacent to the one before it, page
  // boundaries included.
  const sheets = useMemo(
    () =>
      pages.flatMap((pageItems) => {
        const frontSlots = toSlots(pageItems, pageSize);
        return [
          { slots: frontSlots, config: frontConfig },
          { slots: mirrorRowsForBack(frontSlots, format.cols), config: backConfig },
        ];
      }),
    [pages, pageSize, format.cols, frontConfig, backConfig],
  );

  const resolveImage = useCallback(
    (item: FlashcardItem) => (item.image ? flashcardImageUrl(group, set, item.image) : null),
    [group, set],
  );

  // window.print() can fire before every card image has actually finished
  // loading over the network, printing blank placeholders — so the print
  // button stays disabled until every <img> currently on the page has
  // settled (loaded or errored). Readiness is keyed by what's actually on
  // the page (readinessKey) rather than reset with a synchronous setState
  // at the top of the effect — a stale key just fails the
  // `readyState.key === readinessKey` check below, the same "derive
  // isLoading from a key mismatch" shape lib/flashcards.ts's
  // useFlashcardSet uses (and it avoids reading a ref during render, which
  // a generation-counter ref would require).
  const containerRef = useRef<HTMLDivElement>(null);
  const readinessKey = useMemo(
    () => `${items.map((item) => item.id).join(",")}|${JSON.stringify(frontConfig)}|${JSON.stringify(backConfig)}`,
    [items, frontConfig, backConfig],
  );
  const [readyState, setReadyState] = useState({ key: "", ready: false });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const imgs = Array.from(container.querySelectorAll("img"));
    if (imgs.length === 0) {
      setReadyState({ key: readinessKey, ready: true });
      return;
    }
    let remaining = imgs.length;
    const onSettle = () => {
      remaining -= 1;
      if (remaining <= 0) setReadyState({ key: readinessKey, ready: true });
    };
    imgs.forEach((img) => {
      if (img.complete) onSettle();
      else {
        img.addEventListener("load", onSettle, { once: true });
        img.addEventListener("error", onSettle, { once: true });
      }
    });
  }, [readinessKey]);

  const imagesReady = readyState.key === readinessKey && readyState.ready;

  if (!flashcardSet) {
    return (
      <div className="p-6">
        <p className="text-sm text-slate-500 dark:text-slate-400">{isLoading ? t("loading") : t("notFound")}</p>
      </div>
    );
  }

  const topicOptions = [
    { value: ALL_TOPICS, label: t("allTopicsOption") },
    ...flashcardSet.categories.map((category) => ({ value: category.title, label: category.title })),
  ];
  const canPrint = imagesReady && items.length > 0;

  return (
    <div>
      <div className="print-no-export sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
        <div className="flex items-center gap-3">
          <Link
            href={`/games/cards/${encodeURIComponent(group)}/${encodeURIComponent(set)}`}
            aria-label={t("backToSetsButton")}
            title={t("backToSetsButton")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">{flashcardSet.title}</h2>
          <select
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          >
            {topicOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            value={printGridFormatKey(format)}
            onChange={(e) => {
              const next = PRINT_GRID_FORMATS.find((f) => printGridFormatKey(f) === e.target.value);
              if (next) setFormat(next);
            }}
            aria-label={t("printFormatLabel")}
            title={t("printFormatLabel")}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          >
            {PRINT_GRID_FORMATS.map((option) => (
              <option key={printGridFormatKey(option)} value={printGridFormatKey(option)}>
                {t("printFormatOption", { rows: option.rows, cols: option.cols, count: option.rows * option.cols })}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {items.length === 0 ? t("printNoItems") : t("printPagesInfo", { count: items.length, pages: sheets.length })}
          </p>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!canPrint}
            className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-200"
          >
            <Printer className="size-4" />
            {imagesReady ? t("printButton") : t("printPreparing")}
          </button>
        </div>
      </div>

      <p className="print-no-export px-4 py-2 text-xs text-slate-400 dark:text-slate-500">{t("printDuplexHint")}</p>

      <div ref={containerRef} className="flex flex-col items-center gap-6 bg-slate-100 py-6 print:gap-0 print:bg-white print:py-0 dark:bg-slate-950">
        {sheets.map((sheet, i) => (
          <PrintPage key={i} slots={sheet.slots} resolveImage={resolveImage} config={sheet.config} format={format} imagesReady={imagesReady} />
        ))}
      </div>
    </div>
  );
}
