import datetime

import pytest

from academics.models import Class, School, Subject, Topic
from accounts.models import Role, StudentProfile, User
from cards.models import StudentCard, StudentCustomTopic
from lessons.models import Lesson, LessonType, StudentLesson

pytestmark = pytest.mark.django_db


@pytest.fixture
def subject():
    school = School.objects.create(name='Ahead School')
    school_class = Class.objects.create(school=school, name='5', order_index=5, academic_year='2025/2026')
    return Subject.objects.create(school_class=school_class, name='English')


@pytest.fixture
def topic(subject):
    return Topic.objects.create(subject=subject, title='Greetings', order_index=1)


@pytest.fixture
def student(subject):
    # Enrolled in the same class as `subject` — the cards endpoints
    # authorize a group/set slug by checking this, not by whether the
    # student has already saved cards there (see cards/api.py::_parse_subject_id).
    user = User.objects.create_user(email='student@example.com', role=Role.STUDENT)
    return StudentProfile.objects.create(user=user, school_class=subject.school_class)


@pytest.fixture
def other_student():
    # Deliberately NOT enrolled in `subject`'s class.
    user = User.objects.create_user(email='other-student@example.com', role=Role.STUDENT)
    return StudentProfile.objects.create(user=user)


@pytest.fixture
def student_lesson(topic, student):
    lesson = Lesson.objects.create(
        topic=topic, order_index=1, title='Saying hello', lesson_type=LessonType.THEORY, grading_type='binary',
    )
    return StudentLesson.objects.create(student=student, lesson=lesson, scheduled_date=datetime.date.today())


def test_add_card_persists_and_returns_it(api_client, auth_header, student, student_lesson):
    response = api_client.post(
        '/cards',
        json={
            'student_lesson_id': student_lesson.id,
            'term': 'hello',
            'translation': 'привіт',
            'definition': 'Hello, how are you?',
        },
        headers=auth_header(student.user),
    )

    assert response.status_code == 200
    assert response.data['term'] == 'hello'
    assert response.data['translation'] == 'привіт'
    card = StudentCard.objects.get()
    assert card.student_id == student.id
    assert card.lesson_id == student_lesson.lesson_id
    assert card.order_index == 0


def test_add_card_appends_order_index_within_same_lesson(api_client, auth_header, student, student_lesson):
    api_client.post(
        '/cards',
        json={'student_lesson_id': student_lesson.id, 'term': 'hello', 'translation': 'привіт'},
        headers=auth_header(student.user),
    )
    api_client.post(
        '/cards',
        json={'student_lesson_id': student_lesson.id, 'term': 'bye', 'translation': 'бувай'},
        headers=auth_header(student.user),
    )

    cards = list(StudentCard.objects.order_by('order_index'))
    assert [c.order_index for c in cards] == [0, 1]


def test_add_card_forbidden_for_non_owner(api_client, auth_header, other_student, student_lesson):
    response = api_client.post(
        '/cards',
        json={'student_lesson_id': student_lesson.id, 'term': 'hello', 'translation': 'привіт'},
        headers=auth_header(other_student.user),
    )

    assert response.status_code == 403
    assert StudentCard.objects.count() == 0


def test_update_card_translation_persists(api_client, auth_header, student, student_lesson):
    card = StudentCard.objects.create(student=student, lesson=student_lesson.lesson, term='hi', translation='привіт')

    response = api_client.patch(
        f'/cards/{card.id}/translation', json={'translation': 'вітаю'}, headers=auth_header(student.user),
    )

    assert response.status_code == 200
    assert response.data['translation'] == 'вітаю'
    card.refresh_from_db()
    assert card.translation == 'вітаю'


def test_update_card_translation_rejects_empty(api_client, auth_header, student, student_lesson):
    card = StudentCard.objects.create(student=student, lesson=student_lesson.lesson, term='hi', translation='привіт')

    response = api_client.patch(
        f'/cards/{card.id}/translation', json={'translation': '   '}, headers=auth_header(student.user),
    )

    assert response.status_code == 400
    card.refresh_from_db()
    assert card.translation == 'привіт'


def test_update_card_translation_forbidden_for_other_student(
    api_client, auth_header, other_student, student, student_lesson
):
    card = StudentCard.objects.create(student=student, lesson=student_lesson.lesson, term='hi', translation='привіт')

    response = api_client.patch(
        f'/cards/{card.id}/translation', json={'translation': 'нове'}, headers=auth_header(other_student.user),
    )

    assert response.status_code == 403
    card.refresh_from_db()
    assert card.translation == 'привіт'


def test_delete_card_removes_it(api_client, auth_header, student, student_lesson):
    card = StudentCard.objects.create(student=student, lesson=student_lesson.lesson, term='hi', translation='привіт')

    response = api_client.delete(f'/cards/{card.id}', headers=auth_header(student.user))

    assert response.status_code == 204
    assert not StudentCard.objects.filter(id=card.id).exists()


def test_delete_card_forbidden_for_other_student(api_client, auth_header, other_student, student, student_lesson):
    card = StudentCard.objects.create(student=student, lesson=student_lesson.lesson, term='hi', translation='привіт')

    response = api_client.delete(f'/cards/{card.id}', headers=auth_header(other_student.user))

    assert response.status_code == 403
    assert StudentCard.objects.filter(id=card.id).exists()


def test_list_groups_only_includes_subjects_with_cards(api_client, auth_header, student, student_lesson, subject):
    response = api_client.get('/cards/groups', headers=auth_header(student.user))
    assert response.status_code == 200
    assert response.data == []

    StudentCard.objects.create(student=student, lesson=student_lesson.lesson, term='hi', translation='привіт')

    response = api_client.get('/cards/groups', headers=auth_header(student.user))
    assert response.status_code == 200
    assert response.data == [{'slug': f'subject-{subject.id}', 'title': 'English'}]


def test_list_sets_scoped_to_group_and_counts_categories_items(
    api_client, auth_header, student, student_lesson, topic
):
    StudentCard.objects.create(student=student, lesson=student_lesson.lesson, term='hi', translation='привіт')
    StudentCard.objects.create(student=student, lesson=student_lesson.lesson, term='bye', translation='бувай')

    response = api_client.get(
        f'/cards/groups/subject-{topic.subject_id}/sets', headers=auth_header(student.user)
    )

    assert response.status_code == 200
    assert response.data == [
        {'slug': f'topic-{topic.id}', 'title': 'Greetings', 'category_count': 1, 'item_count': 2}
    ]


def test_list_sets_rejects_unknown_group(api_client, auth_header, student):
    response = api_client.get('/cards/groups/subject-999999/sets', headers=auth_header(student.user))
    assert response.status_code == 404


def test_list_sets_returns_empty_for_own_subject_with_no_cards_yet(api_client, auth_header, student, subject):
    """The Subject page's own Cards tab queries its subject directly (not
    via /cards/groups), so a subject the student hasn't saved any cards for
    yet must come back as an empty list, not a 404 — see
    cards/api.py::_parse_subject_id."""
    response = api_client.get(f'/cards/groups/subject-{subject.id}/sets', headers=auth_header(student.user))
    assert response.status_code == 200
    assert response.data == []


def test_list_sets_rejects_subject_from_another_class(api_client, auth_header, other_student, subject):
    response = api_client.get(
        f'/cards/groups/subject-{subject.id}/sets', headers=auth_header(other_student.user)
    )
    assert response.status_code == 403


def test_get_set_groups_items_by_lesson(api_client, auth_header, student, student_lesson, topic):
    StudentCard.objects.create(student=student, lesson=student_lesson.lesson, term='hi', translation='привіт')
    StudentCard.objects.create(student=student, lesson=student_lesson.lesson, term='bye', translation='бувай')

    response = api_client.get(
        f'/cards/groups/subject-{topic.subject_id}/sets/topic-{topic.id}', headers=auth_header(student.user)
    )

    assert response.status_code == 200
    assert response.data['title'] == 'Greetings'
    assert len(response.data['categories']) == 1
    category = response.data['categories'][0]
    assert category['title'] == student_lesson.lesson.title
    assert [item['term'] for item in category['items']] == ['hi', 'bye']


def test_get_set_returns_empty_categories_for_own_topic_with_no_cards_yet(api_client, auth_header, student, topic):
    response = api_client.get(
        f'/cards/groups/subject-{topic.subject_id}/sets/topic-{topic.id}', headers=auth_header(student.user)
    )
    assert response.status_code == 200
    assert response.data == {'title': 'Greetings', 'categories': []}


def test_get_set_rejects_another_students_class(api_client, auth_header, other_student, student, student_lesson, topic):
    StudentCard.objects.create(student=student, lesson=student_lesson.lesson, term='hi', translation='привіт')

    response = api_client.get(
        f'/cards/groups/subject-{topic.subject_id}/sets/topic-{topic.id}', headers=auth_header(other_student.user)
    )

    assert response.status_code == 403


def _import_payload(subject_id, title='Greetings', category_title='Saying hello', items=None):
    return {
        'subject_id': subject_id,
        'title': title,
        'categories': [
            {
                'title': category_title,
                'items': items or [{'term': 'hi', 'translation': 'привіт'}],
            }
        ],
    }


def test_import_attaches_to_matching_real_topic_and_lesson(
    api_client, auth_header, student, student_lesson, topic, subject
):
    response = api_client.post(
        '/cards/import', json=_import_payload(subject.id), headers=auth_header(student.user),
    )

    assert response.status_code == 200
    assert response.data == {
        'group_slug': f'subject-{subject.id}',
        'group_title': subject.name,
        'set_slug': f'topic-{topic.id}',
        'set_title': topic.title,
        'imported_count': 1,
    }
    card = StudentCard.objects.get()
    assert card.lesson_id == student_lesson.lesson_id
    assert card.custom_lesson_id is None
    assert StudentCustomTopic.objects.count() == 0


def test_import_matching_real_topic_and_lesson_appends_order_index(
    api_client, auth_header, student, student_lesson, topic, subject
):
    StudentCard.objects.create(student=student, lesson=student_lesson.lesson, term='old', translation='старе')

    response = api_client.post('/cards/import', json=_import_payload(subject.id), headers=auth_header(student.user))

    assert response.status_code == 200
    new_card = StudentCard.objects.get(term='hi')
    assert new_card.order_index == 1


def test_import_falls_back_to_custom_topic_when_topic_unmatched(api_client, auth_header, student, subject):
    """`subject_id` is real, but no real Topic under it is named "Unknown
    topic" — the cards still land under that same real Subject's group
    (`subject-<id>`), just as a personal `custom-<id>` set instead of a
    real `topic-<id>` one, so they always show up on that Subject's own
    Картки tab."""
    response = api_client.post(
        '/cards/import', json=_import_payload(subject.id, title='Unknown topic'), headers=auth_header(student.user),
    )

    assert response.status_code == 200
    custom_topic = StudentCustomTopic.objects.get()
    assert custom_topic.subject_id == subject.id
    assert custom_topic.title == 'Unknown topic'
    assert response.data == {
        'group_slug': f'subject-{subject.id}',
        'group_title': subject.name,
        'set_slug': f'custom-{custom_topic.id}',
        'set_title': 'Unknown topic',
        'imported_count': 1,
    }
    card = StudentCard.objects.get()
    assert card.lesson_id is None
    assert card.custom_lesson.topic_id == custom_topic.id

    groups = api_client.get('/cards/groups', headers=auth_header(student.user))
    assert groups.data == [{'slug': f'subject-{subject.id}', 'title': subject.name}]

    sets = api_client.get(f'/cards/groups/subject-{subject.id}/sets', headers=auth_header(student.user))
    assert sets.data == [
        {'slug': f'custom-{custom_topic.id}', 'title': 'Unknown topic', 'category_count': 1, 'item_count': 1}
    ]

    detail = api_client.get(
        f'/cards/groups/subject-{subject.id}/sets/custom-{custom_topic.id}', headers=auth_header(student.user)
    )
    assert detail.data['title'] == 'Unknown topic'
    assert detail.data['categories'][0]['title'] == 'Saying hello'
    assert detail.data['categories'][0]['items'][0]['term'] == 'hi'


def test_real_and_custom_topic_sets_appear_side_by_side_under_same_subject(
    api_client, auth_header, student, student_lesson, topic, subject
):
    StudentCard.objects.create(student=student, lesson=student_lesson.lesson, term='hi', translation='привіт')
    api_client.post(
        '/cards/import', json=_import_payload(subject.id, title='Unknown topic'), headers=auth_header(student.user)
    )

    sets = api_client.get(f'/cards/groups/subject-{subject.id}/sets', headers=auth_header(student.user))
    custom_topic = StudentCustomTopic.objects.get()
    assert {s['slug'] for s in sets.data} == {f'topic-{topic.id}', f'custom-{custom_topic.id}'}


def test_import_falls_back_to_custom_topic_when_lesson_unmatched(api_client, auth_header, student, topic, subject):
    """`title` matches a real Topic, but no real Lesson under it is named
    "Unknown lesson" — the whole import (not just this category) still
    goes to a personal `custom-<id>` set under the same real `subject-<id>`
    group, keeping a single import from landing split across two
    different sets."""
    response = api_client.post(
        '/cards/import',
        json=_import_payload(subject.id, title=topic.title, category_title='Unknown lesson'),
        headers=auth_header(student.user),
    )

    assert response.status_code == 200
    assert response.data['group_slug'] == f'subject-{subject.id}'
    assert response.data['set_slug'].startswith('custom-')
    custom_topic = StudentCustomTopic.objects.get()
    assert custom_topic.title == topic.title
    assert custom_topic.subject_id == subject.id
    assert StudentCard.objects.get().lesson_id is None


def test_import_reuses_existing_custom_topic_on_repeat_import(api_client, auth_header, student, subject):
    api_client.post(
        '/cards/import', json=_import_payload(subject.id, title='Unknown topic'), headers=auth_header(student.user)
    )
    response = api_client.post(
        '/cards/import',
        json=_import_payload(subject.id, title='Unknown topic', items=[{'term': 'bye', 'translation': 'бувай'}]),
        headers=auth_header(student.user),
    )

    assert response.status_code == 200
    assert StudentCustomTopic.objects.count() == 1
    cards = list(StudentCard.objects.order_by('order_index'))
    assert [c.term for c in cards] == ['hi', 'bye']
    assert [c.order_index for c in cards] == [0, 1]


def test_import_rejects_empty_title(api_client, auth_header, student, subject):
    response = api_client.post(
        '/cards/import', json=_import_payload(subject.id, title='   '), headers=auth_header(student.user),
    )
    assert response.status_code == 400
    assert StudentCard.objects.count() == 0


def test_import_rejects_empty_categories(api_client, auth_header, student, subject):
    response = api_client.post(
        '/cards/import',
        json={'subject_id': subject.id, 'title': 'Some topic', 'categories': []},
        headers=auth_header(student.user),
    )
    assert response.status_code == 400


def test_import_rejects_unknown_subject(api_client, auth_header, student):
    response = api_client.post(
        '/cards/import', json=_import_payload(999999), headers=auth_header(student.user),
    )
    assert response.status_code == 404
    assert StudentCard.objects.count() == 0


def test_import_rejects_subject_from_another_class(api_client, auth_header, other_student, subject):
    response = api_client.post(
        '/cards/import', json=_import_payload(subject.id), headers=auth_header(other_student.user),
    )
    assert response.status_code == 403
    assert StudentCard.objects.count() == 0


def test_custom_topic_set_hidden_once_its_only_card_is_deleted(api_client, auth_header, student, subject):
    api_client.post(
        '/cards/import', json=_import_payload(subject.id, title='Unknown topic'), headers=auth_header(student.user)
    )
    card = StudentCard.objects.get()

    api_client.delete(f'/cards/{card.id}', headers=auth_header(student.user))

    groups = api_client.get('/cards/groups', headers=auth_header(student.user))
    assert groups.data == []

    sets = api_client.get(f'/cards/groups/subject-{subject.id}/sets', headers=auth_header(student.user))
    assert sets.data == []
