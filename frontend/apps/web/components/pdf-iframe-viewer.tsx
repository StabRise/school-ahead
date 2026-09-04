import { useTranslations } from "next-intl";

// Renders a PDF inline via the browser's native PDF viewer (an <iframe>),
// plus a download/open-in-new-tab fallback. Used by <Markdown embedPdf> for
// tutor-authored `<pdfiframe file="..." />` tags in lesson content — see
// markdown.tsx. Simpler and more robust than <PdfViewer> (pdfjs-dist) for a
// cross-origin file whose host doesn't send CORS headers: an <iframe>
// navigation isn't subject to the CORS restrictions a fetch()-based renderer
// would hit on a third-party PDF host.
export function PdfIframeViewer({ file, title }: { file: string; title?: string }) {
  const t = useTranslations("PdfIframeViewer");
  const iframeTitle = title || t("defaultTitle");

  return (
    <div className="not-prose flex w-full flex-col gap-2">
      <div className="h-[600px] w-full overflow-hidden rounded-2xl border-4 border-amber-200 shadow-lg">
        <iframe src={file} className="h-full w-full" title={iframeTitle} />
      </div>
      <a
        href={file}
        download
        target="_blank"
        rel="noreferrer"
        className="self-start rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
      >
        {t("downloadButton")}
      </a>
    </div>
  );
}
