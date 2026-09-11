import datetime

from ninja import Schema


def _absolute_file_url(file_field, context: dict) -> str | None:
    """See academics/schemas.py's identical helper — file URLs are
    host-relative and the frontend is a separate origin (no BFF)."""
    if not file_field:
        return None
    request = context.get('request')
    return request.build_absolute_uri(file_field.url) if request else file_field.url


class StoryAssetOut(Schema):
    id: int
    url: str
    original_filename: str

    @staticmethod
    def resolve_url(obj, context):
        return _absolute_file_url(obj.file, context)


class StoryOut(Schema):
    id: int
    title: str
    subtitle: str
    cover_image: str | None
    is_published: bool
    updated_at: datetime.datetime

    @staticmethod
    def resolve_cover_image(obj, context):
        return _absolute_file_url(obj.cover_image, context)


class StoryDetailOut(StoryOut):
    content: str
    assets: list[StoryAssetOut]

    @staticmethod
    def resolve_assets(obj, context):
        # The raw StoryAsset objects, not pre-built dicts/StoryAssetOut(...)
        # instances — StoryAssetOut.resolve_url always runs and expects a
        # real object with a `.file` FileField attribute (same as the
        # top-level list[StoryAssetOut] response from
        # create_tutor_story_assets), so feeding it anything else fails to
        # find `url`.
        return list(obj.assets.all())
