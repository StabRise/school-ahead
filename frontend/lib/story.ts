"use client";

import { useEffect, useState } from "react";
import { parseStory, type Story, type StorySummary } from "@/lib/story-parser";

export type { Story, StorySummary, StoryParagraph, StoryParagraphPart, StoryWordSegment } from "@/lib/story-parser";

// A loaded story plus its resolved "[Image #N]" -> URL lookup (see
// /api/story and lib/story-parser.ts's "image" part kind) — keyed by the
// same number a paragraph's `{ kind: "image", number }` part carries. A
// number missing from this map means the referenced photo hasn't been
// uploaded yet.
export interface LoadedStory extends Story {
  images: Record<number, string>;
}

let storiesPromise: Promise<StorySummary[]> | null = null;

function fetchStories(): Promise<StorySummary[]> {
  if (!storiesPromise) {
    storiesPromise = fetch("/api/stories")
      .then((res) => res.json())
      .then((data: { stories: StorySummary[] }) => data.stories)
      .catch(() => []);
  }
  return storiesPromise;
}

// The "Казки" minigame's full story list — every .md file under
// public/static/stories (see /api/stories), fetched once and cached
// module-wide. Empty until the fetch resolves.
export function useStories(): StorySummary[] {
  const [stories, setStories] = useState<StorySummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetchStories().then((result) => {
      if (!cancelled) setStories(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return stories;
}

const storyCache = new Map<string, Promise<LoadedStory | null>>();

function fetchStory(slug: string): Promise<LoadedStory | null> {
  let cached = storyCache.get(slug);
  if (!cached) {
    cached = fetch(`/api/story?slug=${encodeURIComponent(slug)}`)
      .then((res) => res.json())
      .then((data: { content: string | null; images: Record<number, string> }) =>
        data.content ? { ...parseStory(data.content), images: data.images } : null,
      )
      .catch(() => null);
    storyCache.set(slug, cached);
  }
  return cached;
}

// One story's parsed title+paragraphs+images, cached module-wide. `null`
// while `slug` is null, still loading (including right after it changes),
// or once loaded, if the file turned out not to exist.
export function useStory(slug: string | null): LoadedStory | null {
  const [loaded, setLoaded] = useState<{ slug: string | null; story: LoadedStory | null }>({
    slug: null,
    story: null,
  });

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    void fetchStory(slug).then((result) => {
      if (!cancelled) setLoaded({ slug, story: result });
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return loaded.slug === slug ? loaded.story : null;
}
