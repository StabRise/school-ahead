"""Scrapes a public YouTube playlist into the TopicOut/LessonOut-shaped dict
lessons.services.import_topics_and_lessons expects — one topic, one theory
lesson per video. Shared by manage.py's tmp_scrape_lessons -Y (writes it to
a JSON file for later review/import) and the tutor's "Завантажити з
YouTube" popup on the Subject detail page (tutoring.api.
import_subject_youtube_playlist, which imports it immediately)."""

import json
import re

import requests

USER_AGENT = 'Mozilla/5.0 (compatible; SchoolAheadScraper/1.0)'
REQUEST_TIMEOUT = 30

# The playlist page's embedded state — holds the first ~100 videos;
# playlists longer than that need "continuation" tokens against an
# undocumented, frequently-changing internal API, not implemented here.
YOUTUBE_INITIAL_DATA_RE = re.compile(r'var ytInitialData = (\{.*?\});</script>', re.DOTALL)


class ScrapeError(Exception):
    pass


def _fetch(url: str) -> str:
    session = requests.Session()
    session.headers['User-Agent'] = USER_AGENT
    # Without this, a cookie-less request to youtube.com (e.g. from an
    # EU-geolocated IP) gets served the "before you continue to YouTube"
    # GDPR consent interstitial instead of the real page — 200 OK, but with
    # no ytInitialData, which _extract_playlist_videos then can't find.
    # Pre-seeding this cookie (the same bypass yt-dlp uses) skips it.
    session.cookies.set('SOCS', 'CAI', domain='.youtube.com')
    try:
        response = session.get(url, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
    except requests.RequestException as exc:
        raise ScrapeError(f'Failed to fetch {url}: {exc}') from exc
    return response.text


def _extract_playlist_videos(html_text: str) -> tuple[list[dict], bool]:
    """Returns (videos, truncated) — `truncated` is True when the page's own
    "load more" continuation marker is present, meaning the playlist has
    more videos than fit on this first page (pagination against YouTube's
    undocumented, frequently-changing internal API isn't implemented)."""
    match = YOUTUBE_INITIAL_DATA_RE.search(html_text)
    if not match:
        raise ScrapeError('Could not find playlist data on the page — is this a YouTube playlist URL?')
    data = json.loads(match.group(1))

    try:
        items = (
            data['contents']['twoColumnBrowseResultsRenderer']['tabs'][0]['tabRenderer']
            ['content']['sectionListRenderer']['contents'][0]['itemSectionRenderer']['contents']
        )
    except (KeyError, IndexError, TypeError) as exc:
        raise ScrapeError('Unrecognized playlist page structure — YouTube may have changed its markup.') from exc

    videos = []
    truncated = False
    for item in items:
        lockup = item.get('lockupViewModel')
        if lockup is None:
            if 'continuationItemViewModel' in item:
                truncated = True
            continue
        video_id = lockup.get('contentId')
        title = (lockup.get('metadata') or {}).get('lockupMetadataViewModel', {}).get('title', {}).get('content')
        if video_id and title:
            videos.append({'video_id': video_id, 'title': title})
    return videos, truncated


def fetch_playlist_topic(playlist_url: str, topic_name: str) -> tuple[dict, bool]:
    """Returns (topic_data, truncated) — topic_data is TopicOut-shaped,
    ready for lessons.services.import_topics_and_lessons. Raises
    ScrapeError on any failure (network, unrecognized page, empty playlist)
    — callers decide how to surface that (manage.py's CommandError vs.
    tutoring.api's HttpError 400)."""
    html_text = _fetch(playlist_url)
    videos, truncated = _extract_playlist_videos(html_text)
    if not videos:
        raise ScrapeError('No videos found on this page — is it a valid, public YouTube playlist URL?')

    lessons = []
    for video in videos:
        video_url = f'https://www.youtube.com/watch?v={video["video_id"]}'
        lessons.append({
            'title': video['title'],
            'lesson_type': 'theory',
            'origin_url': video_url,
            'youtubes': [video_url],
            'pdfs': [],
            'content': video_url,
            'task_content': '',
        })
    return {'title': topic_name, 'description': '', 'lessons': lessons}, truncated
