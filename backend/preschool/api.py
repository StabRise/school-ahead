from pathlib import PurePosixPath

from django.http import HttpRequest
from django.shortcuts import get_object_or_404
from ninja import File, Form, Router
from ninja.errors import HttpError
from ninja.files import UploadedFile
from ninja.responses import Status

from common.auth import CookieOrBearerJWTAuth
from common.csrf import require_csrf
from common.permissions import ensure_is_tutor

from .models import STORY_ASSET_EXTENSIONS, Story, StoryAsset
from .schemas import StoryAssetOut, StoryDetailOut, StoryOut

# Router-level auth defaults to tutor-only (CookieOrBearerJWTAuth) — the two
# public read endpoints below override it to auth=None, since the "Казки"
# game is reachable without a session (see frontend's middleware.ts
# PUBLIC_PATHS — "/games" is genuinely anonymous). Every other endpoint here
# lives under a /tutor/... sub-path and is the editing surface: it sees
# every story regardless of is_published, while the public endpoints only
# ever see published ones (see models.Story's docstring).
router = Router(tags=['preschool'], auth=CookieOrBearerJWTAuth())


@router.get('/stories', response=list[StoryOut], auth=None, operation_id='list_preschool_stories')
def list_stories(request: HttpRequest):
    """Every published DB-backed story — merged with the static
    public/static/stories/ ones by the frontend's /api/stories route. See
    docs/preschool/games/reading/Stories.md."""
    return Story.objects.filter(is_published=True)


@router.get('/stories/{story_id}', response=StoryDetailOut, auth=None, operation_id='get_preschool_story')
def get_story(request: HttpRequest, story_id: int):
    return get_object_or_404(Story, id=story_id, is_published=True)


@router.get('/tutor/stories', response=list[StoryOut], operation_id='list_tutor_preschool_stories')
def list_tutor_stories(request: HttpRequest):
    """Every story, published or still a draft — the tutor stories list
    page. Unlike list_stories above, this is the editing surface, so
    is_published isn't filtered here."""
    ensure_is_tutor(request)
    return Story.objects.all()


@router.get('/tutor/stories/{story_id}', response=StoryDetailOut, operation_id='get_tutor_preschool_story')
def get_tutor_story(request: HttpRequest, story_id: int):
    ensure_is_tutor(request)
    return get_object_or_404(Story, id=story_id)


@router.post('/tutor/stories', response=StoryDetailOut, operation_id='create_tutor_preschool_story')
def create_tutor_story(request: HttpRequest, title: str = Form(...)):
    """Creates a new, unpublished story — the tutor stories list's "Add
    story" action immediately creates this (see frontend's
    app/[locale]/(tutor)/tutor/stories/new/page.tsx) so a real story id
    exists right away for asset uploads, before the tutor has written
    anything else. Never visible to the public/game endpoints above until
    explicitly published (see update_tutor_story's is_published)."""
    require_csrf(request)
    ensure_is_tutor(request)
    return Story.objects.create(title=title, created_by=request.auth.tutor_profile)


@router.patch('/tutor/stories/{story_id}', response=StoryDetailOut, operation_id='update_tutor_preschool_story')
def update_tutor_story(
    request: HttpRequest,
    story_id: int,
    title: str | None = Form(None),
    subtitle: str | None = Form(None),
    content: str | None = Form(None),
    is_published: bool | None = Form(None),
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
    if is_published is not None:
        story.is_published = is_published
    if cover_image is not None:
        story.cover_image.save(cover_image.name, cover_image, save=False)
    story.save()
    return story


@router.delete('/tutor/stories/{story_id}', response={204: None}, operation_id='delete_tutor_preschool_story')
def delete_tutor_story(request: HttpRequest, story_id: int):
    require_csrf(request)
    ensure_is_tutor(request)
    get_object_or_404(Story, id=story_id).delete()
    return Status(204, None)


@router.post(
    '/tutor/stories/{story_id}/assets',
    response=list[StoryAssetOut],
    operation_id='create_tutor_preschool_story_assets',
)
def create_tutor_story_assets(request: HttpRequest, story_id: int, files: list[UploadedFile] = File(...)):
    """Uploads one or more images/audio/video clips at once for the story
    editor's asset sidebar — each is dragged from there into the text as
    `{ <url> }` client-side (see frontend's story-asset-sidebar.tsx /
    story-markdown-editor.tsx), reusing the same card syntax static stories
    embed a local filename with (frontend's lib/story-parser.ts)."""
    require_csrf(request)
    ensure_is_tutor(request)

    story = get_object_or_404(Story, id=story_id)
    for uploaded in files:
        extension = PurePosixPath(uploaded.name).suffix.lstrip('.').lower()
        if extension not in STORY_ASSET_EXTENSIONS:
            raise HttpError(400, f'Unsupported file type: {uploaded.name}')

    created = []
    for uploaded in files:
        asset = StoryAsset(story=story, original_filename=uploaded.name)
        asset.file.save(uploaded.name, uploaded, save=False)
        asset.save()
        created.append(asset)
    return created


@router.delete(
    '/tutor/stories/{story_id}/assets/{asset_id}',
    response={204: None},
    operation_id='delete_tutor_preschool_story_asset',
)
def delete_tutor_story_asset(request: HttpRequest, story_id: int, asset_id: int):
    require_csrf(request)
    ensure_is_tutor(request)
    get_object_or_404(StoryAsset, id=asset_id, story_id=story_id).delete()
    return Status(204, None)
