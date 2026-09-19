"""Icon thumbnails (common/images.py) — the API sends a scaled-down copy of a
subject group's, subject's or lesson's icon wherever it used to send the icon
itself, and falls back to the original when a thumbnail can't be made."""

import io
from pathlib import Path

import pytest
from django.core.files.base import ContentFile
from PIL import Image

from academics.models import Class, School, Subject, SubjectGroup, Topic
from accounts.models import Role, User
from common.images import LESSON_ICON_SIDE, SUBJECT_GROUP_ICON_SIDE, SUBJECT_ICON_SIDE, icon_url
from lessons.models import Lesson, LessonType

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def media_root(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    return tmp_path


def _image_bytes(size, image_format='PNG', mode='RGBA'):
    out = io.BytesIO()
    Image.new(mode, size, (200, 30, 30, 128) if mode == 'RGBA' else (200, 30, 30)).save(out, image_format)
    return out.getvalue()


def _served_file(url: str, media_root: Path) -> Path:
    """The file on disk behind an API URL like http://host/media/<path>."""
    return media_root / url.split('/media/', 1)[1]


@pytest.fixture
def school_class():
    school = School.objects.create(name='Ahead School')
    return Class.objects.create(school=school, name='1', order_index=1, academic_year='2025/2026', is_public=True)


@pytest.fixture
def subject(school_class):
    return Subject.objects.create(school_class=school_class, name='Math')


@pytest.fixture
def lesson(subject):
    topic = Topic.objects.create(subject=subject, title='Numbers', order_index=1)
    return Lesson.objects.create(
        topic=topic, order_index=1, title='Counting', lesson_type=LessonType.THEORY, grading_type='binary'
    )


@pytest.fixture
def student_headers(auth_header):
    return auth_header(User.objects.create_user(email='student@example.com', role=Role.STUDENT))


def test_a_large_subject_icon_is_served_as_a_smaller_thumbnail(api_client, subject, student_headers, media_root):
    subject.icon.save('cover.png', ContentFile(_image_bytes((1200, 800))))

    response = api_client.get(f'/academics/subjects/{subject.id}', headers=student_headers)

    assert response.status_code == 200
    url = response.data['icon']
    assert url != subject.icon.url and subject.icon.name not in url
    thumbnail = Image.open(_served_file(url, media_root))
    # Proportions kept, longest side cut to the limit, transparency and format kept.
    assert thumbnail.size == (SUBJECT_ICON_SIDE, round(800 * SUBJECT_ICON_SIDE / 1200))
    assert thumbnail.format == 'PNG'
    assert thumbnail.mode == 'RGBA'
    # The original is left alone.
    assert Image.open(media_root / subject.icon.name).size == (1200, 800)


def test_a_small_icon_is_not_scaled_up(api_client, subject, student_headers, media_root):
    subject.icon.save('tiny.png', ContentFile(_image_bytes((100, 60))))

    response = api_client.get(f'/academics/subjects/{subject.id}', headers=student_headers)

    assert Image.open(_served_file(response.data['icon'], media_root)).size == (100, 60)


def test_a_jpeg_icon_stays_a_jpeg(api_client, subject, student_headers, media_root):
    subject.icon.save('photo.jpg', ContentFile(_image_bytes((1000, 1000), 'JPEG', 'RGB')))

    response = api_client.get(f'/academics/subjects/{subject.id}', headers=student_headers)

    thumbnail = Image.open(_served_file(response.data['icon'], media_root))
    assert thumbnail.format == 'JPEG'
    assert thumbnail.size == (SUBJECT_ICON_SIDE, SUBJECT_ICON_SIDE)


def test_a_subject_group_icon_is_a_small_thumbnail(api_client, student_headers, media_root):
    SubjectGroup.objects.all().delete()
    group = SubjectGroup.objects.create(name='Українська школа', order_index=1)
    group.icon.save('flag.png', ContentFile(_image_bytes((800, 800))))

    response = api_client.get('/academics/subject-groups', headers=student_headers)

    (row,) = response.data
    assert Image.open(_served_file(row['icon'], media_root)).size == (SUBJECT_GROUP_ICON_SIDE,) * 2


def test_a_lesson_icon_is_a_thumbnail_in_the_lesson_list(api_client, subject, lesson, media_root):
    lesson.icon.save('thumb.jpg', ContentFile(_image_bytes((1280, 720), 'JPEG', 'RGB')))

    response = api_client.get(f'/public/subjects/{subject.id}/lessons')

    (row,) = response.json()
    thumbnail = Image.open(_served_file(row['icon'], media_root))
    assert thumbnail.size == (LESSON_ICON_SIDE, round(720 * LESSON_ICON_SIDE / 1280))


def test_an_unreadable_icon_falls_back_to_the_original(api_client, subject, student_headers):
    subject.icon.save('broken.png', ContentFile(b'not really an image'))

    response = api_client.get(f'/academics/subjects/{subject.id}', headers=student_headers)

    assert response.status_code == 200
    assert response.data['icon'].endswith(subject.icon.name)


def test_an_icon_missing_from_storage_falls_back_to_the_original(api_client, subject, student_headers, media_root):
    subject.icon.save('gone.png', ContentFile(_image_bytes((800, 800))))
    (media_root / subject.icon.name).unlink()

    response = api_client.get(f'/academics/subjects/{subject.id}', headers=student_headers)

    assert response.status_code == 200
    assert response.data['icon'].endswith(subject.icon.name)


def test_no_icon_is_none(api_client, subject, student_headers):
    response = api_client.get(f'/academics/subjects/{subject.id}', headers=student_headers)

    assert response.data['icon'] is None
    assert icon_url(subject, None) is None


def test_without_a_request_the_url_stays_host_relative(subject, media_root):
    subject.icon.save('cover.png', ContentFile(_image_bytes((1200, 800))))

    url = icon_url(subject, None)

    assert url.startswith('/media/CACHE/images/')
