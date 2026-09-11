from django.http import HttpRequest
from django.shortcuts import get_object_or_404
from ninja import File, Form, Router
from ninja.files import UploadedFile
from ninja.responses import Status

from common.auth import CookieOrBearerJWTAuth
from common.csrf import require_csrf
from common.permissions import ensure_is_tutor

from .models import Story, StoryAsset
from .schemas import StoryAssetOut, StoryDetailOut, StoryOut

# Router-level auth defaults to tutor-only (CookieOrBearerJWTAuth) — the two
# read endpoints below override it to auth=None, since the "Казки" game is
# reachable without a session (see frontend's middleware.ts PUBLIC_PATHS —
# "/games" is genuinely anonymous) and DB-backed stories must be just as
# visible there as the static ones already are.
router = Router(tags=['preschool'], auth=CookieOrBearerJWTAuth())


@router.get('/stories', response=list[StoryOut], auth=None, operation_id='list_preschool_stories')
def list_stories(request: HttpRequest):
    """Every DB-backed story — merged with the static public/static/stories/
    ones by the frontend's /api/stories route. See docs/preschool/games/
    reading/Stories.md."""
    return Story.objects.all()


@router.get('/stories/{story_id}', response=StoryDetailOut, auth=None, operation_id='get_preschool_story')
def get_story(request: HttpRequest, story_id: int):
    return get_object_or_404(Story, id=story_id)


@router.post('/stories', response=StoryDetailOut, operation_id='create_preschool_story')
def create_story(
    request: HttpRequest,
    title: str = Form(...),
    subtitle: str = Form(''),
    content: str = Form(''),
    cover_image: UploadedFile | None = File(None),
):
    """Creates a new story — the tutor editor's "Create" action. Immediately
    live, no draft/publish step (see models.Story)."""
    require_csrf(request)
    ensure_is_tutor(request)

    story = Story(title=title, subtitle=subtitle, content=content, created_by=request.auth.tutor_profile)
    if cover_image is not None:
        story.cover_image.save(cover_image.name, cover_image, save=False)
    story.save()
    return story


@router.patch('/stories/{story_id}', response=StoryDetailOut, operation_id='update_preschool_story')
def update_story(
    request: HttpRequest,
    story_id: int,
    title: str | None = Form(None),
    subtitle: str | None = Form(None),
    content: str | None = Form(None),
    cover_image: UploadedFile | None = File(None),
):
    require_csrf(request)
    ensure_is_tutor(request)

    story = get_object_or_404(Story, id=story_id)
    if title is not None:
        story.title = title
    if subtitle is not None:
        story.subtitle = subtitle
    if content is not None:
        story.content = content
    if cover_image is not None:
        story.cover_image.save(cover_image.name, cover_image, save=False)
    story.save()
    return story


@router.delete('/stories/{story_id}', response={204: None}, operation_id='delete_preschool_story')
def delete_story(request: HttpRequest, story_id: int):
    require_csrf(request)
    ensure_is_tutor(request)
    get_object_or_404(Story, id=story_id).delete()
    return Status(204, None)


@router.post('/stories/{story_id}/images', response=StoryAssetOut, operation_id='create_preschool_story_image')
def create_story_image(request: HttpRequest, story_id: int, image: UploadedFile = File(...)):
    """Uploads one image for the "insert image" toolbar button in the story
    markdown editor — the returned absolute URL is spliced into the
    story's content as `{ <url> }` client-side, reusing the same card
    syntax static stories embed local filenames with (see
    frontend's lib/story-parser.ts)."""
    require_csrf(request)
    ensure_is_tutor(request)

    story = get_object_or_404(Story, id=story_id)
    asset = StoryAsset(story=story)
    asset.image.save(image.name, image, save=False)
    asset.save()
    return StoryAssetOut(url=request.build_absolute_uri(asset.image.url))
