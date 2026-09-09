"use client";

import { useEffect, useState } from "react";
import type { FlashcardGroupSummary, FlashcardSet, FlashcardSetSummary } from "./flashcard-types";

// Client fetch hooks for the "Cards" study flashcards game (docs/preschool/
// games/cards.md) — term/translation/definition/image decks for older
// students (7-8 клас), grouped by subject under public/static/cards/
// <group>/<set>/set.json. Not to be confused with
// @school-ahead/preschool-games' unrelated syllable "CardsGame" (routed at
// /games/reading-cards) — same English word, a completely different,
// younger-audience game. Types + server-safe helpers live in
// ./flashcard-types (this file can't be imported by a server route handler
// since "use client" above makes the whole module client-only).
export type { FlashcardItem, FlashcardCategory, FlashcardSet, FlashcardGroupSummary, FlashcardSetSummary } from "./flashcard-types";
export { flashcardImageUrl, flashcardSoundUrl } from "./flashcard-types";

let groupsPromise: Promise<FlashcardGroupSummary[]> | null = null;

function fetchFlashcardGroups(): Promise<FlashcardGroupSummary[]> {
  if (!groupsPromise) {
    groupsPromise = fetch("/api/flashcard-groups")
      .then((res) => res.json())
      .then((data: { groups: FlashcardGroupSummary[] }) => data.groups)
      .catch(() => []);
  }
  return groupsPromise;
}

// Every subject group ready to pick from (Matematyka, ...), fetched once
// and cached module-wide. Empty until the fetch resolves.
export function useFlashcardGroups(): FlashcardGroupSummary[] {
  const [groups, setGroups] = useState<FlashcardGroupSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetchFlashcardGroups().then((result) => {
      if (!cancelled) setGroups(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return groups;
}

interface FlashcardSetsResponse {
  groupTitle: string | null;
  sets: FlashcardSetSummary[];
}

const setsCache = new Map<string, Promise<FlashcardSetsResponse>>();

function fetchFlashcardSets(group: string): Promise<FlashcardSetsResponse> {
  let cached = setsCache.get(group);
  if (!cached) {
    cached = fetch(`/api/flashcard-sets?group=${encodeURIComponent(group)}`)
      .then((res) => res.json())
      .catch(() => ({ groupTitle: null, sets: [] }));
    setsCache.set(group, cached);
  }
  return cached;
}

// One group's title plus every set ready to play under it, `null` while
// `group` is null, still loading, or once loaded, if the group folder
// turned out to have no title.json.
export function useFlashcardSets(group: string | null): FlashcardSetsResponse {
  const [loaded, setLoaded] = useState<{ group: string | null; data: FlashcardSetsResponse }>({
    group: null,
    data: { groupTitle: null, sets: [] },
  });

  useEffect(() => {
    if (!group) return;
    let cancelled = false;
    void fetchFlashcardSets(group).then((result) => {
      if (!cancelled) setLoaded({ group, data: result });
    });
    return () => {
      cancelled = true;
    };
  }, [group]);

  return loaded.group === group ? loaded.data : { groupTitle: null, sets: [] };
}

interface FlashcardSetResponse {
  groupTitle: string | null;
  set: FlashcardSet | null;
}

const setCache = new Map<string, Promise<FlashcardSetResponse>>();

function fetchFlashcardSet(group: string, set: string): Promise<FlashcardSetResponse> {
  const key = `${group}/${set}`;
  let cached = setCache.get(key);
  if (!cached) {
    cached = fetch(`/api/flashcard-set?group=${encodeURIComponent(group)}&set=${encodeURIComponent(set)}`)
      .then((res) => res.json())
      .catch(() => ({ groupTitle: null, set: null }));
    setCache.set(key, cached);
  }
  return cached;
}

// One set's full content (every category/card). `set` is `null` while
// loading or, once `isLoading` is false, if that set.json turned out not to
// exist — callers tell those two apart via `isLoading` rather than
// inferring it from `set` alone.
export function useFlashcardSet(
  group: string | null,
  set: string | null,
): FlashcardSetResponse & { isLoading: boolean } {
  const [loaded, setLoaded] = useState<{ key: string | null; data: FlashcardSetResponse }>({
    key: null,
    data: { groupTitle: null, set: null },
  });

  const key = group && set ? `${group}/${set}` : null;

  useEffect(() => {
    if (!group || !set) return;
    let cancelled = false;
    void fetchFlashcardSet(group, set).then((result) => {
      if (!cancelled) setLoaded({ key: `${group}/${set}`, data: result });
    });
    return () => {
      cancelled = true;
    };
  }, [group, set]);

  const isLoading = loaded.key !== key;
  return isLoading ? { groupTitle: null, set: null, isLoading: true } : { ...loaded.data, isLoading: false };
}
