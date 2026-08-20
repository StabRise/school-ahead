import datetime

import pytest

from academics.models import Class, School, Subject, SubjectBlock, Topic
from accounts.models import Role, User

pytestmark = pytest.mark.django_db


@pytest.fixture
def school():
    return School.objects.create(name='Ahead School')


@pytest.fixture
def school_class(school):
    return Class.objects.create(school=school, name='5', order_index=5, academic_year='2025/2026')


@pytest.fixture
def subject(school_class):
    return Subject.objects.create(school_class=school_class, name='Math')


@pytest.fixture
def admin_user():
    return User.objects.create_user(email='admin@example.com', role=Role.ADMIN, is_staff=True)


@pytest.fixture
def student_user():
    return User.objects.create_user(email='student@example.com', role=Role.STUDENT)


def test_subject_defaults_dates_and_creates_blocks(subject):
    assert subject.start_date == datetime.date(2025, 9, 1)
    assert subject.due_date == datetime.date(2026, 6, 1)
    assert subject.block_count == 2


def test_subject_rejects_start_after_due(school_class):
    with pytest.raises(Exception):
        Subject.objects.create(
            school_class=school_class,
            name='Bad Subject',
            start_date=datetime.date(2025, 10, 1),
            due_date=datetime.date(2025, 9, 1),
        )


def test_list_classes_and_subjects(api_client, auth_header, student_user, school_class, subject):
    headers = auth_header(student_user)

    classes_response = api_client.get('/academics/classes', headers=headers)
    assert classes_response.status_code == 200
    # Not asserting an exact count/list: the DB also carries the seeded
    # classes from academics/migrations/0002_seed_initial_data.py.
    assert school_class.id in {c['id'] for c in classes_response.data}

    subjects_response = api_client.get(
        f'/academics/classes/{school_class.id}/subjects', headers=headers
    )
    assert subjects_response.status_code == 200
    assert subjects_response.data[0]['name'] == 'Math'


def test_patch_subject_requires_staff(api_client, auth_header, student_user, subject):
    response = api_client.patch(
        f'/academics/subjects/{subject.id}',
        json={'block_count': 4},
        headers=auth_header(student_user),
    )
    assert response.status_code == 403


def test_patch_subject_as_admin(api_client, auth_header, admin_user, subject):
    # Bearer-authenticated requests are CSRF-exempt (see common/csrf.py) —
    # no X-CSRF-Token header needed here.
    response = api_client.patch(
        f'/academics/subjects/{subject.id}',
        json={'block_count': 4},
        headers=auth_header(admin_user),
    )
    assert response.status_code == 200
    assert response.data['block_count'] == 4
    subject.refresh_from_db()
    assert subject.blocks.count() == 4


def test_reorder_topics_as_admin(api_client, auth_header, admin_user, subject):
    t1 = Topic.objects.create(subject=subject, title='Intro', order_index=1)
    t2 = Topic.objects.create(subject=subject, title='Advanced', order_index=2)

    response = api_client.patch(
        f'/academics/subjects/{subject.id}/topics/reorder',
        json={'items': [{'id': t1.id, 'order_index': 2}, {'id': t2.id, 'order_index': 1}]},
        headers=auth_header(admin_user),
    )
    assert response.status_code == 200

    t1.refresh_from_db()
    t2.refresh_from_db()
    assert t1.order_index == 2
    assert t2.order_index == 1


def test_ensure_subject_blocks_matches_block_count(subject):
    from academics import services

    subject.block_count = 4
    subject.save()
    services.ensure_subject_blocks(subject)
    assert list(subject.blocks.order_by('index').values_list('index', flat=True)) == [1, 2, 3, 4]

    subject.block_count = 2
    subject.save()
    services.ensure_subject_blocks(subject)
    assert list(subject.blocks.order_by('index').values_list('index', flat=True)) == [1, 2]


def test_subject_block_default_label(subject):
    block = SubjectBlock.objects.create(subject=subject, index=1)
    assert block.label == 'Semester 1'
