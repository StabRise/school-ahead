"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { getMeQueryKey, useRewardBalloonPop, useRewardBalloonQuiz } from "@/lib/api/browser/auth/auth";
import { mapApiUserToAuthUser } from "@/lib/api/map-user";
import { prefetchVoice, speak, warmupSpeech, type SpeechLanguage as GameLanguage } from "@/lib/piper-tts";
import { useBackgroundMusic } from "@/lib/use-background-music";
import { useAuthStore } from "@/stores/auth-store";
import { useBalloonPopGameStore, type BalloonMode } from "@/stores/balloon-pop-game-store";
import { useGameMusicStore } from "@/stores/game-music-store";
import { BalloonQuiz, buildBalloonQuizQuestions, type BalloonQuizQuestion } from "@/components/preschool/balloon-quiz";
import { BalloonLearningCards } from "@/components/preschool/balloon-learning-cards";

// Every DIAMOND_MILESTONE ruby balloons popped converts into 1 Diamond,
// awarded via POST /auth/me/balloon-pop-reward and animated flying to the
// header's DiamondBadge (components/header.tsx, marked with
// data-diamond-badge for this to find).
const DIAMOND_MILESTONE = 10;

// Celebration reward minigame — triggers when every one of today's lessons
// (tails included) is Completed, Pending Review, or Need Help (evaluated by
// the caller on dashboard load — see components/student-dashboard.tsx's
// READY_FOR_GAME_STATUSES check). See docs/views/preschool/README.md.

interface FallingBalloon {
  id: number;
  left: number; // percent across the play area
  color: string;
  duration: number; // seconds to fall
  delay: number; // seconds before starting
  size: number; // px
  label: string; // text printed on the balloon, depends on the selected mode
  icon?: string; // optional emoji hung below the balloon
  image?: string; // optional illustration hung below the balloon instead of `icon`
  speech: string; // text spoken via Piper TTS when the balloon is popped
  isQuizBalloon?: boolean; // heart-shaped "?" balloon — pops into the bonus quiz instead of scoring
}

interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  dx: number;
  dy: number;
}

// Hex values line up positionally with each language's name list below.
const BALLOON_COLOR_HEXES = ["#f87171", "#fb923c", "#fbbf24", "#4ade80", "#38bdf8", "#a78bfa", "#f472b6"];

const COLOR_NAMES: Record<GameLanguage, string[]> = {
  en: ["Red", "Orange", "Yellow", "Green", "Blue", "Purple", "Pink"],
  uk: ["Червоний", "Помаранчевий", "Жовтий", "Зелений", "Синій", "Фіолетовий", "Рожевий"],
  pl: ["Czerwony", "Pomarańczowy", "Żółty", "Zielony", "Niebieski", "Fioletowy", "Różowy"],
};

const ALPHABETS: Record<GameLanguage, string[]> = {
  en: [
    "A", "B", "C", "D", "E", "F", "G", "H", "I", "J",
    "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T",
    "U", "V", "W", "X", "Y", "Z"
  ],
  uk: [
    "А", "Б", "В", "Г", "Ґ", "Д", "Е", "Є", "Ж", "З",
    "И", "І", "Ї", "Й", "К", "Л", "М", "Н", "О", "П",
    "Р", "С", "Т", "У", "Ф", "Х", "Ц", "Ч", "Ш", "Щ",
    "Ь", "Ю", "Я"
  ],
  pl: [
    "A", "Ą", "B", "C", "Ć", "D", "E", "Ę", "F", "G",
    "H", "I", "J", "K", "L", "Ł", "M", "N", "Ń", "O",
    "Ó", "P", "R", "S", "Ś", "T", "U", "W", "Y", "Z",
    "Ź", "Ż"
  ]
}

// English greeting phrases for the "greetings" mode — no per-language
// variants exist yet, so the list is shown/spoken in English regardless of
// the selected game language.
const BALLOON_GREETINGS = [
  "Hello",
  "Hi",
  "Hey",
  "Good morning",
  "Good afternoon",
  "Good evening",
  "Bye",
  "Goodbye",
  "See you later",
];

// English animal names for the "animals" mode, paired with a representative
// emoji shown on the balloon — like "greetings", no per-language variants
// exist yet, so names are shown/spoken in English regardless of the
// selected game language. Unicode has no dedicated emoji for every animal
// here (e.g. cheetah/leopard, crocodile/alligator, walrus/seal, moose/deer/
// reindeer), so closely related species intentionally share a glyph, and a
// generic paw print stands in for the handful with no close match at all
// (platypus, armadillo, meerkat).
const BALLOON_ANIMALS: { name: string; emoji: string }[] = [
  { name: "Elephant", emoji: "🐘" },
  { name: "Lion", emoji: "🦁" },
  { name: "Tiger", emoji: "🐅" },
  { name: "Giraffe", emoji: "🦒" },
  { name: "Zebra", emoji: "🦓" },
  { name: "Hippopotamus", emoji: "🦛" },
  { name: "Rhinoceros", emoji: "🦏" },
  { name: "Cheetah", emoji: "🐆" },
  { name: "Leopard", emoji: "🐆" },
  { name: "Kangaroo", emoji: "🦘" },
  { name: "Koala", emoji: "🐨" },
  { name: "Panda", emoji: "🐼" },
  { name: "Gorilla", emoji: "🦍" },
  { name: "Chimpanzee", emoji: "🦧" },
  { name: "Wolf", emoji: "🐺" },
  { name: "Fox", emoji: "🦊" },
  { name: "Bear", emoji: "🐻" },
  { name: "Deer", emoji: "🦌" },
  { name: "Moose", emoji: "🫎" },
  { name: "Bison", emoji: "🦬" },
  { name: "Camel", emoji: "🐪" },
  { name: "Dolphin", emoji: "🐬" },
  { name: "Whale", emoji: "🐋" },
  { name: "Shark", emoji: "🦈" },
  { name: "Octopus", emoji: "🐙" },
  { name: "Eagle", emoji: "🦅" },
  { name: "Owl", emoji: "🦉" },
  { name: "Penguin", emoji: "🐧" },
  { name: "Flamingo", emoji: "🦩" },
  { name: "Parrot", emoji: "🦜" },
  { name: "Crocodile", emoji: "🐊" },
  { name: "Alligator", emoji: "🐊" },
  { name: "Turtle", emoji: "🐢" },
  { name: "Snake", emoji: "🐍" },
  { name: "Iguana", emoji: "🦎" },
  { name: "Frog", emoji: "🐸" },
  { name: "Salamander", emoji: "🦎" },
  { name: "Bat", emoji: "🦇" },
  { name: "Squirrel", emoji: "🐿️" },
  { name: "Hedgehog", emoji: "🦔" },
  { name: "Otter", emoji: "🦦" },
  { name: "Beaver", emoji: "🦫" },
  { name: "Raccoon", emoji: "🦝" },
  { name: "Platypus", emoji: "🐾" },
  { name: "Sloth", emoji: "🦥" },
  { name: "Armadillo", emoji: "🐾" },
  { name: "Meerkat", emoji: "🐾" },
  { name: "Walrus", emoji: "🦭" },
  { name: "Seal", emoji: "🦭" },
  { name: "Reindeer", emoji: "🦌" },
];

// English names for the "schoolSupplies" mode, same pattern as
// BALLOON_ANIMALS above. Unicode has no dedicated emoji for most of these
// items, so each uses the closest visually-similar stand-in (e.g. a sponge
// for "erase", an abacus for "calculate", a magnetic compass for the
// geometry compass).
const BALLOON_SCHOOL_SUPPLIES: { name: string; emoji: string }[] = [
  { name: "Pencil", emoji: "✏️" },
  { name: "Pen", emoji: "🖊️" },
  { name: "Eraser", emoji: "🧽" },
  { name: "Ruler", emoji: "📏" },
  { name: "Notebook", emoji: "📓" },
  { name: "Backpack", emoji: "🎒" },
  { name: "Scissors", emoji: "✂️" },
  { name: "Glue stick", emoji: "🧴" },
  { name: "Marker", emoji: "🖍️" },
  { name: "Highlighter", emoji: "🖌️" },
  { name: "Pencil case", emoji: "🧳" },
  { name: "Calculator", emoji: "🧮" },
  { name: "Compass", emoji: "🧭" },
  { name: "Colored pencils", emoji: "🎨" },
];

// "animalsEx" mode — like "animals", but hangs a drawn illustration below
// the balloon instead of an emoji, for characters worth showing at higher
// fidelity than a Unicode glyph allows. Files live in
// public/preschool/animals, same static-asset convention as public/music
// (see lib/use-background-music.ts).
const BALLOON_ANIMALS_EX: { name: string; image: string }[] = [
  { name: "Bear", image: "/preschool/animals/bear.jpeg" },
  { name: "Butterfly", image: "/preschool/animals/butterfly.jpeg" },
  { name: "Cheetah", image: "/preschool/animals/cheetah.jpeg" },
  { name: "Kitten", image: "/preschool/animals/kitten.jpeg" },
  { name: "Panda", image: "/preschool/animals/panda.jpeg" },
  { name: "Chicken", image: "/preschool/animals/chicken.jpeg" },
  { name: "fox", image: "/preschool/animals/fox.jpeg" },
  { name: "frog", image: "/preschool/animals/frog.jpeg" },
  { name: "hippo", image: "/preschool/animals/hippo.jpeg" },
  { name: "horse", image: "/preschool/animals/horse.jpeg" },
  { name: "goose", image: "/preschool/animals/goose.jpeg" },
  { name: "kangaroo", image: "/preschool/animals/kangaroo.jpeg" },
  { name: "koala", image: "/preschool/animals/koala.jpeg" },
  { name: "lion", image: "/preschool/animals/lion.jpeg" },
  { name: "monkey", image: "/preschool/animals/monkey.jpeg" },
  { name: "owl", image: "/preschool/animals/owl.jpeg" },
  { name: "panda", image: "/preschool/animals/panda.jpeg" },
  { name: "squirrel", image: "/preschool/animals/squirrel.jpeg" },
  { name: "whale", image: "/preschool/animals/whale.jpeg" },
  { name: "zebra", image: "/preschool/animals/zebra.jpeg" },
];

// "schoolSuppliesEx" mode — like "animalsEx", a photo/illustration hung
// below the balloon instead of an emoji. Files live in
// public/preschool/schoolSupplies, same static-asset convention as
// public/preschool/animals above.
const BALLOON_SCHOOL_SUPPLIES_EX: { name: string; image: string }[] = [
  { name: "Backpack", image: "/preschool/schoolSupplies/backpack.jpeg" },
  { name: "Book", image: "/preschool/schoolSupplies/book.jpeg" },
  { name: "Calculator", image: "/preschool/schoolSupplies/calculator.jpeg" },
  { name: "Eraser", image: "/preschool/schoolSupplies/eraser.jpeg" },
  { name: "Glue stick", image: "/preschool/schoolSupplies/glue-stick.jpeg" },
  { name: "Marker", image: "/preschool/schoolSupplies/marker.jpeg" },
  { name: "Notebook", image: "/preschool/schoolSupplies/notebook.jpeg" },
  { name: "Pen", image: "/preschool/schoolSupplies/pen.jpeg" },
  { name: "Pencil", image: "/preschool/schoolSupplies/pencil.jpeg" },
  { name: "Pencil case", image: "/preschool/schoolSupplies/pencil-case.jpeg" },
  { name: "Ruler", image: "/preschool/schoolSupplies/ruler.jpeg" },
  { name: "Scissors", image: "/preschool/schoolSupplies/scissors.jpeg" },
];

// "family" mode — a photo/illustration hung below the balloon instead of an
// emoji, same as "animalsEx"/"schoolSuppliesEx". Files live in
// public/preschool/family, same static-asset convention as those.
const BALLOON_FAMILY: { name: string; image: string }[] = [
  { name: "Mother", image: "/preschool/family/mother.jpeg" },
  { name: "Daddy", image: "/preschool/family/daddy.jpeg" },
  { name: "Grandma", image: "/preschool/family/grandma.jpeg" },
  { name: "Sister", image: "/preschool/family/sister.jpeg" },
  { name: "Brother", image: "/preschool/family/brother.jpeg" },
  { name: "Baby", image: "/preschool/family/baby.jpeg" },
];

// "bodyParts" mode — a photo/illustration hung below the balloon instead of
// an emoji, same as "animalsEx"/"schoolSuppliesEx"/"family". Files live in
// public/preschool/body-parts, same static-asset convention as those.
const BALLOON_BODY_PARTS: { name: string; image: string }[] = [
  { name: "Head", image: "/preschool/body-parts/head.jpeg" },
  { name: "Hair", image: "/preschool/body-parts/hair.jpeg" },
  { name: "Eye", image: "/preschool/body-parts/eye.jpeg" },
  { name: "Ear", image: "/preschool/body-parts/ear.jpeg" },
  { name: "Nose", image: "/preschool/body-parts/nose.jpeg" },
  { name: "Mouth", image: "/preschool/body-parts/mouth.jpeg" },
  { name: "Shoulder", image: "/preschool/body-parts/shoulder.jpeg" },
  { name: "Arm", image: "/preschool/body-parts/arm.jpeg" },
  { name: "Hand", image: "/preschool/body-parts/hand.jpeg" },
  { name: "Finger", image: "/preschool/body-parts/finger.jpeg" },
  { name: "Back", image: "/preschool/body-parts/back.jpeg" },
  { name: "Leg", image: "/preschool/body-parts/leg.jpeg" },
  { name: "Knee", image: "/preschool/body-parts/knee.jpeg" },
];

// "fruits" mode — a photo/illustration hung below the balloon instead of an
// emoji, same as "animalsEx"/"schoolSuppliesEx"/"family"/"bodyParts". Files
// live in public/preschool/fruits, same static-asset convention as those.
const BALLOON_FRUITS: { name: string; image: string }[] = [
  { name: "Apple", image: "/preschool/fruits/apple.jpeg" },
  { name: "Banana", image: "/preschool/fruits/banana.jpeg" },
  { name: "Orange", image: "/preschool/fruits/orange.jpeg" },
  { name: "Pear", image: "/preschool/fruits/pear.jpeg" },
  { name: "Lemon", image: "/preschool/fruits/lemon.jpeg" },
  { name: "Grapes", image: "/preschool/fruits/grapes.jpeg" },
  { name: "Strawberry", image: "/preschool/fruits/strawberry.jpeg" },
  { name: "Blueberry", image: "/preschool/fruits/blueberry.jpeg" },
  { name: "Raspberry", image: "/preschool/fruits/raspberry.jpeg" },
  { name: "Cherry", image: "/preschool/fruits/cherry.jpeg" },
  { name: "Plum", image: "/preschool/fruits/plum.jpeg" },
  { name: "Peach", image: "/preschool/fruits/peach.jpeg" },
  { name: "Mango", image: "/preschool/fruits/mango.jpeg" },
  { name: "Kiwi", image: "/preschool/fruits/kiwi.jpeg" },
  { name: "Pineapple", image: "/preschool/fruits/pineapple.jpeg" },
  { name: "Watermelon", image: "/preschool/fruits/watermelon.jpeg" },
  { name: "Melon", image: "/preschool/fruits/melon.jpeg" },
];

// Image pool for each mode's "where is the X?" picture quiz (see
// PICTURE_QUIZ_MODES in balloon-quiz.tsx) — passed to
// buildBalloonQuizQuestions when the heart balloon is popped.
const PICTURE_POOL_BY_MODE: Partial<Record<BalloonMode, { name: string; image: string }[]>> = {
  animalsEx: BALLOON_ANIMALS_EX,
  schoolSuppliesEx: BALLOON_SCHOOL_SUPPLIES_EX,
  family: BALLOON_FAMILY,
  bodyParts: BALLOON_BODY_PARTS,
  fruits: BALLOON_FRUITS,
};

const BALLOON_MODES: BalloonMode[] = [
  "numbers10",
  "numbers20",
  "numbers100",
  "colors",
  "letters",
  "greetings",
  "animals",
  "animalsEx",
  "schoolSupplies",
  "schoolSuppliesEx",
  "family",
  "bodyParts",
  "fruits",
];
const GAME_LANGUAGES: GameLanguage[] = ["en", "uk", "pl"];

// Modes with a bonus heart-shaped "?" quiz balloon (balloon-quiz.tsx) —
// "numbers10" gets a counting quiz; "animalsEx"/"schoolSuppliesEx"/"family"/
// "bodyParts"/"fruits" each get a "where is the X?" picture quiz built from
// that mode's own image list (see PICTURE_POOL_BY_MODE below). TODO: extend
// to "animals"/"schoolSupplies" once there's a matching quiz for those
// emoji-only vocabularies too.
const QUIZ_BALLOON_MODES: BalloonMode[] = [
  "numbers10",
  "animalsEx",
  "schoolSuppliesEx",
  "family",
  "bodyParts",
  "fruits",
];
// Checked once per spawn tick (independently of the normal balloon spawned
// that same tick) while at most one quiz balloon is already on screen.
const QUIZ_BALLOON_SPAWN_CHANCE = 0.1;
const QUIZ_BALLOON_COLOR = "#f43f5e";

const SPAWN_INTERVAL_MS = 850;
const PARTICLES_PER_POP = 10;

// Slider bounds — the sliders' persisted defaults (see balloon-pop-game-store)
// reproduce the original hardcoded values exactly: size randomBetween(84, 140)
// is base=112 ± 25%, duration randomBetween(6, 11) is speed=1 (i.e.
// unscaled), and 9 was the original MAX_ON_SCREEN.
const MIN_SIZE = 60;
const MAX_SIZE = 200;
const MIN_SPEED = 0.5;
const MAX_SPEED = 3;
const MIN_COUNT = 3;
const MAX_COUNT = 24;
// How many random items a picture-pool mode's game/learning screens draw
// from (see selectedPictureItems below) — MIN_CARD_COUNT keeps the picture
// quiz's 4-choice questions (buildBalloonQuizQuestions) always solvable.
const MIN_CARD_COUNT = 6;
const MAX_CARD_COUNT = 20;

let nextBalloonId = 0;
let nextParticleId = 0;
let nextRewardId = 0;

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomColor(): string {
  return BALLOON_COLOR_HEXES[Math.floor(Math.random() * BALLOON_COLOR_HEXES.length)];
}

function randomNumber(max: number): number {
  return Math.floor(randomBetween(1, max + 1));
}

function randomFrom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Case-insensitive dedupe, keeping the first occurrence — BALLOON_ANIMALS_EX
// has a few casing duplicates (e.g. "Panda"/"panda") that would otherwise
// count as two distinct items when sampling a fixed subset of a mode's pool.
function uniqueByName<T extends { name: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = item.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

// Picks the label (and, for "colors" mode, the color that must match it) for
// a newly spawned balloon. `speech` is what gets read aloud on pop — for
// "letters" that's just the capital letter, since speaking the "Aa" pair as
// one word wouldn't sound like the letter's name.
function generateBalloonContent(
  mode: BalloonMode,
  language: GameLanguage,
  // For the 5 picture-pool modes — the fixed subset selectedPictureItems
  // picked for this mode/cardCount (see BalloonPopGame), so balloons only
  // ever show the same items the "learning" card grid does. Undefined for
  // every other mode, which always draws from its full static list.
  picturePool?: { name: string; image: string }[],
): { label: string; icon?: string; image?: string; color: string; speech: string } {
  switch (mode) {
    case "numbers20": {
      const label = String(randomNumber(20));
      return { label, color: randomColor(), speech: label };
    }
    case "numbers100": {
      const label = String(randomNumber(100));
      return { label, color: randomColor(), speech: label };
    }
    case "colors": {
      const index = Math.floor(Math.random() * BALLOON_COLOR_HEXES.length);
      const label = COLOR_NAMES[language][index];
      return { label, color: BALLOON_COLOR_HEXES[index], speech: label };
    }
    case "letters": {
      const label = randomFrom(ALPHABETS[language]);
      return { label, color: randomColor(), speech: label.charAt(0) };
    }
    case "greetings": {
      const label = randomFrom(BALLOON_GREETINGS);
      return { label, color: randomColor(), speech: label };
    }
    case "animals": {
      const animal = randomFrom(BALLOON_ANIMALS);
      return { label: animal.name, icon: animal.emoji, color: randomColor(), speech: animal.name };
    }
    case "animalsEx": {
      const animal = randomFrom(picturePool ?? BALLOON_ANIMALS_EX);
      return { label: animal.name, image: animal.image, color: randomColor(), speech: animal.name };
    }
    case "schoolSupplies": {
      const item = randomFrom(BALLOON_SCHOOL_SUPPLIES);
      return { label: item.name, icon: item.emoji, color: randomColor(), speech: item.name };
    }
    case "schoolSuppliesEx": {
      const item = randomFrom(picturePool ?? BALLOON_SCHOOL_SUPPLIES_EX);
      return { label: item.name, image: item.image, color: randomColor(), speech: item.name };
    }
    case "family": {
      const member = randomFrom(picturePool ?? BALLOON_FAMILY);
      return { label: member.name, image: member.image, color: randomColor(), speech: member.name };
    }
    case "bodyParts": {
      const part = randomFrom(picturePool ?? BALLOON_BODY_PARTS);
      return { label: part.name, image: part.image, color: randomColor(), speech: part.name };
    }
    case "fruits": {
      const fruit = randomFrom(picturePool ?? BALLOON_FRUITS);
      return { label: fruit.name, image: fruit.image, color: randomColor(), speech: fruit.name };
    }
    case "numbers10":
    default: {
      const label = String(randomNumber(10));
      return { label, color: randomColor(), speech: label };
    }
  }
}

// Every distinct value a mode can speak, for proactively warming the TTS
// cache (see the mode/language effect below) so pops play instantly instead
// of paying synthesis cost live. Skipped for numbers100 — 100 distinct
// utterances is too much background synthesis for a vocabulary that's
// mostly never hit in a single play session; those are cached lazily as
// they come up instead.
function vocabularyFor(mode: BalloonMode, language: GameLanguage): string[] {
  switch (mode) {
    case "numbers20":
      return Array.from({ length: 20 }, (_, i) => String(i + 1));
    case "numbers100":
      return [];
    case "colors":
      return COLOR_NAMES[language];
    case "letters":
      return ALPHABETS[language].map((letter) => letter.charAt(0));
    case "greetings":
      return BALLOON_GREETINGS;
    case "animals":
      // 50 names is as much background synthesis as numbers100's 100 — skip
      // proactive warmup and let pops cache lazily as each name comes up.
      return [];
    case "animalsEx":
      return BALLOON_ANIMALS_EX.map((animal) => animal.name);
    case "schoolSupplies":
      return BALLOON_SCHOOL_SUPPLIES.map((item) => item.name);
    case "schoolSuppliesEx":
      return BALLOON_SCHOOL_SUPPLIES_EX.map((item) => item.name);
    case "family":
      return BALLOON_FAMILY.map((member) => member.name);
    case "bodyParts":
      return BALLOON_BODY_PARTS.map((part) => part.name);
    case "fruits":
      return BALLOON_FRUITS.map((fruit) => fruit.name);
    case "numbers10":
    default:
      return Array.from({ length: 10 }, (_, i) => String(i + 1));
  }
}

// Multi-word labels (the "greetings" mode's phrases) wrap onto a second
// line, balanced so neither line is much longer than the other, rather than
// shrinking to fit one long unbroken line.
function wrapBalloonLabel(label: string): string[] {
  const words = label.split(" ").filter(Boolean);
  if (words.length < 2) return [label];
  let bestSplit = 1;
  let bestScore = Infinity;
  for (let i = 1; i < words.length; i++) {
    const line1 = words.slice(0, i).join(" ");
    const line2 = words.slice(i).join(" ");
    const score = Math.max(line1.length, line2.length);
    if (score < bestScore) {
      bestScore = score;
      bestSplit = i;
    }
  }
  return [words.slice(0, bestSplit).join(" "), words.slice(bestSplit).join(" ")];
}

// Longer labels (color names, three-digit numbers, wrapped phrase lines)
// need a smaller font to keep fitting inside the fixed balloon SVG viewBox.
// Sized off the longest *line* rather than the raw label, so wrapping a
// phrase into two lines lets it stay bigger than shrinking it as one string.
function labelFontSize(lines: string[]): number {
  const maxLineLength = Math.max(...lines.map((line) => line.length));
  if (maxLineLength <= 2) return 14;
  if (maxLineLength <= 4) return 12;
  if (maxLineLength <= 6) return 10;
  if (maxLineLength <= 8) return 8;
  if (maxLineLength <= 10) return 6.5;
  return 5.5;
}

// Synthesized "pop" — no audio asset pipeline exists in this project, and a
// short procedural blip keeps the minigame self-contained.
function playPopSound() {
  const AudioContextClass =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    const ctx = new AudioContextClass();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(700, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + 0.14);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.2);
    oscillator.onended = () => ctx.close();
  } catch {
    // Best-effort only — never block the pop on audio failures (autoplay
    // restrictions, unsupported browser, ...).
  }
}

// Celebratory rising arpeggio for the DIAMOND_MILESTONE reward — distinct
// from playPopSound's single blip so it reads as a bigger event.
function playDiamondChime() {
  const AudioContextClass =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    const ctx = new AudioContextClass();
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((frequency, i) => {
      const startTime = ctx.currentTime + i * 0.09;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, startTime);
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.3, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.4);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(startTime);
      oscillator.stop(startTime + 0.42);
    });
    setTimeout(() => ctx.close(), (notes.length * 0.09 + 0.42) * 1000);
  } catch {
    // Best-effort only — never block the reward on audio failures.
  }
}

// Flies a 💎 from `from` (viewport coordinates, e.g. the score badge at the
// moment DIAMOND_MILESTONE is hit) to the header's DiamondBadge, then calls
// onDone so the caller can drop it from state. Portaled to document.body so
// its `fixed` positioning isn't affected by the game container's own
// `overflow-hidden`, and so it renders above the header it's flying into.
function FlyingDiamond({ from, onDone }: { from: { x: number; y: number }; onDone: () => void }) {
  // Measured once via a lazy initializer (runs synchronously during the
  // first render, before paint) rather than in an effect, so there's no
  // in-between frame where the target isn't known yet.
  const [target] = useState(() => {
    const badgeRect = document.querySelector("[data-diamond-badge]")?.getBoundingClientRect();
    return badgeRect
      ? { x: badgeRect.left + badgeRect.width / 2, y: badgeRect.top + badgeRect.height / 2 }
      : { x: window.innerWidth - 32, y: 32 };
  });
  const [flying, setFlying] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setFlying(true));
    // Fallback in case onTransitionEnd never fires (e.g. reduced-motion
    // settings drop the transition) so the diamond can't get stuck forever.
    const fallback = setTimeout(onDone, 1200);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(fallback);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const point = flying ? target : from;
  return createPortal(
    <span
      aria-hidden="true"
      onTransitionEnd={onDone}
      className="pointer-events-none fixed top-0 left-0 z-50 text-3xl"
      style={{
        transform: `translate(${point.x - 16}px, ${point.y - 16}px) scale(${flying ? 0.4 : 1.4})`,
        opacity: flying ? 0.15 : 1,
        transition: "transform 0.9s cubic-bezier(0.3, 0, 0.6, 1), opacity 0.9s ease-in",
      }}
    >
      💎
    </span>,
    document.body,
  );
}

function RubyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-9 w-9 drop-shadow" aria-hidden="true">
      <polygon points="12,1 23,9 12,23 1,9" fill="#e11d48" />
      <polygon points="1,9 12,9 12,1" fill="#fda4af" opacity="0.9" />
      <polygon points="12,1 23,9 12,9" fill="#fb7185" opacity="0.85" />
      <polygon points="1,9 12,9 12,23" fill="#be123c" opacity="0.85" />
      <polygon points="12,9 23,9 12,23" fill="#9f1239" opacity="0.85" />
    </svg>
  );
}

function BalloonNode({
  balloon,
  label,
  onPop,
  onMissed,
}: {
  balloon: FallingBalloon;
  label: string;
  onPop: (balloon: FallingBalloon, rect: DOMRect) => void;
  onMissed: (balloonId: number) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  // A plain onClick only fires if the mouse/touch goes down and up on
  // (roughly) the same spot — a child pressing and dragging away before
  // release never triggers a click, so the balloon survives untouched.
  // Popping on pointerdown instead reacts the instant it's pressed,
  // independent of whatever the pointer does afterward. onClick stays as a
  // fallback for keyboard activation (Enter/Space), guarded so a completed
  // mouse click doesn't pop the same balloon twice.
  const poppedRef = useRef(false);
  const lines = wrapBalloonLabel(balloon.label);
  const fontSize = labelFontSize(lines);
  // The icon/image (e.g. "animals"/"animalsEx" modes) hangs below the
  // balloon on its string, like the character is dangling from it as it
  // falls — not printed inside the balloon itself, which stays the same
  // size regardless. A photo/illustration needs more room than an emoji
  // glyph, so it gets a taller viewBox and a bigger charm.
  const hasImage = Boolean(balloon.image);
  const hasIcon = Boolean(balloon.icon) || hasImage;
  const viewBoxHeight = hasImage ? 86 : hasIcon ? 74 : 52;
  const stringEndY = hasIcon ? 60 : 52;
  const imageRadius = 11;
  const imageCenterY = stringEndY + imageRadius + 1;

  const handlePop = () => {
    if (poppedRef.current) return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    poppedRef.current = true;
    onPop(balloon, rect);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    handlePop();
  };

  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      onPointerDown={handlePointerDown}
      onClick={handlePop}
      className="absolute top-0 cursor-pointer touch-manipulation"
      style={{
        left: `${balloon.left}%`,
        width: balloon.size,
        animation: `balloon-fall ${balloon.duration}s linear ${balloon.delay}s forwards`,
      }}
      onAnimationEnd={() => onMissed(balloon.id)}
    >
      <svg viewBox={`0 0 40 ${viewBoxHeight}`} className="w-full drop-shadow-md" aria-hidden="true">
        {balloon.isQuizBalloon ? (
          <path
            d="M20,40 C20,40 4,29.5 4,20.5 C4,15.25 8.25,11 13.5,11 C16.5,11 19,12.5 20,15 C21,12.5 23.5,11 26.5,11 C31.75,11 36,15.25 36,20.5 C36,29.5 20,40 20,40 Z"
            fill={balloon.color}
          />
        ) : (
          <>
            <ellipse cx="20" cy="20" rx="18" ry="20" fill={balloon.color} />
            <ellipse cx="14" cy="12" rx="4" ry="6" fill="white" opacity="0.35" />
          </>
        )}
        <text
          x="20"
          textAnchor="middle"
          fontSize={balloon.isQuizBalloon ? 20 : fontSize}
          fontWeight="700"
          fill="white"
          // Otherwise a precise tap directly on the glyph can be grabbed by
          // the browser as a text-selection gesture instead of bubbling up
          // as a click on the button, so the balloon doesn't pop.
          style={{ paintOrder: "stroke", pointerEvents: "none", userSelect: "none" }}
          stroke="rgba(0,0,0,0.2)"
          strokeWidth="0.5"
        >
          {balloon.isQuizBalloon ? (
            // dominantBaseline="central" instead of the plain baseline the
            // other tspans use — at this fontSize a baseline-anchored glyph
            // sits well above the heart's visual center, not centered on it.
            <tspan x="20" y="25" dominantBaseline="central">
              ?
            </tspan>
          ) : lines.length === 2 ? (
            <>
              <tspan x="20" y={24 - fontSize * 0.6}>
                {lines[0]}
              </tspan>
              <tspan x="20" y={24 + fontSize * 0.6}>
                {lines[1]}
              </tspan>
            </>
          ) : (
            <tspan x="20" y="24">
              {lines[0]}
            </tspan>
          )}
        </text>
        <path d="M20 40 L17 46 L23 46 Z" fill={balloon.color} />
        <line x1="20" y1="46" x2="20" y2={stringEndY} stroke="#94a3b8" strokeWidth="1" />
        {hasImage ? (
          <>
            <clipPath id={`balloon-clip-${balloon.id}`}>
              <circle cx="20" cy={imageCenterY} r={imageRadius} />
            </clipPath>
            <circle cx="20" cy={imageCenterY} r={imageRadius + 1} fill="white" stroke="#94a3b8" strokeWidth="1" />
            <image
              href={balloon.image}
              x={20 - imageRadius}
              y={imageCenterY - imageRadius}
              width={imageRadius * 2}
              height={imageRadius * 2}
              preserveAspectRatio="xMidYMid slice"
              clipPath={`url(#balloon-clip-${balloon.id})`}
              style={{ pointerEvents: "none" }}
            />
          </>
        ) : (
          balloon.icon && (
            <text
              x="20"
              y={stringEndY + 10}
              textAnchor="middle"
              fontSize="16"
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              {balloon.icon}
            </text>
          )
        )}
      </svg>
    </button>
  );
}

export function BalloonPopGame() {
  const t = useTranslations("BalloonPopGame");
  const [balloons, setBalloons] = useState<FallingBalloon[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [score, setScore] = useState(0);
  const [scoreBump, setScoreBump] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [flyingDiamond, setFlyingDiamond] = useState<{ id: number; from: { x: number; y: number } } | null>(null);
  const [quizQuestions, setQuizQuestions] = useState<BalloonQuizQuestion[] | null>(null);
  const awardedMilestonesRef = useRef<Set<number>>(new Set());
  const scoreBadgeRef = useRef<HTMLDivElement>(null);
  const setUser = useAuthStore((s) => s.setUser);
  const queryClient = useQueryClient();
  const rewardBalloonPop = useRewardBalloonPop();
  const rewardBalloonQuiz = useRewardBalloonQuiz();
  const size = useBalloonPopGameStore((s) => s.size);
  const setSize = useBalloonPopGameStore((s) => s.setSize);
  const speed = useBalloonPopGameStore((s) => s.speed);
  const setSpeed = useBalloonPopGameStore((s) => s.setSpeed);
  const maxOnScreen = useBalloonPopGameStore((s) => s.maxOnScreen);
  const setMaxOnScreen = useBalloonPopGameStore((s) => s.setMaxOnScreen);
  const mode = useBalloonPopGameStore((s) => s.mode);
  const setMode = useBalloonPopGameStore((s) => s.setMode);
  const language = useBalloonPopGameStore((s) => s.language);
  const setLanguage = useBalloonPopGameStore((s) => s.setLanguage);
  const muted = useBalloonPopGameStore((s) => s.muted);
  const setMuted = useBalloonPopGameStore((s) => s.setMuted);
  const screenMode = useBalloonPopGameStore((s) => s.screenMode);
  const setScreenMode = useBalloonPopGameStore((s) => s.setScreenMode);
  const cardCount = useBalloonPopGameStore((s) => s.cardCount);
  const setCardCount = useBalloonPopGameStore((s) => s.setCardCount);
  const musicEnabled = useGameMusicStore((s) => s.musicEnabled);
  const setMusicEnabled = useGameMusicStore((s) => s.setMusicEnabled);
  const musicVolume = useGameMusicStore((s) => s.volume);
  const setMusicVolume = useGameMusicStore((s) => s.setVolume);
  const containerRef = useRef<HTMLDivElement>(null);

  const picturePool = PICTURE_POOL_BY_MODE[mode];
  const isPictureMode = Boolean(picturePool);

  // The fixed subset of `mode`'s picture pool that both the "game" (balloon)
  // and "learning" (flashcard) screens draw from — re-picked only when
  // `mode` or `cardCount` changes, so toggling between the two screens never
  // reshuffles it. `null` for modes with no picture pool at all.
  const selectedPictureItems = useMemo(() => {
    if (!picturePool) return null;
    const unique = uniqueByName(picturePool);
    return shuffle(unique).slice(0, Math.min(cardCount, unique.length));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, cardCount]);

  // "Learning" only makes sense for picture-pool modes — falls back to
  // "game" if the mode changes to one without a card grid to show (e.g. the
  // settings panel's mode dropdown is switched away mid-session).
  useEffect(() => {
    if (!isPictureMode && screenMode === "learning") setScreenMode("game");
  }, [isPictureMode, screenMode, setScreenMode]);

  useBackgroundMusic();

  useEffect(() => {
    // Paused while the bonus quiz overlay is open, or while showing the
    // static "learning" card grid instead of falling balloons.
    if (quizQuestions || screenMode === "learning") return;
    const interval = setInterval(() => {
      setBalloons((current) => {
        if (current.length >= maxOnScreen) return current;

        const canSpawnQuizBalloon =
          QUIZ_BALLOON_MODES.includes(mode) &&
          !current.some((b) => b.isQuizBalloon) &&
          Math.random() < QUIZ_BALLOON_SPAWN_CHANCE;
        const content = canSpawnQuizBalloon
          ? { label: "?", color: QUIZ_BALLOON_COLOR, speech: "" }
          : generateBalloonContent(mode, language, selectedPictureItems ?? undefined);

        const balloon: FallingBalloon = {
          id: nextBalloonId++,
          left: randomBetween(4, 82),
          color: content.color,
          duration: randomBetween(6, 11) / speed,
          delay: 0,
          size: randomBetween(size * 0.75, size * 1.25),
          label: content.label,
          icon: "icon" in content ? content.icon : undefined,
          image: "image" in content ? content.image : undefined,
          speech: content.speech,
          isQuizBalloon: canSpawnQuizBalloon,
        };
        return [...current, balloon];
      });
    }, SPAWN_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [size, speed, maxOnScreen, mode, language, quizQuestions, screenMode, selectedPictureItems]);

  // Warms the voice model cache as soon as a language is selected, so the
  // first popped balloon doesn't stall on a multi-megabyte download — then
  // pre-synthesizes every value the selected mode can speak, so pops play
  // back instantly from cache instead of paying full TTS synthesis latency
  // (piper-tts rebuilds its inference session from scratch on every call).
  // Skipped entirely while muted — no point downloading/synthesizing voices
  // nothing will play.
  useEffect(() => {
    if (muted) return;
    let cancelled = false;
    void prefetchVoice(language, "short").then(() => {
      if (!cancelled) warmupSpeech(vocabularyFor(mode, language), language, "short");
    });
    return () => {
      cancelled = true;
    };
  }, [mode, language, muted]);

  // Every DIAMOND_MILESTONE ruby balloons popped awards 1 Diamond — dedupes
  // via awardedMilestonesRef so React's dev-mode double-invoked effects (or
  // a re-render before the mutation settles) can't double-award the same
  // milestone.
  useEffect(() => {
    if (score === 0 || score % DIAMOND_MILESTONE !== 0) return;
    if (awardedMilestonesRef.current.has(score)) return;
    awardedMilestonesRef.current.add(score);

    playDiamondChime();
    const badgeRect = scoreBadgeRef.current?.getBoundingClientRect();
    const from = badgeRect
      ? { x: badgeRect.left + badgeRect.width / 2, y: badgeRect.top + badgeRect.height / 2 }
      : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    setFlyingDiamond({ id: nextRewardId++, from });

    rewardBalloonPop.mutate(undefined, {
      onSuccess: (response) => {
        setUser(mapApiUserToAuthUser(response.user));
        queryClient.invalidateQueries({ queryKey: getMeQueryKey() });
      },
    });
    // rewardBalloonPop/setUser/queryClient are stable across renders; only
    // re-run when the score itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score]);

  const handleMissed = (balloonId: number) => {
    setBalloons((current) => current.filter((b) => b.id !== balloonId));
  };

  const handlePop = (balloon: FallingBalloon, rect: DOMRect) => {
    setBalloons((current) => current.filter((b) => b.id !== balloon.id));

    if (balloon.isQuizBalloon) {
      playPopSound();
      // Clears every other balloon too — a calm, empty screen behind the
      // quiz overlay instead of balloons drifting past its translucent scrim.
      setBalloons([]);
      setQuizQuestions(buildBalloonQuizQuestions(mode, selectedPictureItems ?? []));
      return;
    }

    const containerRect = containerRef.current?.getBoundingClientRect();
    const x = rect.left + rect.width / 2 - (containerRect?.left ?? 0);
    const y = rect.top + rect.height / 2 - (containerRect?.top ?? 0);

    const burst: Particle[] = Array.from({ length: PARTICLES_PER_POP }, () => {
      const angle = Math.random() * Math.PI * 2;
      const distance = randomBetween(24, 56);
      return {
        id: nextParticleId++,
        x,
        y,
        color: balloon.color,
        dx: Math.cos(angle) * distance,
        dy: Math.sin(angle) * distance,
      };
    });
    setParticles((current) => [...current, ...burst]);
    setTimeout(() => {
      const burstIds = new Set(burst.map((p) => p.id));
      setParticles((current) => current.filter((p) => !burstIds.has(p.id)));
    }, 550);

    playPopSound();
    if (!muted) speak(balloon.speech, language, "short");
    setScore((current) => current + 1);
    setScoreBump((current) => current + 1);
  };

  const handleQuizFinish = (passed: boolean) => {
    setQuizQuestions(null);
    if (!passed) return;

    playDiamondChime();
    const badgeRect = scoreBadgeRef.current?.getBoundingClientRect();
    const from = badgeRect
      ? { x: badgeRect.left + badgeRect.width / 2, y: badgeRect.top + badgeRect.height / 2 }
      : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    setFlyingDiamond({ id: nextRewardId++, from });

    rewardBalloonQuiz.mutate(undefined, {
      onSuccess: (response) => {
        setUser(mapApiUserToAuthUser(response.user));
        queryClient.invalidateQueries({ queryKey: getMeQueryKey() });
      },
    });
  };

  return (
    <div ref={containerRef} className="relative min-h-[32rem] flex-1 overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center gap-1 pt-6 text-center">
        <p className="text-xl font-bold text-gray-700">{t("title")}</p>
        <p className="text-sm text-gray-500">{t("subtitle")}</p>
      </div>

      <div
        ref={scoreBadgeRef}
        key={scoreBump}
        role="status"
        aria-label={t("score", { count: score })}
        className="pointer-events-none absolute right-4 top-4 z-10 flex items-center gap-1 rounded-full bg-white px-3 py-2 shadow-lg ring-2 ring-rose-200"
        style={{ animation: scoreBump > 0 ? "score-pop 0.3s ease-out" : undefined }}
      >
        <RubyIcon />
        <span className="flex h-9 min-w-9 items-center justify-center rounded-full bg-rose-600 px-2 text-lg font-extrabold text-white">
          {score}
        </span>
      </div>

      {flyingDiamond && (
        <FlyingDiamond
          key={flyingDiamond.id}
          from={flyingDiamond.from}
          onDone={() => setFlyingDiamond((current) => (current?.id === flyingDiamond.id ? null : current))}
        />
      )}

      <button
        type="button"
        aria-label={t("settingsButton")}
        onClick={() => setSettingsOpen((current) => !current)}
        className="absolute left-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg shadow-lg ring-2 ring-gray-200"
      >
        ⚙️
      </button>

      <button
        type="button"
        aria-label={musicEnabled ? t("musicOnLabel") : t("musicOffLabel")}
        onClick={() => setMusicEnabled(!musicEnabled)}
        className="absolute left-16 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg shadow-lg ring-2 ring-gray-200"
      >
        {musicEnabled ? "🎵" : "🔇"}
      </button>

      {settingsOpen && (
        <div className="absolute left-4 top-16 z-10 flex w-56 flex-col gap-3 rounded-2xl bg-white p-4 text-sm shadow-lg ring-2 ring-gray-200">
          <label className="flex flex-col gap-1">
            <span className="font-medium text-gray-700">{t("modeLabel")}</span>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as BalloonMode)}
              className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700"
            >
              {BALLOON_MODES.map((m) => (
                <option key={m} value={m}>
                  {t(`mode.${m}`)}
                </option>
              ))}
            </select>
          </label>
          {isPictureMode && (
            <label className="flex flex-col gap-1">
              <span className="font-medium text-gray-700">
                {t("cardCountLabel")} ({cardCount})
              </span>
              <input
                type="range"
                min={MIN_CARD_COUNT}
                max={MAX_CARD_COUNT}
                value={cardCount}
                onChange={(e) => setCardCount(Number(e.target.value))}
              />
            </label>
          )}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-gray-700">{t("languageLabel")}</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as GameLanguage)}
              className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700"
            >
              {GAME_LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {t(`language.${lang}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={muted} onChange={(e) => setMuted(e.target.checked)} />
            <span className="font-medium text-gray-700">{t("mutedLabel")}</span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-gray-700">{t("musicVolumeLabel")}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={musicVolume}
              onChange={(e) => setMusicVolume(Number(e.target.value))}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-gray-700">{t("sizeLabel")}</span>
            <input
              type="range"
              min={MIN_SIZE}
              max={MAX_SIZE}
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-gray-700">{t("countLabel")}</span>
            <input
              type="range"
              min={MIN_COUNT}
              max={MAX_COUNT}
              value={maxOnScreen}
              onChange={(e) => setMaxOnScreen(Number(e.target.value))}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-gray-700">{t("speedLabel")}</span>
            <input
              type="range"
              min={MIN_SPEED}
              max={MAX_SPEED}
              step={0.1}
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            />
          </label>
        </div>
      )}

      {screenMode === "learning" && selectedPictureItems ? (
        <BalloonLearningCards items={selectedPictureItems} language={language} muted={muted} />
      ) : (
        balloons.map((balloon) => (
          <BalloonNode
            key={balloon.id}
            balloon={balloon}
            label={balloon.isQuizBalloon ? t("heartBalloon") : t("balloon")}
            onPop={handlePop}
            onMissed={handleMissed}
          />
        ))
      )}

      {quizQuestions && (
        <BalloonQuiz questions={quizQuestions} language={language} muted={muted} onFinish={handleQuizFinish} />
      )}

      {isPictureMode && (
        <div className="absolute bottom-4 right-4 z-10 flex overflow-hidden rounded-full bg-white p-1 text-sm font-bold shadow-lg ring-2 ring-gray-200">
          <button
            type="button"
            onClick={() => setScreenMode("game")}
            className={`rounded-full px-3 py-1.5 transition-colors ${
              screenMode === "game" ? "bg-emerald-500 text-white" : "text-gray-600"
            }`}
          >
            {t("screenModeGame")}
          </button>
          <button
            type="button"
            onClick={() => {
              // Empties any falling balloons behind the card grid — same as
              // popping the bonus-quiz heart balloon does — rather than
              // leaving them to keep drifting/landing underneath it.
              setBalloons([]);
              setScreenMode("learning");
            }}
            className={`rounded-full px-3 py-1.5 transition-colors ${
              screenMode === "learning" ? "bg-emerald-500 text-white" : "text-gray-600"
            }`}
          >
            {t("screenModeLearning")}
          </button>
        </div>
      )}

      {particles.map((particle) => (
        <span
          key={particle.id}
          className="pointer-events-none absolute h-2 w-2 rounded-full"
          style={
            {
              left: particle.x,
              top: particle.y,
              backgroundColor: particle.color,
              animation: "particle-burst 0.5s ease-out forwards",
              "--dx": `${particle.dx}px`,
              "--dy": `${particle.dy}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
