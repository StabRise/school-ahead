#!/usr/bin/env bash
set -eu

# Lowercases every FILE name (not directory name) under a directory tree —
# written for public/static/reading-game (e.g. "Мавпа.png" -> "мавпа.png"),
# since some picture/sound files there were added capitalized and some
# weren't. The game itself already matches names case-insensitively (see
# app/api/reading-game-mode/route.ts), so this is purely for consistency on
# disk, not something the app depends on.
#
# Usage:
#   scripts/lowercase-filenames.sh [directory] [--dry-run]
#
# `directory` defaults to public/static/reading-game relative to this
# script. `--dry-run` prints what would be renamed without touching
# anything.
#
# Unicode-aware (uses python3 for the actual lower() call — plain `tr`
# doesn't reliably lowercase multi-byte characters like Cyrillic).
#
# Safe on a case-insensitive filesystem (the macOS default): renaming
# "Мавпа.png" -> "мавпа.png" there is a same-file case-only rename, which
# this detects via `-ef` (same device+inode) instead of treating it as a
# collision with an "already existing" target.
#
# Hidden files (dotfiles, e.g. .DS_Store) are left alone.

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DEFAULT_DIR="$SCRIPT_DIR/../public/static/reading-game"

DIR="$DEFAULT_DIR"
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    *) DIR="$arg" ;;
  esac
done

if [ ! -d "$DIR" ]; then
  echo "Not a directory: $DIR" >&2
  exit 1
fi

command -v python3 >/dev/null 2>&1 || { echo "python3 is required" >&2; exit 1; }

renamed=0
skipped=0

# Process substitution (not a pipe) so the loop runs in *this* shell, not a
# subshell — otherwise renamed/skipped below would never see the updates.
while IFS= read -r -d '' file; do
  dir=$(dirname -- "$file")
  base=$(basename -- "$file")
  lower=$(python3 -c 'import sys; sys.stdout.write(sys.argv[1].lower())' "$base")

  [ "$base" = "$lower" ] && continue

  target="$dir/$lower"

  if [ -e "$target" ] && ! [ "$file" -ef "$target" ]; then
    echo "Skipping (would overwrite a different file): $file -> $target" >&2
    skipped=$((skipped + 1))
    continue
  fi

  if [ "$DRY_RUN" = 1 ]; then
    echo "Would rename: $file -> $target"
  else
    mv -- "$file" "$target"
    echo "Renamed: $file -> $target"
  fi
  renamed=$((renamed + 1))
done < <(find "$DIR" -type f ! -name '.*' -print0)

echo "Done. ${DRY_RUN:+(dry run) }renamed=$renamed skipped=$skipped" >&2
