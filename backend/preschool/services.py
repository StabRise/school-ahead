import io
import re
import zipfile
from pathlib import PurePosixPath

from django.core.files.base import ContentFile
from django.http import HttpRequest
from ninja.files import UploadedFile

from .models import STORY_ASSET_EXTENSIONS, Story, StoryAsset

# Matches the same "{ <url-or-filename> }" card-group syntax the frontend's
# lib/story-parser.ts / lib/story-rich-text.ts use — an asset filename in an
# imported story.md gets rewritten to an absolute URL (import_story_zip),
# and an absolute URL in an exported one gets rewritten back to a plain
# filename (build_story_zip), so a story round-trips between the DB and a
# hand-authored static story.md folder (frontend's public/static/stories/
# <title>/, see docs/preschool/games/reading/Stories.md).
CARD_GROUP_RE = re.compile(r'\{([^{}]*)\}')

STORY_FILE = 'story.md'
COVER_STEM = 'cover'
COVER_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp', '.gif'}


def build_story_zip(story: Story, request: HttpRequest) -> bytes:
    """A ZIP shaped exactly like a hand-authored static story folder
    (STORY_FILE + cover.<ext> + every referenced asset, all as plain
    sibling files with their original names) — the "Download" action on the
    tutor stories list. Round-trips with import_story_zip below."""
    used_filenames: set[str] = set()

    def unique_filename(name: str) -> str:
        stem, suffix = PurePosixPath(name).stem, PurePosixPath(name).suffix
        candidate, counter = name, 2
        while candidate in used_filenames:
            candidate = f'{stem}-{counter}{suffix}'
            counter += 1
        used_filenames.add(candidate)
        return candidate

    assets = list(story.assets.all())
    asset_filenames = {
        asset.id: unique_filename(asset.original_filename or PurePosixPath(asset.file.name).name) for asset in assets
    }

    body = story.content
    for asset in assets:
        absolute_url = request.build_absolute_uri(asset.file.url)
        body = body.replace(absolute_url, asset_filenames[asset.id])

    headings = [f'# {story.title}']
    if story.subtitle:
        headings.append(f'### {story.subtitle}')
    markdown = '\n\n'.join(headings) + '\n\n' + body

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(STORY_FILE, markdown)
        if story.cover_image:
            cover_name = unique_filename(f'{COVER_STEM}{PurePosixPath(story.cover_image.name).suffix}')
            with story.cover_image.open('rb') as opened:
                archive.writestr(cover_name, opened.read())
        for asset in assets:
            with asset.file.open('rb') as opened:
                archive.writestr(asset_filenames[asset.id], opened.read())
    return buffer.getvalue()


def _parse_story_markdown(markdown: str) -> tuple[str, str, str]:
    """Python port of the frontend's lib/story-parser.ts::parseStory —
    leading "#" heading line(s) are the title (whichever has the fewest
    #'s) and an optional subtitle (any other leading heading), the rest is
    the body. Kept in sync with that parser so an imported story.md is
    read exactly the same way the frontend already reads a static one."""
    lines = markdown.replace('\r\n', '\n').split('\n')
    headings: list[tuple[int, str]] = []
    body_start = 0
    for index, raw_line in enumerate(lines):
        line = raw_line.strip()
        if line == '':
            body_start = index + 1
            continue
        match = re.match(r'^(#+)\s*(.*)$', line)
        if not match:
            break
        headings.append((len(match.group(1)), match.group(2).strip()))
        body_start = index + 1

    title = ''
    subtitle = ''
    if headings:
        title_heading = min(headings, key=lambda heading: heading[0])
        title = title_heading[1]
        rest = [text for level, text in headings if (level, text) != title_heading]
        subtitle = ' · '.join(rest)

    body = '\n'.join(lines[body_start:]).strip()
    return title, subtitle, body


def import_story_zip(uploaded: UploadedFile, tutor_profile, request: HttpRequest) -> Story:
    """Imports a story.md + cover + asset-files ZIP (see build_story_zip)
    as a new, unpublished Story — the inverse of exporting one, and also a
    way to bring an existing hand-authored public/static/stories/<title>/
    folder (zipped up) into the DB. Accepts either a flat ZIP (story.md at
    the root) or one with everything nested one level inside a single
    top-level folder (what macOS/Windows produce zipping a folder)."""
    with zipfile.ZipFile(io.BytesIO(uploaded.read())) as archive:
        names = [
            info.filename
            for info in archive.infolist()
            if not info.is_dir() and '__MACOSX' not in info.filename and not PurePosixPath(info.filename).name.startswith('.')
        ]
        story_md_name = next((name for name in names if PurePosixPath(name).name.lower() == STORY_FILE), None)
        if story_md_name is None:
            raise ValueError(f'{STORY_FILE} not found in the archive')
        base_dir = PurePosixPath(story_md_name).parent

        siblings = {
            PurePosixPath(name).name.lower(): name
            for name in names
            if PurePosixPath(name).parent == base_dir and name != story_md_name
        }

        markdown = archive.read(story_md_name).decode('utf-8')
        title, subtitle, body = _parse_story_markdown(markdown)
        if not title:
            title = PurePosixPath(story_md_name).parent.name or PurePosixPath(story_md_name).stem

        story = Story.objects.create(title=title, subtitle=subtitle, content=body, created_by=tutor_profile)

        cover_entry = next(
            (
                siblings[name]
                for name in siblings
                if PurePosixPath(name).stem == COVER_STEM and PurePosixPath(name).suffix.lower() in COVER_EXTENSIONS
            ),
            None,
        )
        if cover_entry:
            story.cover_image.save(PurePosixPath(cover_entry).name, ContentFile(archive.read(cover_entry)), save=True)

        # Every sibling media file becomes a real StoryAsset — not just ones
        # the body's "{...}" card groups reference — mirroring
        # build_story_zip's own "every asset, referenced or not"
        # completeness, so nothing in the archive is silently dropped on
        # import. Separately, any "{...}" group naming one of them
        # (case-insensitively, matching how the frontend resolves a static
        # story's local asset filenames) gets the body rewritten to
        # reference its new absolute URL instead, same shape as any other
        # DB story's content.
        created_assets: dict[str, StoryAsset] = {}
        for entry in siblings.values():
            if entry == cover_entry:
                continue
            extension = PurePosixPath(entry).suffix.lstrip('.').lower()
            if extension not in STORY_ASSET_EXTENSIONS:
                continue
            asset = StoryAsset(story=story, original_filename=PurePosixPath(entry).name)
            asset.file.save(PurePosixPath(entry).name, ContentFile(archive.read(entry)), save=True)
            created_assets[PurePosixPath(entry).name.lower()] = asset

        for match in CARD_GROUP_RE.finditer(body):
            reference = PurePosixPath(match.group(1).strip()).name.lower()
            asset = created_assets.get(reference)
            if not asset:
                continue
            absolute_url = request.build_absolute_uri(asset.file.url)
            story.content = story.content.replace(match.group(0), f'{{ {absolute_url} }}')

        story.save(update_fields=['content'])
    return story
