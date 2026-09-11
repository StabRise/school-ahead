import datetime

from ninja import Schema


def _absolute_file_url(file_field, context: dict) -> str | None:
    """See academics/schemas.py's identical helper — file URLs are
    host-relative and the frontend is a separate origin (no BFF)."""
    if not file_field:
        return None
    request = context.get('request')
    return request.build_absolute_uri(file_field.url) if request else file_field.url


class StoryOut(Schema):
    id: int
    title: str
    subtitle: str
    cover_image: str | None
    updated_at: datetime.datetime

    @staticmethod
    def resolve_cover_image(obj, context):
        return _absolute_file_url(obj.cover_image, context)


class StoryDetailOut(StoryOut):
    content: str


class StoryAssetOut(Schema):
    url: str
