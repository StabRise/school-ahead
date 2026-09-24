import re
from pathlib import PurePosixPath

from django.core.validators import FileExtensionValidator
from django.db import models

from accounts.models import TutorProfile
from common.images import GAME_ICON_SIDE, STORY_ASSET_THUMBNAIL_SIDE, STORY_COVER_SIDE, icon_thumbnail_field, thumbnail_field
from common.models import TimeStampedModel
from common.storage import background_music_upload_to, game_icon_upload_to, story_asset_upload_to, story_cover_upload_to
from lessons.models import QuizLanguage

from .slugs import slugify_title

# Matches the frontend's IMAGE_FILENAME_RE/AUDIO_FILENAME_RE/VIDEO_FILENAME_RE
# (lib/story-parser.ts) — the only extensions a "{...}" card group in
# Story.content can resolve as an illustration, clip, or read-aloud button.
STORY_ASSET_EXTENSIONS = [
    'jpg', 'jpeg', 'png', 'webp', 'gif',
    'mp3', 'wav', 'ogg', 'm4a',
    'mp4', 'webm', 'mov', 'avi',
]
STORY_IMAGE_EXTENSIONS = {'jpg', 'jpeg', 'png', 'webp', 'gif'}

# How Story.content references an uploaded StoryAsset: `{ /api/story-asset/
# <stored file name> }` — a stable, host-relative path served by the
# frontend's app/api/story-asset/[name]/route.ts, which redirects to the
# file's current URL (see get_story_asset_url in api.py). The content never
# holds the storage URL itself: with AWS_S3_QUERYSTRING_AUTH that is a
# presigned link that expires an hour after it was issued, and its
# "?...&Expires=..." query string doesn't end in a file extension, so
# the frontend's story-parser.ts wouldn't recognise it as an image anyway.
STORY_ASSET_REF_PREFIX = '/api/story-asset/'
# The stored file name story_asset_upload_to gives every asset — a random
# hex name plus the original extension (common.storage._unique_path).
STORY_ASSET_NAME_RE = re.compile(r'^[0-9a-f]{32}\.[A-Za-z0-9]{1,5}$')


class Story(TimeStampedModel):
    """A tutor-authored "Казки" (Stories) reading-minigame story, stored in
    the DB alongside the pre-existing static ones under frontend's
    public/static/stories/<title>/story.md (see docs/preschool/games/
    reading/Stories.md). `content` uses the exact same body format as those
    story.md files — leading "#" heading line(s), then a Markdown body
    containing "{...}" syllable/image/audio/video/YouTube card groups (see
    frontend's lib/story-parser.ts::parseStory) — so the game's existing
    parser/renderer needs no changes to read a DB-backed story.

    `is_published` gates visibility to the public/game-facing endpoints
    only (see preschool/api.py's list_stories/get_story) — a tutor's own
    `/preschool/tutor/stories*` endpoints always see every story regardless
    of this flag, since they're the editing surface. A newly created story
    starts unpublished (see create_tutor_story) so a tutor can build it up
    (cover, content, inserted assets) before making it visible to
    students."""

    title = models.CharField(max_length=255)
    subtitle = models.CharField(max_length=255, blank=True)
    cover_image = models.FileField(upload_to=story_cover_upload_to, blank=True)
    # What the API sends in place of `cover_image` — see common/images.py.
    cover_thumbnail = thumbnail_field('cover_image', STORY_COVER_SIDE)
    content = models.TextField(blank=True)
    # The language the story is written in — picked in the editor and on
    # import, Ukrainian by default.
    language = models.CharField(max_length=2, choices=QuizLanguage.choices, default=QuizLanguage.UK)
    is_published = models.BooleanField(default=False)
    created_by = models.ForeignKey(TutorProfile, on_delete=models.SET_NULL, null=True, blank=True, related_name='stories')
    # Auto-generated from `title` once, at creation, and left untouched by
    # later title edits (see save() below) — the public game route
    # (frontend's /games/stories/<slug>) is keyed on this, and letting it
    # keep shifting on every autosave would break that link. Transliterated
    # via slugs.slugify_title, not django's slugify() directly, since that
    # has no Cyrillic decomposition and would otherwise drop the whole title.
    slug = models.SlugField(max_length=255, unique=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = unique_story_slug(self.title)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.title


def unique_story_slug(title: str, exclude_pk: int | None = None) -> str:
    """First `slugify_title(title)` not already taken by another Story
    (excluding `exclude_pk`, e.g. the row being saved) — falls back to
    "story" as the base when the title transliterates to nothing (e.g. an
    all-punctuation title), then disambiguates with -2, -3, ... suffixes."""
    base = slugify_title(title) or 'story'
    candidate = base
    suffix = 2
    while Story.objects.filter(slug=candidate).exclude(pk=exclude_pk).exists():
        candidate = f'{base}-{suffix}'
        suffix += 1
    return candidate


class StoryAsset(TimeStampedModel):
    """One image/audio/video file uploaded through the story editor's asset
    sidebar and, once dragged into the text, embedded in Story.content as
    `{ <ref> }` (see `ref` below and frontend's story-markdown-editor.tsx /
    story-asset-sidebar.tsx) — the same card syntax static stories embed a
    local filename with. `original_filename` mirrors
    house.models.FurnitureTexture's field of the same name — storage always
    renames the file (common.storage._unique_path), so this is the only
    place the tutor-facing name survives, for the sidebar's file-name label.
    Tracked as its own row (rather than left as a bare untracked upload)
    purely so deleting a Story (or one unused asset) can clean up after
    itself."""

    story = models.ForeignKey(Story, on_delete=models.CASCADE, related_name='assets')
    file = models.FileField(
        upload_to=story_asset_upload_to,
        validators=[FileExtensionValidator(STORY_ASSET_EXTENSIONS)],
    )
    original_filename = models.CharField(max_length=255, blank=True, default='')
    # The sidebar's preview of an image asset — never made for audio/video
    # (see is_image).
    thumbnail = thumbnail_field('file', STORY_ASSET_THUMBNAIL_SIDE)

    class Meta:
        ordering = ['created_at']

    @property
    def stored_name(self) -> str:
        return PurePosixPath(self.file.name).name

    @property
    def ref(self) -> str:
        """How Story.content references this asset — see
        STORY_ASSET_REF_PREFIX."""
        return f'{STORY_ASSET_REF_PREFIX}{self.stored_name}'

    @property
    def is_image(self) -> bool:
        return PurePosixPath(self.file.name).suffix.lstrip('.').lower() in STORY_IMAGE_EXTENSIONS

    def __str__(self):
        return self.original_filename or self.file.name


class GameCategory(TimeStampedModel):
    """One panel of the /games picker (frontend's games-page.tsx) — e.g.
    Читання, Математика. An inactive category hides every game in it."""

    name = models.CharField(max_length=100)
    is_active = models.BooleanField(default=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order', 'id']
        verbose_name_plural = 'game categories'

    def __str__(self):
        return self.name


class Game(TimeStampedModel):
    """One card on the /games picker. `url` is where the card leads — a
    site path like "/games/balloons" (navigated to locale-aware) or an
    absolute http(s) URL. `is_active` hides the card without deleting it.
    A game with no `icon` falls back to its built-in static cover / SVG on
    the frontend (matched by `url`, see games-page.tsx)."""

    title = models.CharField(max_length=255)
    icon = models.FileField(upload_to=game_icon_upload_to, blank=True)
    # What the API sends in place of `icon` — see common/images.py.
    icon_thumbnail = icon_thumbnail_field(GAME_ICON_SIDE)
    url = models.CharField(max_length=500)
    category = models.ForeignKey(GameCategory, on_delete=models.PROTECT, related_name='games')
    is_active = models.BooleanField(default=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return self.title


BACKGROUND_MUSIC_EXTENSIONS = ['mp3', 'ogg', 'wav', 'm4a']


class BackgroundMusic(TimeStampedModel):
    """One looping track the /games minigames can play behind the game —
    the player's music settings (frontend's kit/game-music-config.tsx) let
    a child pick one of the active tracks or "random". `order` is the
    order they're listed in that picker."""

    title = models.CharField(max_length=255)
    file = models.FileField(
        upload_to=background_music_upload_to,
        validators=[FileExtensionValidator(BACKGROUND_MUSIC_EXTENSIONS)],
    )
    is_active = models.BooleanField(default=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order', 'id']
        verbose_name_plural = 'background music'

    def __str__(self):
        return self.title
