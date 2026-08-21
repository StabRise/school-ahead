"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { PDFDocumentProxy } from "pdfjs-dist";

// Renders a PDF inline, one page at a time, using pdfjs-dist directly (no
// react-pdf wrapper). Used by <Markdown embedPdf> for tutor-authored
// `<pdfviewer file="..." />` tags in lesson content — see markdown.tsx,
// which mounts this keyed by `file` so switching documents remounts fresh
// state rather than needing an effect to reset it.
// pdfjs-dist itself is only ever imported inside an effect, so nothing here
// touches browser-only APIs (Worker, canvas) during server rendering.
//
// For a cross-origin PDF whose host doesn't send CORS headers, this can't
// load it (pdfjs-dist fetches the file itself) — use <PdfIframeViewer>
// (`<pdfiframe file="..." />`) instead, which renders via the browser's
// native PDF viewer and isn't subject to that restriction.
export function PdfViewer({ file }: { file: string }) {
  const t = useTranslations("PdfViewer");
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();

      try {
        const doc = await pdfjsLib.getDocument({ url: file }).promise;
        if (!cancelled) setPdfDoc(doc);
      } catch {
        if (!cancelled) setError(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [file]);

  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;

    (async () => {
      const page = await pdfDoc.getPage(pageNumber);
      if (cancelled) return;

      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context) return;

      const containerWidth = containerRef.current?.clientWidth ?? 600;
      const unscaledViewport = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: containerWidth / unscaledViewport.width });

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: context, viewport, canvas }).promise;
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageNumber]);

  if (error) {
    return (
      <div className="not-prose rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        {t("loadError")}{" "}
        <a href={file} target="_blank" rel="noreferrer" className="underline">
          {t("openInNewTab")}
        </a>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="not-prose flex w-full flex-col items-center gap-2 rounded-md border border-gray-200 p-3"
    >
      {!pdfDoc && <p className="text-sm text-gray-500">{t("loading")}</p>}
      <canvas ref={canvasRef} className="max-w-full shadow-sm" />
      {pdfDoc && pdfDoc.numPages > 1 && (
        <div className="flex items-center gap-3 text-sm">
          <button
            type="button"
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber((page) => page - 1)}
            className="rounded-md border border-gray-300 px-2 py-1 disabled:opacity-50"
          >
            ‹
          </button>
          <span>
            {pageNumber} / {pdfDoc.numPages}
          </span>
          <button
            type="button"
            disabled={pageNumber >= pdfDoc.numPages}
            onClick={() => setPageNumber((page) => page + 1)}
            className="rounded-md border border-gray-300 px-2 py-1 disabled:opacity-50"
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}
