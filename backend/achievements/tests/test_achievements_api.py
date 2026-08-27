import datetime

import pytest

from academics.models import Class, School, Subject, SubjectBlock, Topic
from accounts.models import Role, StudentProfile, User
from lessons import services as lesson_services
from lessons.models import Lesson, LessonType, StudentLesson

pytestmark = pytest.mark.django_db


@pytest.fixture
def school_class():
    school = School.objects.create(name='Ahead School')
    return Class.objects.create(school=school, name='5', order_index=5, academic_year='2025/2026')


@pytest.fixture
def student(school_class):
    user = User.objects.create_user(email='student@example.com', role=Role.STUDENT)
    return StudentProfile.objects.create(user=user, school_class=school_class)


def test_list_my_achievements_computes_progress_across_all_lessons(api_client, auth_header, school_class, student):
    subject = Subject.objects.create(school_class=school_class, name='Math')
    topic = Topic.objects.create(subject=subject, title='Fractions', order_index=1)
    lesson1 = Lesson.objects.create(
        topic=topic, order_index=1, title='Lesson 1', lesson_type=LessonType.THEORY, grading_type='binary',
    )
    Lesson.objects.create(
        topic=topic, order_index=2, title='Never assigned', lesson_type=LessonType.THEORY, grading_type='binary',
    )
    student_lesson = StudentLesson.objects.create(
        student=student, lesson=lesson1, scheduled_date=datetime.date.today()
    )
    lesson_services.start(student_lesson, student.user)
    lesson_services.confirm_understanding(student_lesson, student.user, understood=True)  # -> completed

    response = api_client.get('/achievements/subjects', headers=auth_header(student.user))
    assert response.status_code == 200
    assert len(response.data) == 1
    row = response.data[0]
    assert row['subject_id'] == subject.id
    assert row['completed_count'] == 1
    assert row['total_count'] == 2
    assert row['completed_percent'] == 50.0
    assert row['badge']['name'] == 'Дослідник'
    assert row['blocks'] == []


def test_list_my_achievements_includes_block_breakdown(api_client, auth_header, school_class, student):
    subject = Subject.objects.create(school_class=school_class, name='Math')
    block1 = SubjectBlock.objects.create(subject=subject, index=1, label='Semester 1')
    block2 = SubjectBlock.objects.create(subject=subject, index=2, label='Semester 2')
    topic1 = Topic.objects.create(subject=subject, title='Fractions', order_index=1, subject_block=block1)
    topic2 = Topic.objects.create(subject=subject, title='Decimals', order_index=2, subject_block=block2)
    lesson1 = Lesson.objects.create(
        topic=topic1, order_index=1, title='Lesson 1', lesson_type=LessonType.THEORY, grading_type='binary',
    )
    Lesson.objects.create(
        topic=topic2, order_index=1, title='Lesson 2', lesson_type=LessonType.THEORY, grading_type='binary',
    )
    student_lesson = StudentLesson.objects.create(
        student=student, lesson=lesson1, scheduled_date=datetime.date.today()
    )
    lesson_services.start(student_lesson, student.user)
    lesson_services.confirm_understanding(student_lesson, student.user, understood=True)  # -> completed

    response = api_client.get('/achievements/subjects', headers=auth_header(student.user))
    assert response.status_code == 200
    blocks_by_label = {b['label']: b for b in response.data[0]['blocks']}
    assert blocks_by_label['Semester 1'] == {
        'id': block1.id, 'index': 1, 'label': 'Semester 1',
        'completed_count': 1, 'total_count': 1, 'completed_percent': 100.0,
    }
    assert blocks_by_label['Semester 2'] == {
        'id': block2.id, 'index': 2, 'label': 'Semester 2',
        'completed_count': 0, 'total_count': 1, 'completed_percent': 0.0,
    }


def test_list_my_achievements_empty_when_no_class(api_client, auth_header):
    user = User.objects.create_user(email='no-class@example.com', role=Role.STUDENT)
    student = StudentProfile.objects.create(user=user)

    response = api_client.get('/achievements/subjects', headers=auth_header(student.user))
    assert response.status_code == 200
    assert response.data == []
