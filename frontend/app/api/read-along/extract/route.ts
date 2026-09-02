import { JSDOM } from "jsdom";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { ReadAlongBlock, ReadAlongExtractErrorCode, ReadAlongExtractResult } from "@/lib/read-along-types";

// Lets the read-along page (components/read-along-page.tsx) accept a link to
// an article instead of pasted text — the student pastes e.g. a
// zpe.gov.pl lesson URL, this fetches it server-side (the browser can't due
// to CORS) and pulls the readable content out of whichever container the
// page actually uses (id="main-content" is what zpe.gov.pl itself renders
// into; id="content"/class="page-wrapper" are broader fallbacks for other
// sites built the same way).
//
// Excluded from the locale/auth middleware by its "/api" matcher (see
// middleware.ts) same as every other app/api/* route, so the access_token
// check below is this route's only gate against being used as an open
// fetch-any-URL proxy by a logged-out caller — a presence-only check, same
// weak-but-consistent guard middleware.ts itself uses; real authorization
// still happens per-request against the Django backend elsewhere.

const CONTAINER_SELECTORS = ["#main-content", "#content", ".page-wrapper"];

const TEXT_TAGS = new Set([
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "P",
  "LI",
  "BLOCKQUOTE",
  "FIGCAPTION",
  "DT",
  "DD",
  "CAPTION",
  "TD",
  "TH",
]);

const HIDDEN_CLASS_PATTERN = /sr-only|visually-hidden|screen-reader/i;
const HIDDEN_STYLE_PATTERN = /display\s*:\s*none|visibility\s*:\s*hidden/i;

const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 5_000_000;
const MAX_BLOCKS = 800;

function errorResponse(error: ReadAlongExtractErrorCode, status: number) {
  return NextResponse.json({ error }, { status });
}

// IPv4 loopback/private/link-local ranges, plus "localhost" and the IPv6
// loopback/link-local/unique-local equivalents. Best-effort SSRF guard (a
// literal check on the hostname the caller gave us, not on whatever it
// might resolve to at fetch time) — it stops the obvious "point this at
// localhost/an internal IP" cases without pretending to fully close off
// DNS-rebinding-style attacks.
function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) return true;

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
  }
  return false;
}

function isHidden(element: Element): boolean {
  if (element.getAttribute("aria-hidden") === "true") return true;
  if (element.hasAttribute("data-specifier-type")) return true; // zpe.gov.pl CMS editor metadata, never real content
  const style = element.getAttribute("style");
  if (style && HIDDEN_STYLE_PATTERN.test(style)) return true;
  const className = typeof element.className === "string" ? element.className : "";
  return HIDDEN_CLASS_PATTERN.test(className);
}

function resolveUrl(src: string, base: string): string | null {
  try {
    return new URL(src, base).href;
  } catch {
    return null;
  }
}

function collectBlocks(container: Element, pageUrl: string): ReadAlongBlock[] {
  const blocks: ReadAlongBlock[] = [];

  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      if (blocks.length >= MAX_BLOCKS) return;
      if (isHidden(child)) continue;

      if (child.tagName === "IMG") {
        const src = child.getAttribute("src");
        const resolved = src ? resolveUrl(src, pageUrl) : null;
        if (resolved) blocks.push({ type: "image", src: resolved, alt: (child.getAttribute("alt") ?? "").trim() });
        continue;
      }

      if (TEXT_TAGS.has(child.tagName)) {
        const text = (child.textContent ?? "").replace(/\s+/g, " ").trim();
        // Skip a block whose text is identical to the immediately preceding
        // one — this CMS duplicates an image's accessible description both
        // visibly-hidden and screen-reader-only right next to each other.
        const previous = blocks.at(-1);
        const isDuplicate = previous !== undefined && previous.type !== "image" && previous.text === text;
        if (text && !isDuplicate) {
          blocks.push({ type: child.tagName.startsWith("H") ? "heading" : "paragraph", text });
        }
        continue;
      }

      walk(child);
    }
  };

  walk(container);
  return blocks;
}

export async function POST(request: Request) {
  const accessToken = (await cookies()).get("access_token")?.value;
  if (!accessToken) return errorResponse("fetch_failed", 401);

  const { url } = (await request.json().catch(() => ({}))) as { url?: string };
  if (!url) return errorResponse("invalid_url", 400);

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return errorResponse("invalid_url", 400);
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return errorResponse("invalid_url", 400);
  }
  if (isBlockedHost(parsedUrl.hostname)) {
    return errorResponse("blocked_host", 400);
  }

  let html: string;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(parsedUrl.href, {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; SchoolAheadReadAlong/1.0)",
          Accept: "text/html",
        },
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) return errorResponse("fetch_failed", 502);

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !contentType.includes("html")) return errorResponse("not_html", 415);

    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (contentLength > MAX_RESPONSE_BYTES) return errorResponse("fetch_failed", 502);

    html = (await response.text()).slice(0, MAX_RESPONSE_BYTES);
  } catch {
    return errorResponse("fetch_failed", 502);
  }

  const dom = new JSDOM(html, { url: parsedUrl.href });
  const document = dom.window.document;

  let container: Element | null = null;
  for (const selector of CONTAINER_SELECTORS) {
    container = document.querySelector(selector);
    if (container) break;
  }
  if (!container) return errorResponse("container_not_found", 422);

  const blocks = collectBlocks(container, parsedUrl.href);
  if (blocks.length === 0) return errorResponse("container_not_found", 422);

  const firstHeading = blocks.find((block): block is Extract<ReadAlongBlock, { type: "heading" }> => block.type === "heading");
  const title = firstHeading?.text || document.title.trim() || null;

  const result: ReadAlongExtractResult = { title, blocks };
  return NextResponse.json(result);
}
