"""Scrapes a public YouTube playlist — or a single video — into the
TopicOut/LessonOut-shaped dict lessons.services.import_topics_and_lessons
expects: one topic, one theory lesson per video. Shared by manage.py's tmp_scrape_lessons -Y (writes it to
a JSON file for later review/import) and the tutor's "Завантажити з
YouTube" popup on the Subject detail page (tutoring.api.
import_subject_youtube_playlist, which imports it immediately)."""

import json
import re
from urllib.parse import parse_qs, urlparse

import requests

USER_AGENT = 'Mozilla/5.0 (compatible; SchoolAheadScraper/1.0)'
REQUEST_TIMEOUT = 30

# The playlist page's embedded state — holds the first ~100 videos plus a
# "continuation" item carrying a token for the next page (see
# _fetch_continuation).
YOUTUBE_INITIAL_DATA_RE = re.compile(r'var ytInitialData = (\{.*?\});</script>', re.DOTALL)
YOUTUBE_API_KEY_RE = re.compile(r'"INNERTUBE_API_KEY":"([^"]+)"')
YOUTUBE_CLIENT_VERSION_RE = re.compile(r'"INNERTUBE_CLIENT_VERSION":"([^"]+)"')
YOUTUBE_BROWSE_URL = 'https://www.youtube.com/youtubei/v1/browse'
# Public, no API key: answers a video URL with its title (and embed details).
YOUTUBE_OEMBED_URL = 'https://www.youtube.com/oembed'

# Each continuation page holds ~100 videos and YouTube caps a playlist at
# 5000, so 50 pages is the real ceiling — this only guards against looping
# forever if an unexpected response keeps handing back a token.
MAX_CONTINUATION_PAGES = 60

# Topic name used when the caller gives none and the playlist's own title
# can't be read either.
DEFAULT_TOPIC_NAME = 'Base'

# Ported from frontend/packages/markdown-editor/src/lib/youtube.ts's
# YOUTUBE_URL_PATTERN — matches a bare or Markdown-linked YouTube URL
# (watch/embed/shorts/youtu.be) and captures its 11-character video id.
YOUTUBE_URL_RE = re.compile(
    r'https?://(?:www\.)?(?:youtube(?:-nocookie)?\.com/(?:watch\?(?:[^\s)]*&)?v=|embed/|shorts/)|youtu\.be/)'
    r'([a-zA-Z0-9_-]{11})',
    re.IGNORECASE,
)


def extract_video_id(content: str) -> str | None:
    """The first YouTube video id linked from `content` (a Lesson's
    Markdown content field), or None — used by lesson_services.
    update_subject_lesson_icons to pick which thumbnail becomes a Lesson's
    icon."""
    match = YOUTUBE_URL_RE.search(content)
    return match.group(1) if match else None


class ScrapeError(Exception):
    pass


def canonical_playlist_url(url: str) -> str:
    """The plain playlist page for any link carrying a `list=` id. A
    `watch?v=…&list=…` link (what the address bar shows while a playlist
    plays) is a *video* page whose data has no playlist items, so scraping
    it fails — the list id is all that's needed. Links without one are
    returned unchanged."""
    url = url.strip()
    list_ids = parse_qs(urlparse(url).query).get('list')
    return f'https://www.youtube.com/playlist?list={list_ids[0]}' if list_ids else url


def _is_mix_list(list_id: str) -> bool:
    """YouTube's auto-generated "Mix" (radio) for a video — `list=RD…`, the
    tail of a link like `watch?v=X&list=RDX&start_radio=1` — is not a real
    playlist: its page has no playlist data to scrape. (`RDCLAK…` are the
    exception: real, public YouTube Music playlists.)"""
    return list_id.startswith('RD') and not list_id.startswith('RDCLAK')


def is_single_video_url(url: str) -> bool:
    """A link to one video rather than a playlist: it names a video (any of
    the watch/embed/shorts/youtu.be forms) and carries either no `list=` id or
    only an auto-generated Mix's (see _is_mix_list), which is just that video
    with suggestions attached. With a real `list=` id the link is treated as
    its playlist, whichever video it points at (see canonical_playlist_url)."""
    url = url.strip()
    if extract_video_id(url) is None:
        return False
    list_ids = parse_qs(urlparse(url).query).get('list', [])
    return all(_is_mix_list(list_id) for list_id in list_ids)


def _fetch_video_title(session: requests.Session, video_url: str) -> str:
    try:
        response = session.get(
            YOUTUBE_OEMBED_URL, params={'url': video_url, 'format': 'json'}, timeout=REQUEST_TIMEOUT
        )
        response.raise_for_status()
        title = response.json().get('title')
    except (requests.RequestException, ValueError, AttributeError) as exc:
        raise ScrapeError(f'Could not load that video — is it a valid, public YouTube link? ({exc})') from exc
    if not isinstance(title, str) or not title.strip():
        raise ScrapeError('Could not read that video\'s title.')
    return title.strip()


def _fetch_video_topic(video_url: str, topic_name: str) -> tuple[dict, bool]:
    """A topic holding just the one lesson for a single video — named after
    the video, its content the canonical watch link (which is also what lets
    lesson_services.set_lesson_icon_from_content fetch the thumbnail). The
    topic is `topic_name`, or DEFAULT_TOPIC_NAME when blank: a lone video has
    no playlist title to borrow."""
    video_id = extract_video_id(video_url)
    watch_url = f'https://www.youtube.com/watch?v={video_id}'
    title = _fetch_video_title(_make_session(), watch_url)
    lesson = {
        'title': title,
        'lesson_type': 'theory',
        'origin_url': watch_url,
        'youtubes': [watch_url],
        'pdfs': [],
        'content': watch_url,
        'task_content': '',
    }
    return {'title': topic_name.strip() or DEFAULT_TOPIC_NAME, 'description': '', 'lessons': [lesson]}, False


def _make_session() -> requests.Session:
    session = requests.Session()
    session.headers['User-Agent'] = USER_AGENT
    # Without this, a cookie-less request to youtube.com (e.g. from an
    # EU-geolocated IP) gets served the "before you continue to YouTube"
    # GDPR consent interstitial instead of the real page — 200 OK, but with
    # no ytInitialData, which _initial_data then can't find. Pre-seeding
    # this cookie (the same bypass yt-dlp uses) skips it.
    session.cookies.set('SOCS', 'CAI', domain='.youtube.com')
    return session


def _fetch(session: requests.Session, url: str) -> str:
    try:
        response = session.get(url, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
    except requests.RequestException as exc:
        raise ScrapeError(f'Failed to fetch {url}: {exc}') from exc
    return response.text


def _initial_data(html_text: str) -> dict:
    match = YOUTUBE_INITIAL_DATA_RE.search(html_text)
    if not match:
        raise ScrapeError('Could not find playlist data on the page — is this a YouTube playlist URL?')
    return json.loads(match.group(1))


def _initial_items(data: dict) -> list[dict]:
    try:
        return (
            data['contents']['twoColumnBrowseResultsRenderer']['tabs'][0]['tabRenderer']
            ['content']['sectionListRenderer']['contents'][0]['itemSectionRenderer']['contents']
        )
    except (KeyError, IndexError, TypeError) as exc:
        raise ScrapeError('Unrecognized playlist page structure — YouTube may have changed its markup.') from exc


def _playlist_title(data: dict) -> str | None:
    """The playlist's own name, from the page metadata (with the SEO
    microformat block as a second source) — None if neither is there."""
    candidates = (
        (data.get('metadata') or {}).get('playlistMetadataRenderer', {}).get('title'),
        (data.get('microformat') or {}).get('microformatDataRenderer', {}).get('title'),
    )
    return next((title.strip() for title in candidates if isinstance(title, str) and title.strip()), None)


def _parse_items(items: list[dict]) -> tuple[list[dict], str | None]:
    """Returns (videos, next_page_token) for one page of playlist items —
    the first page's (from the HTML) and every continuation page's share
    this shape. next_page_token is None on the last page."""
    videos = []
    token = None
    for item in items:
        lockup = item.get('lockupViewModel')
        if lockup is not None:
            video_id = lockup.get('contentId')
            title = (lockup.get('metadata') or {}).get('lockupMetadataViewModel', {}).get('title', {}).get('content')
            if video_id and title:
                videos.append({'video_id': video_id, 'title': title})
        elif 'continuationItemViewModel' in item or 'continuationItemRenderer' in item:
            token = _continuation_token(item)
    return videos, token


def _continuation_token(item: dict) -> str:
    try:
        if 'continuationItemViewModel' in item:
            command = item['continuationItemViewModel']['continuationCommand']['innertubeCommand']
        else:
            command = item['continuationItemRenderer']['continuationEndpoint']
        return command['continuationCommand']['token']
    except (KeyError, TypeError) as exc:
        raise ScrapeError('Unrecognized "next page" marker — YouTube may have changed its markup.') from exc


def _fetch_continuation(
    session: requests.Session, api_key: str, client_version: str, token: str
) -> list[dict]:
    """The next page of a playlist's items, via the same internal browse API
    the site's own "scroll for more" calls. Undocumented — YouTube can
    change it, which is why a failure here only truncates the import
    (see fetch_playlist_topic) instead of failing it."""
    payload = {
        'context': {'client': {'clientName': 'WEB', 'clientVersion': client_version, 'hl': 'uk'}},
        'continuation': token,
    }
    try:
        response = session.post(
            YOUTUBE_BROWSE_URL, params={'key': api_key, 'prettyPrint': 'false'}, json=payload, timeout=REQUEST_TIMEOUT
        )
        response.raise_for_status()
        data = response.json()
    except (requests.RequestException, ValueError) as exc:
        raise ScrapeError(f'Failed to fetch the next page of the playlist: {exc}') from exc

    try:
        return data['onResponseReceivedActions'][0]['appendContinuationItemsAction']['continuationItems']
    except (KeyError, IndexError, TypeError) as exc:
        raise ScrapeError('Unrecognized next-page response — YouTube may have changed its API.') from exc


def fetch_playlist_topic(playlist_url: str, topic_name: str = '') -> tuple[dict, bool]:
    """Returns (topic_data, truncated) — topic_data is TopicOut-shaped,
    ready for lessons.services.import_topics_and_lessons. A link to a single
    video (is_single_video_url) makes one lesson, titled after the video, in a
    topic named `topic_name` or DEFAULT_TOPIC_NAME (see _fetch_video_topic).
    For a playlist the topic is named
    `topic_name`, or — when that's blank — after the playlist itself
    (DEFAULT_TOPIC_NAME if its title can't be read), and its description is
    the playlist's URL (canonical_playlist_url) so a tutor can find the
    source again. Follows the
    playlist's continuation pages (~100 videos each) until the end.
    `truncated` is True only when that stopped early — a later page failed
    to load or MAX_CONTINUATION_PAGES was hit — so the videos returned are
    a prefix of the playlist; re-running the import picks up the rest,
    since it only adds what's new. Raises ScrapeError on any failure of the
    first page (network, unrecognized page, empty playlist) — callers decide
    how to surface that (manage.py's CommandError vs. tutoring.api's
    HttpError 400)."""
    # A single video first — before the link is rewritten to its playlist,
    # which would throw the video away.
    if is_single_video_url(playlist_url):
        return _fetch_video_topic(playlist_url, topic_name)
    playlist_url = canonical_playlist_url(playlist_url)

    session = _make_session()
    html_text = _fetch(session, playlist_url)
    data = _initial_data(html_text)
    videos, token = _parse_items(_initial_items(data))

    truncated = False
    if token:
        api_key = YOUTUBE_API_KEY_RE.search(html_text)
        client_version = YOUTUBE_CLIENT_VERSION_RE.search(html_text)
        if api_key is None or client_version is None:
            truncated = True
        else:
            pages = 0
            while token:
                if pages >= MAX_CONTINUATION_PAGES:
                    truncated = True
                    break
                try:
                    page_videos, token = _parse_items(
                        _fetch_continuation(session, api_key.group(1), client_version.group(1), token)
                    )
                except ScrapeError:
                    truncated = True
                    break
                videos.extend(page_videos)
                pages += 1

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
    title = topic_name.strip() or _playlist_title(data) or DEFAULT_TOPIC_NAME
    return {'title': title, 'description': playlist_url, 'lessons': lessons}, truncated
