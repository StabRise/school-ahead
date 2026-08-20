import uuid
from pathlib import PurePosixPath


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
