"use client";

import { useEffect, useState } from "react";
import { parseStory, type Story, type StorySummary } from "./story-parser";

export type { Story, StorySummary, StoryWordSegment } from "./story-parser";

const storiesCache = new Map<string, Promise<StorySummary[]>>();

// Bumped by invalidateStories() — every mounted useStories/useStory
// refetches, e.g. once a tutor makes a story a draft (stories-game.tsx), so
// it disappears from the picker without a page reload.
const invalidationListeners = new Set<() => void>();

export function invalidateStories(): void {
  storiesCache.clear();
  storyCache.clear();
  invalidationListeners.forEach((listener) => listener());
}

function useInvalidationVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const listener = () => setVersion((current) => current + 1);
    invalidationListeners.add(listener);
    return () => {
      invalidationListeners.delete(listener);
    };
  }, []);
  return version;
}

function fetchStories(dbOnly: boolean): Promise<StorySummary[]> {
  const cacheKey = dbOnly ? "db" : "all";
  let cached = storiesCache.get(cacheKey);
  if (!cached) {
    const url = dbOnly ? "/api/stories?source=db" : "/api/stories";
    cached = fetch(url)
      .then((res) => res.json())
      .then((data: { stories: StorySummary[] }) => data.stories)
      .catch(() => []);
    storiesCache.set(cacheKey, cached);
  }
  return cached;
}

// The "Казки" minigame's story list — every <slug>/story.md under
// public/static/stories plus every published tutor-authored Story (see
// /api/stories) — fetched once per `dbOnly` and cached module-wide. Empty
// until the fetch resolves. `dbOnly` (the "Storybook" games/storybook page,
// see game-play-page.tsx's StorybookGamePage) drops the static folk-tale
// set, listing only tutor-authored DB stories.
export function useStories(dbOnly = false): StorySummary[] {
  const [stories, setStories] = useState<StorySummary[]>([]);
  const version = useInvalidationVersion();

  useEffect(() => {
    let cancelled = false;
    void fetchStories(dbOnly).then((result) => {
      if (!cancelled) setStories(result);
    });
    return () => {
      cancelled = true;
    };
  }, [dbOnly, version]);

  return stories;
}

const storyCache = new Map<string, Promise<Story | null>>();

function fetchStory(slug: string, dbOnly: boolean): Promise<Story | null> {
  const cacheKey = `${dbOnly ? "db" : "all"}:${slug}`;
  let cached = storyCache.get(cacheKey);
  if (!cached) {
    const url = `/api/story?slug=${encodeURIComponent(slug)}${dbOnly ? "&source=db" : ""}`;
    cached = fetch(url)
      .then((res) => res.json())
      .then((data: { id?: number | null; content: string | null }) =>
        data.content
          ? {
              ...parseStory(data.content),
              ...(data.id != null ? { id: data.id } : {}),
            }
          : null,
      )
      .catch(() => null);
    storyCache.set(cacheKey, cached);
  }
  return cached;
}

// One story's parsed title+subtitle+body, cached module-wide. `null` while
// `slug` is null, still loading (including right after it changes), or
// once loaded, if the folder/story.md turned out not to exist (or, with
// `dbOnly`, isn't a DB story — see /api/story's `source=db`, which skips
// its static-folder fallback). Any image a "{...}" reference names (see
// StoryWordSegment's "image" kind, resolved while rendering the body — see
// stories-game.tsx) is resolved by the caller directly from `slug`
// (public/static/stories/<slug>/<filename>) — there's no separate lookup
// to fetch for it.
export function useStory(slug: string | null, dbOnly = false): Story | null {
  const [loaded, setLoaded] = useState<{
    slug: string | null;
    story: Story | null;
  }>({ slug: null, story: null });
  const version = useInvalidationVersion();

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    void fetchStory(slug, dbOnly).then((result) => {
      if (!cancelled) setLoaded({ slug, story: result });
    });
    return () => {
      cancelled = true;
    };
  }, [slug, dbOnly, version]);

  return loaded.slug === slug ? loaded.story : null;
}
