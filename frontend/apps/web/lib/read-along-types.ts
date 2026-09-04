// Shared between the extraction API route (app/api/read-along/extract/route.ts,
// server-side) and the read-along page (components/read-along-page.tsx,
// client-side) that consumes its response.

export type ReadAlongBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "image"; src: string; alt: string };

export interface ReadAlongExtractResult {
  title: string | null;
  blocks: ReadAlongBlock[];
}

export type ReadAlongExtractErrorCode =
  | "invalid_url"
  | "blocked_host"
  | "fetch_failed"
  | "not_html"
  | "container_not_found";

export interface ReadAlongExtractError {
  error: ReadAlongExtractErrorCode;
}
