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


def import_syllables_archive(uploaded: UploadedFile) -> SyllableImportSummary:
    """Imports Syllable rows from a ZIP shaped like the legacy "Картки"/
    "Казки" asset folder (frontend/apps/web/public/static/syllables/, see
    docs/preschool/games/reading/Cards.md) — the tutor "Syllables" page's
    (/tutor/syllables) upload button. A folder anywhere in the archive that
    has a `words.json` alongside it (`{"<syllable>": "<word>", ...}`, e.g.
    `{"ба": "баран"}`) is read as one consonant's set: each entry's
    syllable key gives `first_letter`/`second_part`, its value becomes
    `word`, and the sibling image whose filename (minus extension) matches
    the syllable key becomes `icon`. An entry with no matching image, or a
    syllable key shorter than 2 letters, is skipped. Grouping is by each
    file's own immediate parent directory (not a fixed nesting depth), so
    this tolerates the extra top-level folder a zipped-up directory
    (macOS/Windows) adds.

    Safe to re-run: an existing (language, first_letter, second_part, word)
    row has its icon replaced (counted as `updated`) rather than duplicated.
    A newly created row only gets `is_default=True` when its syllable group
    doesn't already have a default card (see Syllable.Meta's constraint) —
    e.g. one already imported by reading.management.commands.
    import_reading_syllables from the newer public/static/letters/ set."""
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

        for entries in entries_by_dir.values():
            words_info = next((info for name, info in entries if PurePosixPath(name).name.lower() == WORDS_FILE), None)
            if words_info is None:
                continue
            words: dict[str, str] = json.loads(archive.read(words_info).decode('utf-8'))
            images_by_stem = {
                PurePosixPath(name).stem.lower(): info
                for name, info in entries
                if PurePosixPath(name).suffix.lower() in IMAGE_EXTENSIONS
            }

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

                group_has_default = Syllable.objects.filter(
                    language=QuizLanguage.UK, first_letter=first_letter, second_part=second_part, is_default=True
                ).exists()
                syllable, was_created = Syllable.objects.get_or_create(
                    first_letter=first_letter,
                    second_part=second_part,
                    word=display_word,
                    language=QuizLanguage.UK,
                    defaults={'is_default': not group_has_default},
                )
                image_name = PurePosixPath(_decode_name(image_info)).name
                syllable.icon.save(image_name, ContentFile(archive.read(image_info)), save=True)
                created += was_created
                updated += not was_created

    return SyllableImportSummary(created=created, updated=updated, skipped=skipped)
