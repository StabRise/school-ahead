import json

import pytest
import requests

from lessons import youtube_scrape
from lessons.youtube_scrape import extract_video_id


@pytest.mark.parametrize(
    "content",
    [
        "https://www.youtube.com/watch?v=abcdefghijk",
        "https://youtu.be/abcdefghijk",
        "https://www.youtube.com/embed/abcdefghijk",
        "https://www.youtube.com/shorts/abcdefghijk",
        "Check this out: [lesson video](https://www.youtube.com/watch?v=abcdefghijk)",
        "https://www.youtube.com/watch?v=abcdefghijk&list=PL123",
    ],
)
def test_extracts_video_id_from_various_url_forms(content):
    assert extract_video_id(content) == "abcdefghijk"


def test_returns_first_video_id_when_multiple_links_present():
    content = (
        "https://www.youtube.com/watch?v=firstvideo1\n"
        "https://www.youtube.com/watch?v=secondvid12"
    )
    assert extract_video_id(content) == "firstvideo1"


def test_returns_none_when_no_youtube_link():
    assert extract_video_id("Just plain lesson text, no link here.") is None


# --- fetch_playlist_topic pagination ------------------------------------
# A fake requests.Session stands in for YouTube: `get` serves the playlist
# page (first ~100 videos + a continuation marker) and `post` serves each
# following page from the internal browse API, keyed by continuation token.


def _lockup(video_id):
    return {'lockupViewModel': {
        'contentId': video_id,
        'metadata': {'lockupMetadataViewModel': {'title': {'content': f'Video {video_id}'}}},
    }}


def _continuation(token):
    return {'continuationItemViewModel': {'continuationCommand': {'innertubeCommand': {
        'continuationCommand': {'token': token},
    }}}}


def _playlist_html(items, *, with_api_config=True, title=None):
    data = {'contents': {'twoColumnBrowseResultsRenderer': {'tabs': [{'tabRenderer': {'content': {
        'sectionListRenderer': {'contents': [{'itemSectionRenderer': {'contents': items}}]},
    }}}]}}}
    if title is not None:
        data['metadata'] = {'playlistMetadataRenderer': {'title': title}}
    config = '"INNERTUBE_API_KEY":"test-key","INNERTUBE_CLIENT_VERSION":"2.1"' if with_api_config else ''
    return f'<script>{config}</script><script>var ytInitialData = {json.dumps(data)};</script>'


class _FakeResponse:
    def __init__(self, *, text='', payload=None, error=None):
        self.text = text
        self._payload = payload
        self._error = error

    def raise_for_status(self):
        if self._error:
            raise self._error

    def json(self):
        return self._payload


class _FakeSession:
    def __init__(self, html, pages):
        self.headers = {}
        self.cookies = requests.cookies.RequestsCookieJar()
        self._html = html
        self._pages = pages  # token -> list of items, or an Exception to raise
        self.posted_tokens = []
        self.fetched_urls = []

    def get(self, url, timeout):
        self.fetched_urls.append(url)
        return _FakeResponse(text=self._html)

    def post(self, url, params, json, timeout):
        self.posted_tokens.append(json['continuation'])
        assert params['key'] == 'test-key'
        assert json['context']['client']['clientVersion'] == '2.1'
        page = self._pages[json['continuation']]
        if isinstance(page, Exception):
            raise page
        return _FakeResponse(payload={'onResponseReceivedActions': [
            {'appendContinuationItemsAction': {'continuationItems': page}},
        ]})


def _fetch(monkeypatch, session, topic_name='Base'):
    monkeypatch.setattr(youtube_scrape, '_make_session', lambda: session)
    return youtube_scrape.fetch_playlist_topic('https://www.youtube.com/playlist?list=PL1', topic_name)


def test_follows_continuation_pages_until_the_last_one(monkeypatch):
    session = _FakeSession(
        _playlist_html([_lockup('aaaaaaaaaaa'), _lockup('bbbbbbbbbbb'), _continuation('tok-2')]),
        {
            'tok-2': [_lockup('ccccccccccc'), _lockup('ddddddddddd'), _continuation('tok-3')],
            'tok-3': [_lockup('eeeeeeeeeee')],
        },
    )

    topic, truncated = _fetch(monkeypatch, session)

    assert [lesson['title'] for lesson in topic['lessons']] == [
        f'Video {c * 11}' for c in 'abcde'
    ]
    assert truncated is False
    assert session.posted_tokens == ['tok-2', 'tok-3']


def test_single_page_playlist_makes_no_continuation_requests(monkeypatch):
    session = _FakeSession(_playlist_html([_lockup('aaaaaaaaaaa')]), {})

    topic, truncated = _fetch(monkeypatch, session)

    assert len(topic['lessons']) == 1
    assert truncated is False
    assert session.posted_tokens == []


def test_failed_later_page_returns_what_was_loaded_as_truncated(monkeypatch):
    session = _FakeSession(
        _playlist_html([_lockup('aaaaaaaaaaa'), _continuation('tok-2')]),
        {'tok-2': requests.ConnectionError('boom')},
    )

    topic, truncated = _fetch(monkeypatch, session)

    assert [lesson['title'] for lesson in topic['lessons']] == ['Video aaaaaaaaaaa']
    assert truncated is True


def test_missing_api_config_cannot_paginate_and_is_truncated(monkeypatch):
    session = _FakeSession(
        _playlist_html([_lockup('aaaaaaaaaaa'), _continuation('tok-2')], with_api_config=False), {}
    )

    topic, truncated = _fetch(monkeypatch, session)

    assert len(topic['lessons']) == 1
    assert truncated is True
    assert session.posted_tokens == []


def test_stops_at_the_page_cap_instead_of_looping_forever(monkeypatch):
    monkeypatch.setattr(youtube_scrape, 'MAX_CONTINUATION_PAGES', 2)
    session = _FakeSession(
        _playlist_html([_lockup('aaaaaaaaaaa'), _continuation('t1')]),
        {
            't1': [_lockup('bbbbbbbbbbb'), _continuation('t2')],
            't2': [_lockup('ccccccccccc'), _continuation('t3')],
            't3': [_lockup('ddddddddddd')],
        },
    )

    topic, truncated = _fetch(monkeypatch, session)

    assert len(topic['lessons']) == 3
    assert truncated is True
    assert session.posted_tokens == ['t1', 't2']


# --- topic naming --------------------------------------------------------


def test_blank_topic_name_uses_the_playlist_title(monkeypatch):
    session = _FakeSession(_playlist_html([_lockup('aaaaaaaaaaa')], title='Уроки малювання'), {})

    topic, _ = _fetch(monkeypatch, session, topic_name='')

    assert topic['title'] == 'Уроки малювання'


def test_whitespace_only_topic_name_counts_as_blank(monkeypatch):
    session = _FakeSession(_playlist_html([_lockup('aaaaaaaaaaa')], title='Уроки малювання'), {})

    topic, _ = _fetch(monkeypatch, session, topic_name='   ')

    assert topic['title'] == 'Уроки малювання'


def test_explicit_topic_name_wins_over_the_playlist_title(monkeypatch):
    session = _FakeSession(_playlist_html([_lockup('aaaaaaaaaaa')], title='Уроки малювання'), {})

    topic, _ = _fetch(monkeypatch, session, topic_name='Малювання')

    assert topic['title'] == 'Малювання'


def test_blank_topic_name_falls_back_to_base_when_the_title_is_unreadable(monkeypatch):
    session = _FakeSession(_playlist_html([_lockup('aaaaaaaaaaa')]), {})

    topic, _ = _fetch(monkeypatch, session, topic_name='')

    assert topic['title'] == 'Base'


# --- playlist URL: normalizing and the topic description -----------------


@pytest.mark.parametrize(
    "url, expected",
    [
        ("https://www.youtube.com/playlist?list=PL123", "https://www.youtube.com/playlist?list=PL123"),
        # The address bar's form while a playlist plays: a video page, not the list.
        ("https://www.youtube.com/watch?v=ubKmC4MALAM&list=PL123", "https://www.youtube.com/playlist?list=PL123"),
        ("https://www.youtube.com/watch?list=PL123&v=abc&index=4", "https://www.youtube.com/playlist?list=PL123"),
        ("https://youtu.be/ubKmC4MALAM?list=PL123", "https://www.youtube.com/playlist?list=PL123"),
        ("  https://www.youtube.com/playlist?list=PL123  ", "https://www.youtube.com/playlist?list=PL123"),
        # No list id — nothing to normalize to.
        ("https://www.youtube.com/watch?v=ubKmC4MALAM", "https://www.youtube.com/watch?v=ubKmC4MALAM"),
    ],
)
def test_canonical_playlist_url(url, expected):
    assert youtube_scrape.canonical_playlist_url(url) == expected


def test_topic_description_is_the_playlist_url(monkeypatch):
    session = _FakeSession(_playlist_html([_lockup('aaaaaaaaaaa')]), {})

    topic, _ = _fetch(monkeypatch, session)

    assert topic['description'] == 'https://www.youtube.com/playlist?list=PL1'


def test_a_watch_link_is_fetched_and_described_as_the_plain_playlist_url(monkeypatch):
    session = _FakeSession(_playlist_html([_lockup('aaaaaaaaaaa')]), {})
    monkeypatch.setattr(youtube_scrape, '_make_session', lambda: session)

    topic, _ = youtube_scrape.fetch_playlist_topic(
        'https://www.youtube.com/watch?v=ubKmC4MALAM&list=PLSNY-dL1', 'Base'
    )

    assert session.fetched_urls == ['https://www.youtube.com/playlist?list=PLSNY-dL1']
    assert topic['description'] == 'https://www.youtube.com/playlist?list=PLSNY-dL1'
