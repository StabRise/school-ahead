import random
import uuid
from pathlib import PurePosixPath

from django.conf import settings

SAMPLE_LESSON_ICONS_DIR = settings.BASE_DIR / 'sample_media' / 'lessons'


def random_sample_lesson_icon() -> tuple[str, bytes] | None:
    """A random pre-made icon from sample_media/lessons/ — used by the admin
    to give a brand-new Lesson a cute icon by default instead of shipping
    with none. See docs/interfaces/preschool.md."""
    if not SAMPLE_LESSON_ICONS_DIR.is_dir():
        return None
    candidates = [p for p in SAMPLE_LESSON_ICONS_DIR.iterdir() if p.is_file() and not p.name.startswith('.')]
    if not candidates:
        return None
    chosen = random.choice(candidates)
    return chosen.name, chosen.read_bytes()


def _unique_path(subdir: str, filename: str) -> str:
    """Renames every upload to a random name (extension kept) so on-disk
    names never collide and never leak the uploader's original filename."""
    ext = PurePosixPath(filename).suffix
    return f'{subdir}/{uuid.uuid4().hex}{ext}'


def lesson_attachment_upload_to(instance, filename: str) -> str:
    return _unique_path('lesson_attachments', filename)


def lesson_submission_upload_to(instance, filename: str) -> str:
    return _unique_path('lesson_submissions', filename)


def lesson_icon_upload_to(instance, filename: str) -> str:
    return _unique_path('lesson_icons', filename)


def subject_icon_upload_to(instance, filename: str) -> str:
    return _unique_path('subject_icons', filename)
