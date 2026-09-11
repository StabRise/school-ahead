from django.db import models

from accounts.models import TutorProfile
from common.models import TimeStampedModel
from common.storage import story_asset_upload_to, story_cover_upload_to


class Story(TimeStampedModel):
    """A tutor-authored "Казки" (Stories) reading-minigame story, stored in
    the DB alongside the pre-existing static ones under frontend's
    public/static/stories/<title>/story.md (see docs/preschool/games/
    reading/Stories.md). `content` uses the exact same body format as those
    story.md files — leading "#" heading line(s), then a Markdown body
    containing "{...}" syllable/image/audio/video/YouTube card groups (see
    frontend's lib/story-parser.ts::parseStory) — so the game's existing
    parser/renderer needs no changes to read a DB-backed story. No
    draft/publish flag: a saved story is immediately live, same as the
    app's other global tutor-editable catalogs (avatars, furniture)."""

    title = models.CharField(max_length=255)
    subtitle = models.CharField(max_length=255, blank=True)
    cover_image = models.FileField(upload_to=story_cover_upload_to, blank=True)
    content = models.TextField(blank=True)
    created_by = models.ForeignKey(TutorProfile, on_delete=models.SET_NULL, null=True, blank=True, related_name='stories')

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.title


class StoryAsset(TimeStampedModel):
    """An image uploaded through the story editor's "insert image" toolbar
    button and embedded into Story.content as `{ <absolute file URL> }`
    (see frontend's story-markdown-editor.tsx). Tracked as its own row
    (rather than left as a bare untracked upload) purely so deleting a
    Story can clean up the images it references."""

    story = models.ForeignKey(Story, on_delete=models.CASCADE, related_name='assets')
    image = models.FileField(upload_to=story_asset_upload_to)

    class Meta:
        ordering = ['created_at']
