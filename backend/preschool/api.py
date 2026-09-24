import zipfile
from pathlib import PurePosixPath

from django.db.models import Prefetch
from django.http import HttpRequest, HttpResponse
from django.shortcuts import get_object_or_404
from ninja import File, Form, Router
from ninja.errors import HttpError
from ninja.files import UploadedFile
from ninja.responses import Status

from common.auth import CookieOrBearerJWTAuth
from common.csrf import require_csrf
from common.permissions import ensure_is_tutor
from lessons.models import QuizLanguage

from . import services
from .models import STORY_ASSET_EXTENSIONS, STORY_ASSET_NAME_RE, BackgroundMusic, Game, GameCategory, Story, StoryAsset
from .schemas import BackgroundMusicOut, GameCategoryOut, StoryAssetOut, StoryAssetUrlOut, StoryDetailOut, StoryOut

# Router-level auth defaults to tutor-only (CookieOrBearerJWTAuth) — the two
# public read endpoints below override it to auth=None, since the "Казки"
# game is reachable without a session (see frontend's middleware.ts
# PUBLIC_PATHS — "/games" is genuinely anonymous). Every other endpoint here
# lives under a /tutor/... sub-path and is the editing surface: it sees
# every story regardless of is_published, while the public endpoints only
# ever see published ones (see models.Story's docstring).
router = Router(tags=['preschool'], auth=CookieOrBearerJWTAuth())


@router.get('/games', response=list[GameCategoryOut], auth=None, operation_id='list_preschool_games')
def list_games(request: HttpRequest):
    """The /games picker (frontend's games-page.tsx): every active category
    with its active games, both in `order`. Categories left with no active
    game are dropped so the picker never shows an empty panel. Public, like
    the game routes themselves."""
    categories = GameCategory.objects.filter(is_active=True).prefetch_related(
        Prefetch('games', queryset=Game.objects.filter(is_active=True), to_attr='active_games')
    )
    return [category for category in categories if category.active_games]


@router.get(
    '/background-music',
    response=list[BackgroundMusicOut],
    auth=None,
    operation_id='list_preschool_background_music',
)
def list_background_music(request: HttpRequest):
    """Every active background track, in `order` — the /games music
    settings' track picker and the player's random pool. Public, like the
    game routes themselves."""
    return BackgroundMusic.objects.filter(is_active=True)


@router.get('/stories', response=list[StoryOut], auth=None, operation_id='list_preschool_stories')
def list_stories(request: HttpRequest):
    """Every published DB-backed story — merged with the static
    public/static/stories/ ones by the frontend's /api/stories route. See
    docs/preschool/games/reading/Stories.md."""
    return Story.objects.filter(is_published=True)


@router.get('/stories/{story_slug}', response=StoryDetailOut, auth=None, operation_id='get_preschool_story')
def get_story(request: HttpRequest, story_slug: str):
    return get_object_or_404(Story, slug=story_slug, is_published=True)


@router.get(
    '/story-assets/{name}',
    response=StoryAssetUrlOut,
    auth=None,
    operation_id='get_preschool_story_asset_url',
)
def get_story_asset_url(request: HttpRequest, name: str):
    """The current URL of the asset a story's content references as
    `{ /api/story-asset/<name> }` (see models.STORY_ASSET_REF_PREFIX) —
    what frontend's app/api/story-asset/[name]/route.ts redirects to. Not
    gated on is_published: the editor's preview of a draft story resolves
    its assets the same way, and a stored name is 128 random bits, no
    easier to guess than the file's own URL."""
    if not STORY_ASSET_NAME_RE.match(name):
        raise HttpError(404, 'Not found')
    asset = get_object_or_404(StoryAsset, file=f'story_assets/{name}')
    return {'url': request.build_absolute_uri(asset.file.url)}


@router.get('/tutor/stories', response=list[StoryOut], operation_id='list_tutor_preschool_stories')
def list_tutor_stories(request: HttpRequest):
    """Every story, published or still a draft — the tutor stories list
    page. Unlike list_stories above, this is the editing surface, so
    is_published isn't filtered here."""
    ensure_is_tutor(request)
    return Story.objects.all()


# Registered before any "/tutor/stories/{story_id}" route below (first
# one is get_tutor_story right after this) — Ninja groups every operation
# sharing one path template together at that path's *first* registration
# position, regardless of where later operations on other paths are
# declared in this file; since {story_id} has no explicit int converter
# (Ninja's test client — and, per cards/api.py's own comment, potentially
# real routing too — matches it against any path segment, "import"
# included), a same-shaped "/tutor/stories/import" registered anywhere
# after {story_id}'s first use would 405 by false-matching that route
# (wrong method) before ever trying this one.
@router.post('/tutor/stories/import', response=StoryDetailOut, operation_id='import_tutor_preschool_story')
def import_tutor_story(
    request: HttpRequest, file: UploadedFile = File(...), language: QuizLanguage = Form(QuizLanguage.UK)
):
    """Imports a story.md + cover + asset-files ZIP (see
    services.build_story_zip) as a new, unpublished story — the tutor
    stories list's "Import" action. Also accepts an existing hand-authored
    public/static/stories/<title>/ folder, zipped up. `language` is the
    import dialog's pick (Ukrainian by default)."""
    require_csrf(request)
    ensure_is_tutor(request)
    if not zipfile.is_zipfile(file):
        raise HttpError(400, 'Not a valid ZIP file')
    file.seek(0)  # is_zipfile above consumed the stream
    try:
        return services.import_story_zip(file, request.auth.tutor_profile, request, language)
    except (zipfile.BadZipFile, ValueError) as exc:
        raise HttpError(400, str(exc)) from exc


@router.get('/tutor/stories/{story_id}', response=StoryDetailOut, operation_id='get_tutor_preschool_story')
def get_tutor_story(request: HttpRequest, story_id: int):
    ensure_is_tutor(request)
    return get_object_or_404(Story, id=story_id)


@router.post('/tutor/stories', response=StoryDetailOut, operation_id='create_tutor_preschool_story')
def create_tutor_story(
    request: HttpRequest,
    title: str = Form(...),
    subtitle: str = Form(''),
    content: str = Form(''),
    language: QuizLanguage = Form(QuizLanguage.UK),
    cover_image: UploadedFile | None = File(None),
):
    """Creates a new, unpublished story — the tutor stories list's "Add
    story" action navigates straight to the editor (see frontend's
    app/[locale]/(tutor)/tutor/stories/new/page.tsx) with no story row yet;
    this is what the editor's first autosave tick calls instead of
    update_tutor_story below, once the tutor has typed anything. Accepts
    the same optional fields as update_tutor_story (not just title) so that
    first save can't lose whatever subtitle/content was typed in the few
    seconds before it fires. Never visible to the public/game endpoints
    above until explicitly published (see update_tutor_story's
    is_published)."""
    require_csrf(request)
    ensure_is_tutor(request)
    story = Story(
        title=title,
        subtitle=subtitle,
        content=services.normalize_asset_refs(content),
        language=language,
        created_by=request.auth.tutor_profile,
    )
    if cover_image is not None:
        story.cover_image.save(cover_image.name, cover_image, save=False)
    story.save()
    return story


@router.patch('/tutor/stories/{story_id}', response=StoryDetailOut, operation_id='update_tutor_preschool_story')
def update_tutor_story(
    request: HttpRequest,
    story_id: int,
    title: str | None = Form(None),
    subtitle: str | None = Form(None),
    content: str | None = Form(None),
    language: QuizLanguage | None = Form(None),
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
        story.content = services.normalize_asset_refs(content)
    if language is not None:
        story.language = language
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


@router.get('/tutor/stories/{story_id}/export', operation_id='export_tutor_preschool_story')
def export_tutor_story(request: HttpRequest, story_id: int):
    """Downloads this story as a ZIP shaped like a hand-authored static
    story folder (story.md + cover.<ext> + every referenced asset) — the
    tutor stories list's "Download" action. See services.build_story_zip;
    the inverse of import_tutor_story below."""
    ensure_is_tutor(request)
    story = get_object_or_404(Story, id=story_id)
    response = HttpResponse(services.build_story_zip(story, request), content_type='application/zip')
    response['Content-Disposition'] = f'attachment; filename="story-{story.id}.zip"'
    return response


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
