import datetime

from ninja import Schema

from common.images import icon_url, thumbnail_url


def _absolute_file_url(file_field, context: dict) -> str | None:
    """See academics/schemas.py's identical helper — file URLs are
    host-relative and the frontend is a separate origin (no BFF)."""
    if not file_field:
        return None
    request = context.get('request')
    return request.build_absolute_uri(file_field.url) if request else file_field.url


class StoryAssetOut(Schema):
    id: int
    # The file's current URL — with S3 querystring auth a presigned link
    # that expires, so never store it; Story.content references the asset
    # by `ref` instead (see models.STORY_ASSET_REF_PREFIX).
    url: str
    ref: str
    # A scaled-down copy for the editor sidebar's preview — None for
    # audio/video.
    thumbnail_url: str | None
    original_filename: str

    @staticmethod
    def resolve_url(obj, context):
        return _absolute_file_url(obj.file, context)

    @staticmethod
    def resolve_thumbnail_url(obj, context):
        if not obj.is_image:
            return None
        return thumbnail_url(obj.file, obj.thumbnail, context.get('request'))


class StoryAssetUrlOut(Schema):
    url: str


class StoryOut(Schema):
    id: int
    title: str
    subtitle: str
    slug: str
    cover_image: str | None
    is_published: bool
    updated_at: datetime.datetime

    @staticmethod
    def resolve_cover_image(obj, context):
        # The thumbnail, not the original — see common/images.py.
        return thumbnail_url(obj.cover_image, obj.cover_thumbnail, context.get('request'))


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


class GameOut(Schema):
    id: int
    title: str
    url: str
    icon_url: str | None

    @staticmethod
    def resolve_icon_url(obj, context):
        return icon_url(obj, context.get('request'))


class GameCategoryOut(Schema):
    id: int
    name: str
    games: list[GameOut]

    @staticmethod
    def resolve_games(obj, context):
        # Prefetched with only the active games — see api.list_games.
        return obj.active_games
