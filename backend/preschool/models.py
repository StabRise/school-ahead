from django.core.validators import FileExtensionValidator
from django.db import models

from accounts.models import TutorProfile
from common.models import TimeStampedModel
from common.storage import story_asset_upload_to, story_cover_upload_to

# Matches the frontend's IMAGE_FILENAME_RE/AUDIO_FILENAME_RE/VIDEO_FILENAME_RE
# (lib/story-parser.ts) — the only extensions a "{...}" card group in
# Story.content can resolve as an illustration, clip, or read-aloud button.
STORY_ASSET_EXTENSIONS = [
    'jpg', 'jpeg', 'png', 'webp', 'gif',
    'mp3', 'wav', 'ogg', 'm4a',
    'mp4', 'webm', 'mov', 'avi',
]


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
    content = models.TextField(blank=True)
    is_published = models.BooleanField(default=False)
    created_by = models.ForeignKey(TutorProfile, on_delete=models.SET_NULL, null=True, blank=True, related_name='stories')

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.title


class StoryAsset(TimeStampedModel):
    """One image/audio/video file uploaded through the story editor's asset
    sidebar and, once dragged into the text, embedded in Story.content as
    `{ <absolute file URL> }` (see frontend's story-markdown-editor.tsx /
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

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return self.original_filename or self.file.name
