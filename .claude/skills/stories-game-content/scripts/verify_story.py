#!/usr/bin/env python3
"""Sanity-checks a story.md for the "Казки" (Stories) reading minigame
before it ships — see SKILL.md for what these checks mean and why.

Usage: python3 verify_story.py <path/to/story.md>
Exit code is non-zero if any check fails.
"""

import re
import sys

# Mirrors frontend/packages/preschool-games/src/lib/story-parser.ts exactly —
# keep these in sync with that file if it ever changes.
IMAGE_FILENAME_RE = re.compile(r"^[^\s{}]+\.(jpe?g|png|webp|gif)$", re.IGNORECASE)
AUDIO_FILENAME_RE = re.compile(r"^[^\s{}]+\.(mp3|wav|ogg|m4a)$", re.IGNORECASE)
GROUP_RE = re.compile(r"\{([^}]+)\}")


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: verify_story.py <path/to/story.md>", file=sys.stderr)
        return 2

    path = sys.argv[1]
    with open(path, encoding="utf-8") as f:
        text = f.read()

    ok = True

    opens, closes = text.count("{"), text.count("}")
    if opens != closes:
        print(f"FAIL: unbalanced braces ({{ = {opens}, }} = {closes}) — every "
              f"{{...}} group must close on the same line the parser sees it on")
        ok = False
    else:
        print(f"OK: braces balanced ({opens} groups)")

    groups = GROUP_RE.findall(text)
    if not groups:
        print("WARN: no {...} groups found — did you forget to mark any words?")

    for raw in groups:
        trimmed = raw.strip()
        if IMAGE_FILENAME_RE.match(trimmed):
            print(f"FAIL: group {{{raw}}} looks like an image filename "
                  f"(matches IMAGE_FILENAME_RE) — the parser will render it as "
                  f"a picture reference, not a syllable breakdown. This skill "
                  f"never intentionally creates image groups, so this is "
                  f"almost certainly an accidental collision (e.g. a word "
                  f"ending in a real extension) — rename or rephrase it.")
            ok = False
        elif AUDIO_FILENAME_RE.match(trimmed):
            print(f"FAIL: group {{{raw}}} looks like an audio filename "
                  f"(matches AUDIO_FILENAME_RE) — same issue as above but for "
                  f"sound clips.")
            ok = False

    if ok:
        print(f"All checks passed for {path}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
