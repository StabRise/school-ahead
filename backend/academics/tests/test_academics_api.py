import datetime

import pytest

from academics.models import Class, School, Subject, SubjectBlock, Topic
from accounts.models import Role, StudentProfile, User

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


def test_my_subjects_scoped_to_own_class(api_client, auth_header, school_class, subject, school):
    other_class = Class.objects.create(
        school=school, name='6', order_index=6, academic_year='2025/2026'
    )
    Subject.objects.create(school_class=other_class, name='History')

    enrolled_user = User.objects.create_user(email='enrolled@example.com', role=Role.STUDENT)
    StudentProfile.objects.create(user=enrolled_user, school_class=school_class)

    response = api_client.get('/academics/my-subjects', headers=auth_header(enrolled_user))
    assert response.status_code == 200
    assert [s['name'] for s in response.data] == ['Math']


def test_my_subjects_rejects_user_without_student_profile(api_client, auth_header, student_user):
    # student_user has no StudentProfile row at all.
    response = api_client.get('/academics/my-subjects', headers=auth_header(student_user))
    assert response.status_code == 403


def test_my_subjects_empty_when_profile_has_no_class(api_client, auth_header):
    user = User.objects.create_user(email='unassigned@example.com', role=Role.STUDENT)
    StudentProfile.objects.create(user=user, school_class=None)

    response = api_client.get('/academics/my-subjects', headers=auth_header(user))
    assert response.status_code == 200
    assert response.data == []


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


def test_get_subject_teacher_name_null_when_unassigned(api_client, auth_header, student_user, subject):
    response = api_client.get(f'/academics/subjects/{subject.id}', headers=auth_header(student_user))
    assert response.status_code == 200
    assert response.data['teacher_name'] is None


def test_get_subject_teacher_name_joins_active_tutors(api_client, auth_header, student_user, subject):
    from accounts.models import TutorProfile
    from tutoring.models import TutorSubjectAssignment

    active_tutor = TutorProfile.objects.create(
        user=User.objects.create_user(
            email='smirnova@example.com', role=Role.TUTOR, first_name='А.', last_name='Смирнова',
        )
    )
    inactive_tutor = TutorProfile.objects.create(
        user=User.objects.create_user(email='inactive@example.com', role=Role.TUTOR, first_name='Old')
    )
    TutorSubjectAssignment.objects.create(tutor=active_tutor, subject=subject)
    TutorSubjectAssignment.objects.create(tutor=inactive_tutor, subject=subject, is_active=False)

    response = api_client.get(f'/academics/subjects/{subject.id}', headers=auth_header(student_user))
    assert response.status_code == 200
    assert response.data['teacher_name'] == 'А. Смирнова'


def test_get_topic(api_client, auth_header, student_user, subject):
    topic = Topic.objects.create(subject=subject, title='Fractions', description='Numerators & co', order_index=1)

    response = api_client.get(f'/academics/topics/{topic.id}', headers=auth_header(student_user))
    assert response.status_code == 200
    assert response.data['title'] == 'Fractions'
    assert response.data['description'] == 'Numerators & co'
    assert response.data['subject_id'] == subject.id


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


def test_assign_topics_to_blocks_even_split(subject):
    from academics import services

    subject.block_count = 2
    subject.save()
    services.ensure_subject_blocks(subject)
    topics = [Topic.objects.create(subject=subject, title=f'T{i}', order_index=i) for i in range(1, 5)]

    services.assign_topics_to_blocks(subject)

    blocks_by_index = {b.index: b for b in subject.blocks.all()}
    for topic in topics:
        topic.refresh_from_db()
    assert [t.subject_block_id for t in topics] == [
        blocks_by_index[1].id, blocks_by_index[1].id, blocks_by_index[2].id, blocks_by_index[2].id,
    ]


def test_assign_topics_to_blocks_remainder_goes_to_first_block(subject):
    from academics import services

    subject.block_count = 2
    subject.save()
    services.ensure_subject_blocks(subject)
    topics = [Topic.objects.create(subject=subject, title=f'T{i}', order_index=i) for i in range(1, 4)]

    services.assign_topics_to_blocks(subject)

    blocks_by_index = {b.index: b for b in subject.blocks.all()}
    for topic in topics:
        topic.refresh_from_db()
    assert [t.subject_block_id for t in topics] == [
        blocks_by_index[1].id, blocks_by_index[1].id, blocks_by_index[2].id,
    ]


def test_assign_topics_to_blocks_noop_without_blocks(subject):
    from academics import services

    topic = Topic.objects.create(subject=subject, title='Solo', order_index=1)
    services.assign_topics_to_blocks(subject)
    topic.refresh_from_db()
    assert topic.subject_block_id is None


def test_create_topic_via_api_gets_assigned_a_block(api_client, auth_header, admin_user, subject):
    from academics import services

    subject.block_count = 1
    subject.save()
    services.ensure_subject_blocks(subject)

    response = api_client.post(
        '/academics/topics',
        json={'subject_id': subject.id, 'title': 'Intro', 'order_index': 1},
        headers=auth_header(admin_user),
    )
    assert response.status_code == 200
    assert response.data['subject_block_label'] == 'Semester 1'


def test_delete_topic_reassigns_remaining_topics(api_client, auth_header, admin_user, subject):
    from academics import services

    subject.block_count = 2
    subject.save()
    services.ensure_subject_blocks(subject)
    t1 = Topic.objects.create(subject=subject, title='T1', order_index=1)
    t2 = Topic.objects.create(subject=subject, title='T2', order_index=2)
    services.assign_topics_to_blocks(subject)
    # Pre-condition: with 2 topics across 2 blocks, t2 starts in the second block.
    t2.refresh_from_db()
    assert t2.subject_block_id == subject.blocks.get(index=2).id

    response = api_client.delete(f'/academics/topics/{t1.id}', headers=auth_header(admin_user))
    assert response.status_code == 204

    t2.refresh_from_db()
    # With only one topic left and two blocks, it lands in the first block.
    assert t2.subject_block_id == subject.blocks.get(index=1).id
