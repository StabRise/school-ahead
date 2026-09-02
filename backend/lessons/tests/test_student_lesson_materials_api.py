import datetime

import pytest
from academics.models import Class, School, Subject, Topic
from accounts.models import Role, StudentProfile, User

from lessons.models import Lesson, LessonType, StudentLesson, StudentLessonStatus

pytestmark = pytest.mark.django_db


@pytest.fixture
def topic():
    school = School.objects.create(name='Ahead School')
    school_class = Class.objects.create(school=school, name='5', order_index=5, academic_year='2025/2026')
    subject = Subject.objects.create(school_class=school_class, name='Math')
    return Topic.objects.create(subject=subject, title='Fractions', order_index=1)


@pytest.fixture
def student():
    user = User.objects.create_user(email='student@example.com', role=Role.STUDENT)
    return StudentProfile.objects.create(user=user)


@pytest.fixture
def other_student():
    user = User.objects.create_user(email='other@example.com', role=Role.STUDENT)
    return StudentProfile.objects.create(user=user)


@pytest.fixture
def student_lesson(topic, student):
    lesson = Lesson.objects.create(
        topic=topic, order_index=1, title='Understanding fractions',
        lesson_type=LessonType.THEORY, grading_type='binary',
    )
    return StudentLesson.objects.create(
        student=student, lesson=lesson, scheduled_date=datetime.date.today()
    )


SAMPLE_CONTENT = [
    {'kind': 'heading', 'sentences': ['Cywilizacje Mezopotamii']},
    {'kind': 'paragraph', 'sentences': ['Zdanie pierwsze.', 'Zdanie drugie.']},
    {'kind': 'image', 'src': 'https://example.com/image.png', 'alt': 'opis'},
]

# MaterialBlockOut fills every unset optional field with an explicit None on
# round-trip (it's one flat schema covering all three block kinds — see its
# docstring in lessons/schemas.py) — this is what SAMPLE_CONTENT above comes
# back as once stored and re-serialized.
EXPECTED_STORED_CONTENT = [
    {'kind': 'heading', 'sentences': ['Cywilizacje Mezopotamii'], 'src': None, 'alt': None},
    {'kind': 'paragraph', 'sentences': ['Zdanie pierwsze.', 'Zdanie drugie.'], 'src': None, 'alt': None},
    {'kind': 'image', 'sentences': None, 'src': 'https://example.com/image.png', 'alt': 'opis'},
]


def test_add_and_list_materials(api_client, auth_header, student, student_lesson):
    headers = auth_header(student.user)

    post_response = api_client.post(
        f'/student-lessons/{student_lesson.id}/materials',
        json={
            'title': 'Cywilizacje Mezopotamii',
            'content': SAMPLE_CONTENT,
            'source_url': 'https://zpe.gov.pl/a/cywilizacje-mezopotamii/D5ARuvGrM',
            'language': 'pl',
        },
        headers=headers,
    )
    assert post_response.status_code == 200
    assert post_response.data['title'] == 'Cywilizacje Mezopotamii'
    assert post_response.data['content'] == EXPECTED_STORED_CONTENT
    assert post_response.data['source_url'] == 'https://zpe.gov.pl/a/cywilizacje-mezopotamii/D5ARuvGrM'
    assert post_response.data['language'] == 'pl'

    list_response = api_client.get(f'/student-lessons/{student_lesson.id}/materials', headers=headers)
    assert list_response.status_code == 200
    assert len(list_response.data) == 1
    assert list_response.data[0]['content'] == EXPECTED_STORED_CONTENT

    # Also exposed on the StudentLesson detail response, under a distinct
    # field name from LessonOut.materials (the tutor-authored attachments).
    lesson_response = api_client.get(f'/student-lessons/{student_lesson.id}', headers=headers)
    assert len(lesson_response.data['reading_materials']) == 1
    assert lesson_response.data['reading_materials'][0]['title'] == 'Cywilizacje Mezopotamii'


def test_materials_scoped_to_owner(api_client, auth_header, other_student, student_lesson):
    headers = auth_header(other_student.user)

    post_response = api_client.post(
        f'/student-lessons/{student_lesson.id}/materials',
        json={'content': SAMPLE_CONTENT, 'language': 'en'},
        headers=headers,
    )
    assert post_response.status_code == 403

    list_response = api_client.get(f'/student-lessons/{student_lesson.id}/materials', headers=headers)
    assert list_response.status_code == 403


def test_list_my_assignable_lessons_excludes_completed_and_orders_by_date(api_client, auth_header, topic, student):
    lesson_a = Lesson.objects.create(
        topic=topic, order_index=1, title='Lesson A',
        lesson_type=LessonType.THEORY, grading_type='binary',
    )
    lesson_b = Lesson.objects.create(
        topic=topic, order_index=2, title='Lesson B',
        lesson_type=LessonType.THEORY, grading_type='binary',
    )
    lesson_c = Lesson.objects.create(
        topic=topic, order_index=3, title='Lesson C (done)',
        lesson_type=LessonType.THEORY, grading_type='binary',
    )
    today = datetime.date.today()
    sl_a = StudentLesson.objects.create(student=student, lesson=lesson_a, scheduled_date=today + datetime.timedelta(days=2))
    sl_b = StudentLesson.objects.create(student=student, lesson=lesson_b, scheduled_date=today)
    StudentLesson.objects.create(
        student=student, lesson=lesson_c, scheduled_date=today, status=StudentLessonStatus.COMPLETED,
    )

    response = api_client.get('/student-lessons/mine', headers=auth_header(student.user))
    assert response.status_code == 200
    assert [row['id'] for row in response.data] == [sl_b.id, sl_a.id]
    assert response.data[0]['subject_name'] == 'Math'


def test_list_my_assignable_lessons_scoped_to_own_student(api_client, auth_header, other_student, student_lesson):
    response = api_client.get('/student-lessons/mine', headers=auth_header(other_student.user))
    assert response.status_code == 200
    assert response.data == []
