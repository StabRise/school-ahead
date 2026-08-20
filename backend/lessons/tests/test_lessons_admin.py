import pytest
from django.contrib.admin.sites import AdminSite
from django.test import RequestFactory

from academics.models import Class, School, Subject, Topic
from lessons.admin import LessonAdmin
from lessons.models import Lesson, LessonType

pytestmark = pytest.mark.django_db


@pytest.fixture
def topic():
    school = School.objects.create(name='Ahead School')
    school_class = Class.objects.create(school=school, name='5', order_index=5, academic_year='2025/2026')
    subject = Subject.objects.create(school_class=school_class, name='Math')
    return Topic.objects.create(subject=subject, title='Fractions', order_index=1)


@pytest.fixture
def lesson_admin():
    return LessonAdmin(Lesson, AdminSite())


@pytest.fixture
def request_factory():
    return RequestFactory()


def test_save_model_assigns_random_icon_for_new_lesson_without_one(
    lesson_admin, request_factory, topic, settings, tmp_path
):
    settings.MEDIA_ROOT = tmp_path
    lesson = Lesson(
        topic=topic, order_index=1, title='New lesson',
        lesson_type=LessonType.THEORY, grading_type='binary',
    )

    lesson_admin.save_model(request_factory.get('/'), lesson, form=None, change=False)

    assert lesson.pk is not None
    assert lesson.icon.name


def test_save_model_does_not_override_an_already_set_icon(
    lesson_admin, request_factory, topic, settings, tmp_path
):
    from django.core.files.base import ContentFile

    settings.MEDIA_ROOT = tmp_path
    lesson = Lesson(
        topic=topic, order_index=1, title='New lesson',
        lesson_type=LessonType.THEORY, grading_type='binary',
    )
    lesson.icon.save('custom.png', ContentFile(b'custom-bytes'), save=False)
    original_icon_name = lesson.icon.name

    lesson_admin.save_model(request_factory.get('/'), lesson, form=None, change=False)

    assert lesson.icon.name == original_icon_name


def test_save_model_does_not_assign_icon_when_editing_existing_lesson(
    lesson_admin, request_factory, topic, settings, tmp_path
):
    settings.MEDIA_ROOT = tmp_path
    lesson = Lesson.objects.create(
        topic=topic, order_index=1, title='Existing lesson',
        lesson_type=LessonType.THEORY, grading_type='binary',
    )
    assert not lesson.icon

    lesson_admin.save_model(request_factory.get('/'), lesson, form=None, change=True)

    lesson.refresh_from_db()
    assert not lesson.icon
