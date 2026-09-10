"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@school-ahead/api-client";
import { useGetMyCardSet, useListMyCardGroups, useListMyCardSets } from "@school-ahead/api-client/browser/cards/cards";
import type { FlashcardGroupSummary, FlashcardItem, FlashcardSet, FlashcardSetSummary } from "./flashcard-types";

// Client fetch hooks for the "Cards" study flashcards game (docs/preschool/
// games/cards.md) — term/translation/definition/image decks for older
// students (7-8 клас), grouped by subject under public/static/cards/
// <group>/<set>/set.json. Not to be confused with
// @school-ahead/preschool-games' unrelated syllable "CardsGame" (routed at
// /games/reading-cards) — same English word, a completely different,
// younger-audience game. Types + server-safe helpers live in
// ./flashcard-types (this file can't be imported by a server route handler
// since "use client" above makes the whole module client-only).
//
// A student also gets a SECOND, backend-driven source merged in below:
// personal flashcards built from words they saved while translating a
// lesson's content/синопсис/матеріали (see backend/cards/, a student-only
// endpoint — the "add to cards" button next to "add to dictionary"). Those
// are exposed here reshaped into the exact same FlashcardGroupSummary/
// FlashcardSetSummary/FlashcardSet shape the static route handlers already
// produce, so the rest of the game (learn deck, quiz, terms list, print,
// settings panel, topic filter) needs no changes at all to play them.
export type { FlashcardItem, FlashcardCategory, FlashcardSet, FlashcardGroupSummary, FlashcardSetSummary } from "./flashcard-types";
export { flashcardImageUrl, flashcardSoundUrl } from "./flashcard-types";

// Personal groups/sets are namespaced with this prefix (backend/cards/api.py's
// GROUP_SLUG_RE/SET_SLUG_RE: "subject-<id>"/"topic-<id>") so they can never
// collide with a static public/static/cards/<folder> name (always a plain
// word like "spanish"/"math") — every hook below uses this prefix to decide
// which of the two data sources a given group belongs to.
const PERSONAL_GROUP_PREFIX = "subject-";

function isPersonalGroup(group: string | null): boolean {
  return group !== null && group.startsWith(PERSONAL_GROUP_PREFIX);
}

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

// Every subject group ready to pick from (Matematyka, ..., plus a
// student's own personal groups) — the static half is fetched once and
// cached module-wide (empty until it resolves); the personal half is a
// normal react-query hook (properly invalidatable, unlike the static
// cache), fetched only for role="student" and skipped entirely otherwise.
export function useFlashcardGroups(): FlashcardGroupSummary[] {
  const [staticGroups, setStaticGroups] = useState<FlashcardGroupSummary[]>([]);
  const isStudent = useAuthStore((state) => state.user?.role === "student");
  const personalGroupsQuery = useListMyCardGroups({ query: { enabled: isStudent } });

  useEffect(() => {
    let cancelled = false;
    void fetchFlashcardGroups().then((result) => {
      if (!cancelled) setStaticGroups(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return [...staticGroups, ...(personalGroupsQuery.data ?? [])];
}

// A personal group's display title (the Subject's name) — the "list sets"
// endpoint only returns the sets themselves, not their parent group's
// title, so this is looked up from the groups list already fetched above
// (react-query dedupes/caches by query key, so this isn't a wasted
// duplicate request when both hooks are mounted at once).
function usePersonalGroupTitle(group: string | null): string | null {
  const groupsQuery = useListMyCardGroups({ query: { enabled: isPersonalGroup(group) } });
  return groupsQuery.data?.find((item) => item.slug === group)?.title ?? null;
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
  const personal = isPersonalGroup(group);
  const [loaded, setLoaded] = useState<{ group: string | null; data: FlashcardSetsResponse }>({
    group: null,
    data: { groupTitle: null, sets: [] },
  });
  const personalGroupTitle = usePersonalGroupTitle(group);
  const personalSetsQuery = useListMyCardSets(group ?? "", { query: { enabled: personal && group !== null } });

  useEffect(() => {
    if (!group || personal) return;
    let cancelled = false;
    void fetchFlashcardSets(group).then((result) => {
      if (!cancelled) setLoaded({ group, data: result });
    });
    return () => {
      cancelled = true;
    };
  }, [group, personal]);

  if (personal) {
    const sets: FlashcardSetSummary[] = (personalSetsQuery.data ?? []).map((item) => ({
      slug: item.slug,
      title: item.title,
      categoryCount: item.category_count,
      itemCount: item.item_count,
    }));
    return { groupTitle: personalGroupTitle, sets };
  }

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
  const personal = isPersonalGroup(group);
  const [loaded, setLoaded] = useState<{ key: string | null; data: FlashcardSetResponse }>({
    key: null,
    data: { groupTitle: null, set: null },
  });
  const personalGroupTitle = usePersonalGroupTitle(group);
  const personalSetQuery = useGetMyCardSet(group ?? "", set ?? "", {
    query: { enabled: personal && group !== null && set !== null },
  });

  const key = group && set ? `${group}/${set}` : null;

  useEffect(() => {
    if (!group || !set || personal) return;
    let cancelled = false;
    void fetchFlashcardSet(group, set).then((result) => {
      if (!cancelled) setLoaded({ key: `${group}/${set}`, data: result });
    });
    return () => {
      cancelled = true;
    };
  }, [group, set, personal]);

  if (personal) {
    if (!group || !set) return { groupTitle: null, set: null, isLoading: false };
    if (personalSetQuery.isLoading) return { groupTitle: null, set: null, isLoading: true };
    const data = personalSetQuery.data;
    if (!data) return { groupTitle: personalGroupTitle, set: null, isLoading: false };
    // Personal cards already carry a real, unique StudentCard.id — unlike
    // the static route handler, which has to invent sequential ids for
    // otherwise-id-less JSON.
    const flashcardSet: FlashcardSet = {
      title: data.title,
      categories: data.categories.map((category) => ({
        title: category.title,
        items: category.items.map(
          (item): FlashcardItem => ({
            id: item.id,
            term: item.term,
            translation: item.translation,
            definition: item.definition || undefined,
          }),
        ),
      })),
    };
    return { groupTitle: personalGroupTitle, set: flashcardSet, isLoading: false };
  }

  const isLoading = loaded.key !== key;
  return isLoading ? { groupTitle: null, set: null, isLoading: true } : { ...loaded.data, isLoading: false };
}
