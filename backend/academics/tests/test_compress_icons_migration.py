import importlib
import io
import os

import pytest
from django.apps import apps
from django.core.files.base import ContentFile
from PIL import Image

from academics.models import Class, School, Subject, SubjectGroup

pytestmark = pytest.mark.django_db

migration = importlib.import_module('academics.migrations.0020_compress_subject_icons')


def _noisy_image(width, height, image_format):
    """Random pixels — incompressible, so the original is genuinely big."""
    image = Image.frombytes('RGB', (width, height), os.urandom(width * height * 3))
    out = io.BytesIO()
    image.save(out, image_format)
    return out.getvalue()


def _dimensions(field_file):
    with field_file.storage.open(field_file.name, 'rb') as stored:
        return Image.open(stored).size


@pytest.fixture
def subject(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    school = School.objects.create(name='Ahead School')
    school_class = Class.objects.create(school=school, name='5', order_index=5, academic_year='2025/2026')
    return Subject.objects.create(school_class=school_class, name='Math')


def _run():
    migration.compress_icons(apps, None)


def test_large_subject_icon_is_scaled_down_and_replaces_the_original(subject):
    original = _noisy_image(1600, 1200, 'PNG')
    subject.icon.save('big.png', ContentFile(original), save=True)
    old_name = subject.icon.name
    old_path = subject.icon.path

    _run()

    subject.refresh_from_db()
    assert subject.icon.name != old_name
    assert subject.icon.name.startswith('subject_icons/') and subject.icon.name.endswith('.png')
    assert max(_dimensions(subject.icon)) == migration.MAX_SIDE
    # Proportions kept: 1600x1200 -> 512x384.
    assert _dimensions(subject.icon) == (512, 384)
    assert subject.icon.size < len(original)
    assert not os.path.exists(old_path)


def test_large_subject_group_jpeg_is_compressed_in_its_own_format(subject):
    original = _noisy_image(2000, 2000, 'JPEG')
    group = SubjectGroup.objects.create(name='Big', order_index=50)
    group.icon.save('big.jpg', ContentFile(original), save=True)

    _run()

    group.refresh_from_db()
    assert group.icon.name.startswith('subject_group_icons/') and group.icon.name.endswith('.jpg')
    with group.icon.storage.open(group.icon.name, 'rb') as stored:
        assert Image.open(stored).format == 'JPEG'
    assert _dimensions(group.icon) == (512, 512)
    assert group.icon.size < len(original)


def test_running_it_again_changes_nothing(subject):
    subject.icon.save('big.png', ContentFile(_noisy_image(1600, 1200, 'PNG')), save=True)
    _run()
    subject.refresh_from_db()
    name_after_first_run = subject.icon.name

    _run()

    subject.refresh_from_db()
    assert subject.icon.name == name_after_first_run


def test_rows_without_an_icon_are_ignored(subject):
    _run()

    subject.refresh_from_db()
    assert not subject.icon


def test_unreadable_files_are_left_alone(subject):
    subject.icon.save('notes.png', ContentFile(b'this is not an image'), save=True)
    name = subject.icon.name

    _run()

    subject.refresh_from_db()
    assert subject.icon.name == name
    assert subject.icon.read() == b'this is not an image'


def test_missing_files_do_not_break_the_migration(subject):
    subject.icon.save('gone.png', ContentFile(_noisy_image(800, 800, 'PNG')), save=True)
    os.remove(subject.icon.path)
    name = subject.icon.name

    _run()

    subject.refresh_from_db()
    assert subject.icon.name == name


def test_small_icon_that_cannot_get_smaller_is_kept(subject):
    tiny = _noisy_image(16, 16, 'PNG')
    subject.icon.save('tiny.png', ContentFile(tiny), save=True)
    name = subject.icon.name

    _run()

    subject.refresh_from_db()
    assert subject.icon.name == name
    assert subject.icon.read() == tiny
