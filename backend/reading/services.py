import io
import json
import zipfile
from dataclasses import dataclass
from pathlib import PurePosixPath

from django.core.files.base import ContentFile
from ninja.files import UploadedFile

from lessons.models import QuizLanguage

from .models import Syllable

IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp'}
AUDIO_EXTENSIONS = {'.mp3'}
WORDS_FILE = 'words.json'


@dataclass
class SyllableImportSummary:
    created: int
    updated: int
    skipped: int


def _decode_name(info: zipfile.ZipInfo) -> str:
    """zipfile only decodes a name as UTF-8 when the entry's own UTF-8 flag
    bit is set — otherwise (the classic "legacy" flag) it decodes the raw
    bytes as cp437, which mangles anything non-ASCII, e.g. this archive's
    Cyrillic consonant folders/filenames. Many zip tools (notably the CLI
    `zip` on macOS, depending on locale) never set that flag even for a
    UTF-8-encoded name — re-decode via cp437's own encoder to recover the
    original bytes, then UTF-8-decode those. A name that was genuinely
    cp437/ASCII to begin with round-trips through this unchanged."""
    if info.flag_bits & 0x800:
        return info.filename
    try:
        return info.filename.encode('cp437').decode('utf-8')
    except UnicodeError:
        return info.filename


def _group_has_default(language: str, first_letter: str, second_part: str) -> bool:
    return Syllable.objects.filter(
        language=language, first_letter=first_letter, second_part=second_part, is_default=True
    ).exists()


def import_syllables_archive(uploaded: UploadedFile, language: str = QuizLanguage.UK) -> SyllableImportSummary:
    """Imports Syllable rows from a ZIP — the tutor "Syllables" page's
    (/tutor/syllables) upload button. Auto-detects, per folder anywhere in
    the archive, which of two legacy asset-folder shapes it's looking at
    (folders can be mixed within one archive):

    - `<consonant>/words.json` + `<consonant>/<syllable>.png` (frontend/
      apps/web/public/static/syllables/, see docs/preschool/games/reading/
      Cards.md) — one card per syllable, `words.json` (`{"ба": "баран"}`)
      giving its `word`; see _import_words_json_folder.
    - `<consonant>/<Word>.<ext>` [+ `<consonant>/<Syllable>.mp3`], no
      words.json (frontend/apps/web/public/static/letters/, see docs/
      preschool/games/reading/README.md) — one card per picture, `word`
      taken straight from its filename, optionally paired with a same-
      named or bare-syllable audio recording; see _import_letters_folder,
      which mirrors reading.management.commands.import_reading_syllables's
      filesystem scan exactly, just reading from the zip instead of disk.

    Grouping is by each file's own immediate parent directory (not a fixed
    nesting depth), so this tolerates the extra top-level folder a zipped-
    up directory (macOS/Windows) adds.

    Safe to re-run: an existing (language, first_letter, second_part, word)
    row has its icon/audio replaced (counted as `updated`) rather than
    duplicated. A newly created row only gets `is_default=True` when its
    syllable group doesn't already have a default card (see Syllable.
    Meta's constraint) — e.g. one already imported from the other shape.

    Every row is created in `language` — the tutor's pick next to the
    upload button (Ukrainian by default)."""
    entries_by_dir: dict[PurePosixPath, list[tuple[str, zipfile.ZipInfo]]] = {}
    with zipfile.ZipFile(io.BytesIO(uploaded.read())) as archive:
        for info in archive.infolist():
            if info.is_dir():
                continue
            name = _decode_name(info)
            if '__MACOSX' in name or PurePosixPath(name).name.startswith('.'):
                continue
            entries_by_dir.setdefault(PurePosixPath(name).parent, []).append((name, info))

        created = 0
        updated = 0
        skipped = 0

        for directory, entries in entries_by_dir.items():
            words_info = next((info for name, info in entries if PurePosixPath(name).name.lower() == WORDS_FILE), None)
            if words_info is not None:
                c, u, s = _import_words_json_folder(archive, entries, words_info, language)
            else:
                c, u, s = _import_letters_folder(archive, directory, entries, language)
            created += c
            updated += u
            skipped += s

    return SyllableImportSummary(created=created, updated=updated, skipped=skipped)


def _import_words_json_folder(
    archive: zipfile.ZipFile, entries: list[tuple[str, zipfile.ZipInfo]], words_info: zipfile.ZipInfo, language: str
) -> tuple[int, int, int]:
    """`words.json` maps a 2-letter syllable to a word; each key's sibling
    image (filename minus extension matching the key) becomes that card's
    icon. A key with no matching image, or shorter than 2 letters, is
    skipped."""
    words: dict[str, str] = json.loads(archive.read(words_info).decode('utf-8'))
    images_by_stem = {
        PurePosixPath(name).stem.lower(): info
        for name, info in entries
        if PurePosixPath(name).suffix.lower() in IMAGE_EXTENSIONS
    }

    created = 0
    updated = 0
    skipped = 0
    for syllable_key, word in words.items():
        normalized = syllable_key.strip()
        image_info = images_by_stem.get(normalized.lower())
        if len(normalized) < 2 or image_info is None:
            skipped += 1
            continue

        first_letter = normalized[0].upper()
        second_part = normalized[1].upper()
        display_word = word.strip()
        display_word = (display_word[:1].upper() + display_word[1:]) if display_word else normalized.upper()

        syllable, was_created = Syllable.objects.get_or_create(
            first_letter=first_letter,
            second_part=second_part,
            word=display_word,
            language=language,
            defaults={'is_default': not _group_has_default(language, first_letter, second_part)},
        )
        icon_name = PurePosixPath(_decode_name(image_info)).name
        syllable.icon.save(icon_name, ContentFile(archive.read(image_info)), save=True)
        created += was_created
        updated += not was_created
    return created, updated, skipped


def _import_letters_folder(
    archive: zipfile.ZipFile, directory: PurePosixPath, entries: list[tuple[str, zipfile.ZipInfo]], language: str
) -> tuple[int, int, int]:
    """No words.json — every image directly inside the directory is one
    card, its filename (minus extension) the word. A directory named with a
    single letter (e.g. `Б/`) is that consonant's folder: an image whose
    word doesn't start with it (a leftover, not-yet-renamed file) is
    skipped. Any other directory (e.g. a `litery/` of mixed words) or the
    archive root just takes each card's letter from its own word. A same-named
    `.mp3` becomes that card's word_audio; an exactly-2-letter one is
    shared as syllable_audio by every card whose word starts with it —
    same rules as reading.management.commands.import_reading_syllables."""
    consonant = directory.name.upper() if len(directory.name) == 1 else None

    images: list[tuple[str, zipfile.ZipInfo]] = []
    audio_by_lower_word: dict[str, zipfile.ZipInfo] = {}
    syllable_audio_by_syllable: dict[str, zipfile.ZipInfo] = {}
    for name, info in entries:
        stem = PurePosixPath(name).stem
        ext = PurePosixPath(name).suffix.lower()
        if ext in IMAGE_EXTENSIONS:
            images.append((stem, info))
        elif ext in AUDIO_EXTENSIONS:
            audio_by_lower_word[stem.lower()] = info
            if len(stem) == 2:
                syllable_audio_by_syllable[stem.upper()] = info

    created = 0
    updated = 0
    skipped = 0
    for word, image_info in images:
        # A few filenames use a straight double quote where Ukrainian uses
        # an apostrophe (e.g. хом"як -> хом'як).
        normalized = word.replace('"', "'")
        if len(normalized) < 2 or (consonant is not None and normalized[0].upper() != consonant):
            skipped += 1
            continue

        first_letter = normalized[0].upper()
        second_part = normalized[1].upper()
        display_word = normalized[:1].upper() + normalized[1:]

        syllable, was_created = Syllable.objects.get_or_create(
            first_letter=first_letter,
            second_part=second_part,
            word=display_word,
            language=language,
            defaults={'is_default': not _group_has_default(language, first_letter, second_part)},
        )
        syllable.icon.save(PurePosixPath(_decode_name(image_info)).name, ContentFile(archive.read(image_info)), save=False)

        word_audio_info = audio_by_lower_word.get(normalized.lower())
        if word_audio_info:
            syllable.word_audio.save(
                PurePosixPath(_decode_name(word_audio_info)).name, ContentFile(archive.read(word_audio_info)), save=False
            )

        syllable_audio_info = syllable_audio_by_syllable.get(f'{first_letter}{second_part}')
        if syllable_audio_info:
            syllable.syllable_audio.save(
                PurePosixPath(_decode_name(syllable_audio_info)).name,
                ContentFile(archive.read(syllable_audio_info)),
                save=False,
            )

        syllable.save()
        created += was_created
        updated += not was_created
    return created, updated, skipped
