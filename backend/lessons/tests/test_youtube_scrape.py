import pytest

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
