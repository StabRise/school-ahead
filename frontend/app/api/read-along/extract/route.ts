import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
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
// Uses cheerio rather than jsdom: jsdom pulls in css-tree, which loads a
// data file via a runtime-relative require() that Turbopack's production
// bundler can't resolve ("Cannot find module '../data/patch.json'") even
// with serverExternalPackages — reproduced in the Docker build though not
// in a plain local `bun run build`. cheerio's whole dependency tree
// (parse5/htmlparser2 + friends) only requires other JS modules, never a
// bare relative data file, so it doesn't hit that class of bug.
//
// Excluded from the locale/auth middleware by its "/api" matcher (see
// middleware.ts) same as every other app/api/* route, so the access_token
// check below is this route's only gate against being used as an open
// fetch-any-URL proxy by a logged-out caller — a presence-only check, same
// weak-but-consistent guard middleware.ts itself uses; real authorization
// still happens per-request against the Django backend elsewhere.

const CONTAINER_SELECTORS = ["#main-content", "#content", ".page-wrapper"];

const TEXT_TAGS = new Set([
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "li",
  "blockquote",
  "figcaption",
  "dt",
  "dd",
  "caption",
  "td",
  "th",
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

function isHidden($: cheerio.CheerioAPI, element: Element): boolean {
  const $el = $(element);
  if ($el.attr("aria-hidden") === "true") return true;
  if ($el.attr("data-specifier-type") !== undefined) return true; // zpe.gov.pl CMS editor metadata, never real content
  const style = $el.attr("style");
  if (style && HIDDEN_STYLE_PATTERN.test(style)) return true;
  return HIDDEN_CLASS_PATTERN.test($el.attr("class") ?? "");
}

function resolveUrl(src: string, base: string): string | null {
  try {
    return new URL(src, base).href;
  } catch {
    return null;
  }
}

function isElement(node: AnyNode): node is Element {
  return node.type === "tag" || node.type === "script" || node.type === "style";
}

function collectBlocks($: cheerio.CheerioAPI, container: Element, pageUrl: string): ReadAlongBlock[] {
  const blocks: ReadAlongBlock[] = [];

  const walk = (node: Element) => {
    for (const child of node.children) {
      if (blocks.length >= MAX_BLOCKS) return;
      if (!isElement(child)) continue;
      if (isHidden($, child)) continue;

      const tagName = child.tagName.toLowerCase();

      if (tagName === "img") {
        const src = $(child).attr("src");
        const resolved = src ? resolveUrl(src, pageUrl) : null;
        if (resolved) blocks.push({ type: "image", src: resolved, alt: ($(child).attr("alt") ?? "").trim() });
        continue;
      }

      if (TEXT_TAGS.has(tagName)) {
        const text = $(child).text().replace(/\s+/g, " ").trim();
        // Skip a block whose text is identical to the immediately preceding
        // one — this CMS duplicates an image's accessible description both
        // visibly-hidden and screen-reader-only right next to each other.
        const previous = blocks.at(-1);
        const isDuplicate = previous !== undefined && previous.type !== "image" && previous.text === text;
        if (text && !isDuplicate) {
          blocks.push({ type: tagName.startsWith("h") ? "heading" : "paragraph", text });
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

  const $ = cheerio.load(html);

  let container: Element | undefined;
  for (const selector of CONTAINER_SELECTORS) {
    const found = $(selector).get(0);
    if (found && isElement(found)) {
      container = found;
      break;
    }
  }
  if (!container) return errorResponse("container_not_found", 422);

  const blocks = collectBlocks($, container, parsedUrl.href);
  if (blocks.length === 0) return errorResponse("container_not_found", 422);

  const firstHeading = blocks.find((block): block is Extract<ReadAlongBlock, { type: "heading" }> => block.type === "heading");
  const title = firstHeading?.text || $("title").first().text().trim() || null;

  const result: ReadAlongExtractResult = { title, blocks };
  return NextResponse.json(result);
}
