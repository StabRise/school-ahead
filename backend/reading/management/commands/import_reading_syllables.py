"""Imports Syllable rows from the reading game's filesystem-driven picture
cards at frontend/apps/web/public/static/letters/<Consonant>/ — see
docs/preschool/games/reading/README.md, and mirrors the file convention the
(now superseded for this data) frontend/apps/web/app/api/reading-game-mode/
route.ts reads directly off disk:

  <consonant>/<Word>.png|jpg|jpeg|webp  — a picture card; filename is the word
  <consonant>/<Word>.mp3                — optional recorded pronunciation of
                                           that same word, matched case-
                                           insensitively
  <consonant>/<Syllable>.mp3            — optional recorded pronunciation of
                                           a bare two-letter syllable (e.g.
                                           "Ма.mp3"), shared by every card
                                           whose word starts with it

A handful of leftover, not-yet-renamed generated images (English filenames
like "koala_on_white...jpeg") don't start with their folder's consonant and
are skipped.

Safe to re-run: an existing (language, first_letter, second_part, word) row
is left untouched. Within a freshly-imported syllable group, the
alphabetically-first word is flagged `is_default` (the schema allows only
one default per group — see Syllable.Meta.constraints).

Usage:
    uv run manage.py import_reading_syllables
"""

from pathlib import Path

from django.conf import settings
from django.core.files import File
from django.core.management.base import BaseCommand

from lessons.models import QuizLanguage
from reading.models import Syllable

LETTERS_DIR = Path(settings.BASE_DIR).parent / 'frontend' / 'apps' / 'web' / 'public' / 'static' / 'letters'
IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp'}
AUDIO_EXTENSIONS = {'.mp3'}


class Command(BaseCommand):
    help = "Imports Syllable rows from public/static/letters/<Consonant>/ picture cards."

    def handle(self, *args, **options):
        if not LETTERS_DIR.is_dir():
            self.stderr.write(self.style.ERROR(f'{LETTERS_DIR} does not exist'))
            return

        created_count = 0
        skipped_count = 0
        # Which (first_letter, second_part) groups already got their one
        # is_default=True row, tracked across the whole run since a
        # syllable's words can come from a single folder pass.
        default_seen: set[tuple[str, str]] = set()

        for folder in sorted(p for p in LETTERS_DIR.iterdir() if p.is_dir()):
            consonant = folder.name
            images: list[tuple[str, Path]] = []
            audio_by_lower_word: dict[str, Path] = {}
            syllable_audio_files: dict[str, Path] = {}

            for entry in sorted(folder.iterdir()):
                if not entry.is_file() or entry.name.startswith('.'):
                    continue
                ext = entry.suffix.lower()
                word = entry.stem
                if ext in IMAGE_EXTENSIONS:
                    images.append((word, entry))
                elif ext in AUDIO_EXTENSIONS:
                    audio_by_lower_word[word.lower()] = entry
                    if len(word) == 2:
                        syllable_audio_files[word.upper()] = entry

            for word, image_path in images:
                # A few filenames use a straight double quote where Ukrainian
                # uses an apostrophe (e.g. хом"як -> хом'як).
                normalized = word.replace('"', "'")
                if len(normalized) < 2 or normalized[0].upper() != consonant:
                    skipped_count += 1
                    continue

                first_letter = normalized[0].upper()
                second_part = normalized[1].upper()
                display_word = normalized[:1].upper() + normalized[1:]
                group = (first_letter, second_part)

                syllable, created = Syllable.objects.get_or_create(
                    first_letter=first_letter,
                    second_part=second_part,
                    word=display_word,
                    language=QuizLanguage.UK,
                    defaults={'is_default': group not in default_seen},
                )
                if not created:
                    if syllable.is_default:
                        default_seen.add(group)
                    continue

                default_seen.add(group)
                created_count += 1

                with open(image_path, 'rb') as f:
                    syllable.icon.save(image_path.name, File(f), save=False)

                word_audio_path = audio_by_lower_word.get(normalized.lower())
                if word_audio_path:
                    with open(word_audio_path, 'rb') as f:
                        syllable.word_audio.save(word_audio_path.name, File(f), save=False)

                syllable_audio_path = syllable_audio_files.get(f'{first_letter}{second_part}')
                if syllable_audio_path:
                    with open(syllable_audio_path, 'rb') as f:
                        syllable.syllable_audio.save(syllable_audio_path.name, File(f), save=False)

                syllable.save()

        self.stdout.write(self.style.SUCCESS(f'Imported {created_count} syllable cards, skipped {skipped_count}.'))
