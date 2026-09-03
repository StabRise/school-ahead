"use client";

import { useEffect, useState } from "react";
import { parseStory, type Story, type StorySummary } from "@/lib/story-parser";

export type { Story, StorySummary, StoryParagraph, StoryParagraphPart, StoryWordSegment } from "@/lib/story-parser";

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

// The "Казки" minigame's full story list — every <slug>/story.md under
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

const storyCache = new Map<string, Promise<Story | null>>();

function fetchStory(slug: string): Promise<Story | null> {
  let cached = storyCache.get(slug);
  if (!cached) {
    cached = fetch(`/api/story?slug=${encodeURIComponent(slug)}`)
      .then((res) => res.json())
      .then((data: { content: string | null }) => (data.content ? parseStory(data.content) : null))
      .catch(() => null);
    storyCache.set(slug, cached);
  }
  return cached;
}

// One story's parsed title+paragraphs, cached module-wide. `null` while
// `slug` is null, still loading (including right after it changes), or
// once loaded, if the folder/story.md turned out not to exist. Any image a
// paragraph references (see StoryWordSegment's "image" kind) is resolved
// by the caller directly from `slug` (public/static/stories/<slug>/
// <filename>) — there's no separate lookup to fetch for it.
export function useStory(slug: string | null): Story | null {
  const [loaded, setLoaded] = useState<{ slug: string | null; story: Story | null }>({ slug: null, story: null });

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
