---
name: stories-game-content
description: >
  Write a new fairy tale for the "Казки" (Stories) reading minigame —
  creates frontend/apps/web/public/static/stories/<Title>/story.md with
  the text broken into {syllable - cards} the way Колобок, Ріпка,
  Рукавичка and Коза-Дереза already are. Use this whenever the user asks
  to add a new казка/story to the reading game, mentions
  public/static/stories, wants a Ukrainian folk tale (Колобок, Ріпка,
  Лисичка-сестричка, Івасик-Телесик, etc.) turned into game content, or
  asks for a story with "прості слова"/simple-vowel words highlighted for
  early readers. Content-only — never touches stories-game.tsx or
  story-parser.ts.
---

# Stories game content

You're authoring one `story.md` for the "Казки" minigame — the third game
in the reading series alongside "Склади" and "Картки"
(`docs/preschool/games/reading/Stories.md` is the full design doc, worth
skimming if anything below is unclear). The game shows a fairy tale as
plain text, except chosen words are drawn as rows of hand-lettered
syllable cards a child can tap to see bigger — the exact same visual
vocabulary as the "Склади"/"Картки" games. This skill is only about
writing that content file correctly; it never edits
`frontend/packages/preschool-games/src/stories-game.tsx` or
`lib/story-parser.ts` — if a request needs the *rendering* to change,
that's a different, code-editing task.

## 1. Settle the two inputs

- **Title** — usually a well-known Ukrainian folk tale (Колобок,
  Рукавичка, Лисичка-сестричка і вовк-панібрат, Івасик-Телесик, ...), but
  the user may also hand you their own text to adapt. If they gave you a
  title only, you write the tale yourself — see §3.
- **"Simple" vowel set for this story** — which vowels a marked word is
  allowed to contain. Default to the five hard vowels **а, о, у, е, и**,
  since that's the reading stage this game's syllable/flashcard system
  (`frontend/apps/web/public/static/syllables/`) teaches first — **і**
  and the iotated **я, ю, є, ї** come later because they palatalize or
  merge with the preceding consonant in ways the two-letter flashcards
  don't capture. Ask if the user wants a different set (e.g. adding
  **і** for a slightly more advanced story) rather than assuming; don't
  ask about consonants — every consonant is always fair game.

## 2. Read one sibling story first

Before writing anything, open an existing `story.md` under
`frontend/apps/web/public/static/stories/` — `references/koza-dereza-example.md`
in this skill is a copy of one — so the tale you write actually sounds
like the others: short paragraphs, dialogue-heavy, folk narration ("Жив
собі...", repeated refrains the child will recognize on rereads). Matching
that voice matters more than hitting some exact word count.

## 3. Write the tale

Ukrainian folk tales are traditional, public-domain material with no
living author to credit — write your own retelling in the same register
as the sibling stories, don't paste in text you recall verbatim from a
specific published edition. If the user supplied their own story text
instead of naming a folk tale, adapt *that* instead of substituting a
tale of your own choosing.

**File layout** (`parseStory` in `lib/story-parser.ts` is the exact
contract): the *lowest*-level leading `#` heading becomes the story's
title, and any other leading heading becomes a subtitle shown in italics
above it. So:

```
# <Title>

### Українська народна казка

<body — plain Markdown paragraphs and dialogue lines>
```

The `###` line is optional — use it for "Українська народна казка", a
real adapter/author credit if one applies, or skip it entirely (see
Колобок/Рукавичка, which have no subtitle line at all).

Don't reference any `cover.<ext>` or `{ img.jpeg }` / `{ audio.mp3 }`
files — there's no artwork for a story this skill just wrote, so nothing
to point at yet. The picker just shows a plain 📖 for a story with no
cover, which is expected. Tell the user in your final summary that
they can drop a `cover.jpg` and any hand-photographed syllable-card
images or sound clips into the new folder later, with no code change
needed — mentioning this beats silently inventing filenames that would
404.

## 4. Mark the "simple" words

A word qualifies for a `{ ... }` syllable breakdown when **every vowel in
it belongs to the set from §1** (default а/о/у/е/и) — consonants are
never a constraint. A word with even one **і**, **я**, **ю**, **є**, or
**ї** (under the default set) stays as ordinary unmarked text; don't
force a rewrite just to dodge one — most sentences will have plenty of
other eligible words, and the ones that don't just stay prose.

**Density**: look at how the sibling stories mark words — a handful per
paragraph, favoring character names and recurring nouns/verbs/refrains a
child will meet again and again, not literally every eligible word in
the sentence. Marking everything turns the page into a wall of card rows
and defeats the point (reading connected text with occasional syllable
support). Skip trivial function words even when they'd technically
qualify — "та", "й", "на", "до", "і", "а", "б", "це", "як", "що" and the
like are never worth a card, they're too short/frequent to need one.

### The syllable-splitting algorithm

This is the same convention already visible throughout
`references/koza-dereza-example.md` (e.g. `{ во - в - к }` for "вовк",
`{ ве - д - мі - дь }` for "ведмідь", `{ ха - т - ці }` for "хатці") —
reverse-engineered here so you can apply it to new words precisely rather
than by eyeballing it:

Walk the word letter by letter, buffering consonants as you go:

1. **Hit a vowel** → look at the consonants buffered since the last
   vowel (or the start of the word). Emit all but the *last* one as their
   own one-letter segments, then emit `<last consonant><vowel>` as one
   two-letter segment. (Zero buffered consonants — the word starts with
   the vowel — just emit the vowel alone.) Clear the buffer and continue.
2. **Hit a consonant** → add it to the buffer, keep going.
3. **Hit `ь` or an apostrophe** → these never stand alone or start a
   card, because there's no flashcard for a bare soft sign. Attach it to
   whatever consonant is already at the end of the buffer (or, if the
   buffer's empty because you just closed a CV segment, that segment is
   already emitted so this rule only fires when the buffer is
   non-empty). Practically: it always rides along with the consonant
   right before it.
4. **End of word with leftover buffered consonants** (no vowel followed
   them) → emit each one as its own one-letter segment, same as the
   "all but last" case in step 1, except now there's no vowel to pair
   the last one with either — e.g. "вовк" ends with buffered `в, к`
   after the `во` segment closes, so both come out separately: `во - в
   - к`.

Treat `й` as an ordinary consonant for this purpose (it buffers and can
end up as its own trailing segment, e.g. "битий" → `би - ти - й`).

Join the resulting segments with `" - "` inside `{ }`, e.g.:

- вовк → `{ во - в - к }`
- баба → `{ ба - ба }`
- лисичка → `{ ли - си - ч - ка }`
- нежива → `{ не - жи - ва }`
- зупинив → `{ зу - пи - ни - в }`
- мороз → `{ мо - ро - з }`
- дурний → `{ ду - р - ни - й }`

Work through a candidate word with this procedure before wrapping it —
don't guess at the split from memory of how the word "sounds," since the
game's flashcards are specifically consonant+vowel pairs
(`public/static/syllables/<consonant>/<syllable>.png`), and a wrong split
just won't have a matching card (it'll silently fall back to plain
colored letters, which isn't wrong exactly, but a correct split makes
more of the flashcard set actually appear).

## 5. Verify before calling it done

Run the bundled checker against the file you wrote:

```
python3 .claude/skills/stories-game-content/scripts/verify_story.py \
  "frontend/apps/web/public/static/stories/<Title>/story.md"
```

It confirms every `{` has a matching `}`, and — more subtly — that none
of your syllable groups accidentally *look* like a media filename to the
parser. `lib/story-parser.ts` treats a `{...}` group as an image if its
whole trimmed content matches `/^[^\s{}]+\.(jpe?g|png|webp|gif)$/i`, or
audio if it matches `/^[^\s{}]+\.(mp3|wav|ogg|m4a)$/i` — this skill never
means to write those (no artwork exists yet, per §3), so a match here
almost always means a syllable group got mangled into something that
happens to end like a filename. Fix whatever it flags.

Then, if a dev server happens to already be running on
`http://localhost:3000` (check with e.g. `lsof -i :3000 -sTCP:LISTEN`
before assuming — don't start one yourself just for this), confirm the
new story is actually reachable:

```
curl -s http://localhost:3000/api/stories   # new slug should be listed
curl -s "http://localhost:3000/api/story?slug=<url-encoded folder name>"   # content should come back non-null
```

If nothing's running, just say so — there's no code change here, so unit
tests/lint aren't relevant, and it's fine to hand the file over
unverified against a live server as long as the checker script above
passed. (If you do end up checking it in a browser, remember a story
under `public/static/stories/` is served from a folder name that may
contain spaces/Cyrillic — `encodeURIComponent` it in the URL rather than
pasting it raw.)

## Wrap-up

Tell the user: the folder/file you created, that no cover or
illustration/audio files exist yet, a couple of the words you chose to
mark and why (especially any tricky ones from §1's excluded-vowel rule
that ended up unmarked), and how you verified it (checker script, plus
the curl checks if a server was up).
