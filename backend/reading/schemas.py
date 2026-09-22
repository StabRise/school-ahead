from ninja import Schema

from common.images import icon_url


def _absolute_file_url(file_field, context: dict) -> str | None:
    """See academics/schemas.py's identical helper — file URLs are
    host-relative and the frontend is a separate origin (no BFF)."""
    if not file_field:
        return None
    request = context.get('request')
    return request.build_absolute_uri(file_field.url) if request else file_field.url


class SyllableOut(Schema):
    id: int
    first_letter: str
    second_part: str
    word: str
    language: str
    is_default: bool
    icon: str | None
    syllable_audio: str | None
    word_audio: str | None

    @staticmethod
    def resolve_icon(obj, context):
        return icon_url(obj, context.get('request'))

    @staticmethod
    def resolve_syllable_audio(obj, context):
        return _absolute_file_url(obj.syllable_audio, context)

    @staticmethod
    def resolve_word_audio(obj, context):
        return _absolute_file_url(obj.word_audio, context)
