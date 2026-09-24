"""Subtitles of the YouTube videos a Lesson links to — backs the tutor Lesson
detail page's "Показати субтитри" side panel (tutoring.api.
get_tutor_lesson_video_subtitles / select_tutor_lesson_video_subtitles_language).

Only subtitle tracks YouTube itself has are used (youtube-transcript-api).
Each video is shown in its original (spoken) language by default — known
when YouTube has an auto-generated track, which is always in it — else in
its first track; the tutor can switch to any other track's language. Every
thing is cached in lessons.models.YoutubeVideo / VideoTranscript."""

import logging

import requests
from youtube_transcript_api import (
    FetchedTranscript,
    NoTranscriptFound,
    TranscriptsDisabled,
    YouTubeTranscriptApi,
    YouTubeTranscriptApiException,
)

from .models import Lesson, TranscriptSource, VideoTranscript, YoutubeVideo
from .youtube_scrape import YOUTUBE_OEMBED_URL, YOUTUBE_URL_RE

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 15

# A pause longer than this between two caption lines starts a new paragraph,
# so the panel reads as prose instead of one wall of text.
PARAGRAPH_GAP_SECONDS = 2.0


class SubtitlesStatus:
    OK = 'ok'
    # YouTube has no subtitles for the video (in any language).
    UNAVAILABLE = 'unavailable'
    # YouTube couldn't be reached / refused the request — worth retrying.
    ERROR = 'error'


def lesson_video_ids(lesson: Lesson) -> list[str]:
    """Every distinct YouTube video id linked from the lesson's content and
    task content, in the order they appear."""
    video_ids: list[str] = []
    for field in (lesson.content, lesson.task_content):
        for match in YOUTUBE_URL_RE.finditer(field or ''):
            if match.group(1) not in video_ids:
                video_ids.append(match.group(1))
    return video_ids


def _base_language(code: str) -> str:
    return code.split('-')[0].lower()


def _track_for(video: YoutubeVideo, language_code: str) -> dict | None:
    """The YouTube track for `language_code` — an exact code first, then one
    of the same base language ('es' matches 'es-419'), hand-written before
    auto-generated."""
    for generated in (False, True):
        tracks = [track for track in video.tracks if track['generated'] == generated]
        exact = next((track for track in tracks if track['code'] == language_code), None)
        same_base = next(
            (track for track in tracks if _base_language(track['code']) == _base_language(language_code)), None
        )
        if exact or same_base:
            return exact or same_base
    return None


def video_languages(video: YoutubeVideo) -> list[str]:
    """The panel's language dropdown: the original language first (when
    known), then every other language YouTube has a track for."""
    languages = [video.original_language] if video.original_language else []
    for track in sorted(video.tracks, key=lambda track: track['generated']):
        if not any(_base_language(track['code']) == _base_language(code) for code in languages):
            languages.append(track['code'])
    return languages


def _format_transcript(fetched: FetchedTranscript) -> str:
    paragraphs: list[list[str]] = [[]]
    previous_end: float | None = None
    for snippet in fetched.snippets:
        text = ' '.join(snippet.text.split())
        if not text:
            continue
        if previous_end is not None and snippet.start - previous_end > PARAGRAPH_GAP_SECONDS and paragraphs[-1]:
            paragraphs.append([])
        paragraphs[-1].append(text)
        previous_end = snippet.start + snippet.duration
    return '\n\n'.join(' '.join(lines) for lines in paragraphs if lines)


def _fetch_title(video_id: str) -> str:
    try:
        response = requests.get(
            YOUTUBE_OEMBED_URL,
            params={'url': f'https://www.youtube.com/watch?v={video_id}', 'format': 'json'},
            timeout=REQUEST_TIMEOUT,
        )
        response.raise_for_status()
        title = response.json().get('title')
    except (requests.RequestException, ValueError, AttributeError):
        return ''
    return title.strip() if isinstance(title, str) else ''


def load_video(video_id: str) -> YoutubeVideo | None:
    """The cached YoutubeVideo, fetching its title and track list on first
    use. None (nothing cached) when YouTube couldn't be reached — a later
    retry may still succeed."""
    cached = YoutubeVideo.objects.filter(video_id=video_id).first()
    if cached is not None:
        return cached

    try:
        transcript_list = list(YouTubeTranscriptApi().list(video_id))
    except TranscriptsDisabled:
        transcript_list = []
    except (YouTubeTranscriptApiException, requests.RequestException):
        logger.warning('Could not list subtitles for YouTube video %s', video_id, exc_info=True)
        return None

    tracks = [{'code': t.language_code, 'generated': t.is_generated} for t in transcript_list]
    generated = next((track for track in tracks if track['generated']), None)
    video, _ = YoutubeVideo.objects.update_or_create(
        video_id=video_id,
        defaults={
            'title': _fetch_title(video_id),
            'tracks': tracks,
            'original_language': generated['code'] if generated else '',
        },
    )
    return video


def _transcript(video: YoutubeVideo, track: dict) -> VideoTranscript | None:
    """The cached text of `track`, fetching it on first use; None when
    YouTube couldn't be reached (nothing cached)."""
    cached = video.transcripts.filter(language_code=track['code']).first()
    if cached is not None:
        return cached
    try:
        transcript_list = YouTubeTranscriptApi().list(video.video_id)
        if track['generated']:
            transcript = transcript_list.find_generated_transcript([track['code']])
        else:
            transcript = transcript_list.find_manually_created_transcript([track['code']])
        fetched = transcript.fetch()
    except (NoTranscriptFound, YouTubeTranscriptApiException, requests.RequestException):
        logger.warning('Could not fetch %s subtitles for YouTube video %s', track['code'], video.video_id, exc_info=True)
        return None
    transcript, _ = VideoTranscript.objects.update_or_create(
        video=video,
        language_code=track['code'],
        defaults={
            'source': TranscriptSource.YOUTUBE_AUTO if track['generated'] else TranscriptSource.YOUTUBE,
            'text': _format_transcript(fetched),
        },
    )
    return transcript


def video_subtitles(video_id: str, language: str = '') -> dict:
    """One entry of the panel (VideoSubtitlesOut) — in `language` when
    given (a student's own, unsaved pick), else the tutor's saved pick,
    else the default."""
    video = load_video(video_id)
    if video is None:
        return {
            'video_id': video_id, 'title': '', 'original_language': '', 'language_code': '', 'languages': [],
            'text': '', 'source': '', 'status': SubtitlesStatus.ERROR,
        }

    languages = video_languages(video)
    result = {
        'video_id': video.video_id,
        'title': video.title,
        'original_language': video.original_language,
        'language_code': '',
        'languages': languages,
        'text': '',
        'source': '',
        'status': SubtitlesStatus.UNAVAILABLE,
    }
    wanted = language or video.selected_language
    track = _track_for(video, wanted) if wanted else None
    if track is None and languages:
        track = _track_for(video, languages[0])
    if track is None:
        return result

    transcript = _transcript(video, track)
    if transcript is None:
        return {**result, 'status': SubtitlesStatus.ERROR}
    # The dropdown option this track belongs to (e.g. 'es' for an 'es-419' track).
    shown = next((code for code in languages if _base_language(code) == _base_language(track['code'])), track['code'])
    return {**result, 'language_code': shown, 'text': transcript.text, 'source': transcript.source, 'status': SubtitlesStatus.OK}


def select_language(video: YoutubeVideo, language_code: str) -> None:
    """The tutor's pick in the dropdown ('' = the default language) — also
    what students see first, until they pick another one themselves."""
    languages = video_languages(video)
    video.selected_language = '' if not language_code or language_code == languages[0] else language_code
    video.save(update_fields=['selected_language', 'updated_at'])
