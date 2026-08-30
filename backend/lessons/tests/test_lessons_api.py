import datetime

import pytest

from academics.models import Class, School, Subject, Topic
from accounts.models import Role, StudentProfile, User
from lessons.models import Lesson, LessonType, StudentLesson

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


def test_get_lesson_as_owner(api_client, auth_header, student, student_lesson):
    response = api_client.get(
        f'/student-lessons/{student_lesson.id}', headers=auth_header(student.user)
    )
    assert response.status_code == 200
    # GET auto-transitions Assigned -> InProgress on access (spec 2.1).
    assert response.data['status'] == 'in_progress'
    assert response.data['lesson']['title'] == 'Understanding fractions'
    # Breadcrumb fields (Subject / SubjectBlock / Lesson) for the wizard header.
    assert response.data['lesson']['subject_id'] == student_lesson.lesson.topic.subject_id
    assert response.data['lesson']['subject_name'] == 'Math'
    assert response.data['lesson']['topic_title'] == 'Fractions'
    assert response.data['lesson']['subject_block_label'] is None


def test_get_lesson_exposes_submissions_with_threaded_feedback(api_client, auth_header, topic, student):
    from lessons import services

    lesson = Lesson.objects.create(
        topic=topic, order_index=2, title='Practical work',
        lesson_type=LessonType.WITH_TASK, grading_type='points',
    )
    sl = StudentLesson.objects.create(
        student=student, lesson=lesson, scheduled_date=datetime.date.today()
    )
    services.start(sl, student.user)
    services.submit_task(sl, student.user, comment='v1')
    services.request_revision(sl, student.user, feedback='fix the second step')
    services.resubmit(sl, student.user, comment='v2')

    response = api_client.get(f'/student-lessons/{sl.id}', headers=auth_header(student.user))
    assert response.status_code == 200
    submissions = response.data['submissions']
    assert [s['comment'] for s in submissions] == ['v1', 'v2']  # oldest first
    assert submissions[0]['tutor_feedback'] == 'fix the second step'
    assert submissions[0]['feedback_at'] is not None
    assert submissions[1]['tutor_feedback'] == ''


def test_submit_task_accepts_multiple_files(api_client, auth_header, topic, student):
    from django.core.files.uploadedfile import SimpleUploadedFile
    from django.utils.datastructures import MultiValueDict

    from lessons import services

    lesson = Lesson.objects.create(
        topic=topic, order_index=4, title='Practical work',
        lesson_type=LessonType.WITH_TASK, grading_type='points',
    )
    sl = StudentLesson.objects.create(
        student=student, lesson=lesson, scheduled_date=datetime.date.today()
    )
    services.start(sl, student.user)

    files = MultiValueDict({
        'files': [
            SimpleUploadedFile('one.png', b'first-file-bytes', content_type='image/png'),
            SimpleUploadedFile('two.png', b'second-file-bytes', content_type='image/png'),
        ],
    })
    response = api_client.post(
        f'/student-lessons/{sl.id}/submit-task',
        data={'comment': 'two files'},
        FILES=files,
        headers=auth_header(student.user),
    )
    assert response.status_code == 200
    submission = response.data['submissions'][0]
    assert submission['comment'] == 'two files'
    assert len(submission['files']) == 2


def test_get_lesson_exposes_subject_block_label_when_scheduled(api_client, auth_header, topic, student):
    from academics.models import SubjectBlock

    block = SubjectBlock.objects.create(subject=topic.subject, index=1, label='Semester 1')
    topic.subject_block = block
    topic.save()
    lesson = Lesson.objects.create(
        topic=topic, order_index=3, title='Practical work',
        lesson_type=LessonType.WITH_TASK, grading_type='points',
    )
    sl = StudentLesson.objects.create(
        student=student, lesson=lesson, scheduled_date=datetime.date.today()
    )

    response = api_client.get(f'/student-lessons/{sl.id}', headers=auth_header(student.user))
    assert response.status_code == 200
    assert response.data['lesson']['subject_block_label'] == 'Semester 1'


def test_get_lesson_does_not_re_transition_once_progressed(
    api_client, auth_header, student, student_lesson
):
    headers = auth_header(student.user)
    api_client.get(f'/student-lessons/{student_lesson.id}', headers=headers)

    api_client.post(
        f'/student-lessons/{student_lesson.id}/request-help', json={'note': 'stuck'}, headers=headers
    )
    response = api_client.get(f'/student-lessons/{student_lesson.id}', headers=headers)
    assert response.data['status'] == 'need_help'


def test_get_lesson_rejects_non_owner(api_client, auth_header, other_student, student_lesson):
    response = api_client.get(
        f'/student-lessons/{student_lesson.id}', headers=auth_header(other_student.user)
    )
    assert response.status_code == 403


def test_start_and_confirm_understanding_flow(api_client, auth_header, student, student_lesson):
    headers = auth_header(student.user)

    start_response = api_client.post(f'/student-lessons/{student_lesson.id}/start', headers=headers)
    assert start_response.status_code == 200
    assert start_response.data['status'] == 'in_progress'

    confirm_response = api_client.post(
        f'/student-lessons/{student_lesson.id}/confirm-understanding',
        json={'understood': True},
        headers=headers,
    )
    assert confirm_response.status_code == 200
    assert confirm_response.data['status'] == 'completed'
    assert confirm_response.data['grade_result'] == 'pass'


def test_invalid_transition_returns_409(api_client, auth_header, student, student_lesson):
    headers = auth_header(student.user)
    # Lesson is still "assigned" — confirm-understanding requires in_progress.
    response = api_client.post(
        f'/student-lessons/{student_lesson.id}/confirm-understanding',
        json={'understood': True},
        headers=headers,
    )
    assert response.status_code == 409


def test_request_help_sets_note(api_client, auth_header, student, student_lesson):
    headers = auth_header(student.user)
    api_client.post(f'/student-lessons/{student_lesson.id}/start', headers=headers)

    response = api_client.post(
        f'/student-lessons/{student_lesson.id}/request-help',
        json={'note': 'confused about denominators'},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.data['status'] == 'need_help'
    assert response.data['help_note'] == 'confused about denominators'


def test_add_and_list_comments(api_client, auth_header, student, student_lesson):
    headers = auth_header(student.user)
    api_client.get(f'/student-lessons/{student_lesson.id}', headers=headers)

    post_response = api_client.post(
        f'/student-lessons/{student_lesson.id}/comments', json={'body': 'hello'}, headers=headers
    )
    assert post_response.status_code == 200
    assert post_response.data['kind'] == 'general'
    assert post_response.data['author_name'] == (student.user.full_name or student.user.email)

    list_response = api_client.get(f'/student-lessons/{student_lesson.id}/comments', headers=headers)
    assert list_response.status_code == 200
    assert len(list_response.data) == 1

    # posting a general comment never changes status
    lesson_response = api_client.get(f'/student-lessons/{student_lesson.id}', headers=headers)
    assert lesson_response.data['status'] == 'in_progress'


def test_resolve_own_need_help(api_client, auth_header, student, student_lesson):
    headers = auth_header(student.user)
    api_client.post(f'/student-lessons/{student_lesson.id}/start', headers=headers)
    api_client.post(
        f'/student-lessons/{student_lesson.id}/request-help', json={'note': 'stuck'}, headers=headers
    )

    response = api_client.post(
        f'/student-lessons/{student_lesson.id}/resolve-need-help', headers=headers
    )
    assert response.status_code == 200
    assert response.data['status'] == 'in_progress'

    comments = api_client.get(f'/student-lessons/{student_lesson.id}/comments', headers=headers)
    help_comment = next(c for c in comments.data if c['kind'] == 'help_request')
    assert help_comment['is_resolved'] is True


def test_resolve_own_need_help_rejects_wrong_status(api_client, auth_header, student, student_lesson):
    headers = auth_header(student.user)
    response = api_client.post(
        f'/student-lessons/{student_lesson.id}/resolve-need-help', headers=headers
    )
    assert response.status_code == 409


def test_get_subject_progress(api_client, auth_header, topic, student, student_lesson):
    from lessons import services

    lesson2 = Lesson.objects.create(
        topic=topic, order_index=2, title='Second lesson',
        lesson_type=LessonType.THEORY, grading_type='binary',
    )
    sl2 = StudentLesson.objects.create(
        student=student, lesson=lesson2, scheduled_date=datetime.date.today()
    )
    services.start(sl2, student.user)
    services.confirm_understanding(sl2, student.user, understood=True)  # -> completed

    response = api_client.get(
        f'/student-lessons/subjects/{topic.subject_id}/progress', headers=auth_header(student.user)
    )
    assert response.status_code == 200
    assert response.data['completed_count'] == 1
    assert response.data['total_count'] == 2
    assert response.data['completed_percent'] == 50.0
    assert response.data['badge']['name'] == 'Дослідник'
    assert response.data['blocks'] == []


def test_get_subject_progress_counts_unassigned_lessons(api_client, auth_header, topic, student, student_lesson):
    """total_count is every Lesson in the subject, not just the ones this
    student has a StudentLesson for."""
    Lesson.objects.create(
        topic=topic, order_index=2, title='Never assigned',
        lesson_type=LessonType.THEORY, grading_type='binary',
    )

    response = api_client.get(
        f'/student-lessons/subjects/{topic.subject_id}/progress', headers=auth_header(student.user)
    )
    assert response.status_code == 200
    assert response.data['completed_count'] == 0
    assert response.data['total_count'] == 2
    assert response.data['completed_percent'] == 0.0
    assert response.data['badge']['name'] == 'Новачок'


def test_get_subject_progress_includes_block_breakdown(api_client, auth_header, topic, student, student_lesson):
    from academics.models import SubjectBlock

    block1 = SubjectBlock.objects.create(subject=topic.subject, index=1, label='Semester 1')
    block2 = SubjectBlock.objects.create(subject=topic.subject, index=2, label='Semester 2')
    topic.subject_block = block1
    topic.save()

    other_topic = Topic.objects.create(subject=topic.subject, title='Decimals', order_index=2, subject_block=block2)
    Lesson.objects.create(
        topic=other_topic, order_index=1, title='Untouched',
        lesson_type=LessonType.THEORY, grading_type='binary',
    )

    response = api_client.get(
        f'/student-lessons/subjects/{topic.subject_id}/progress', headers=auth_header(student.user)
    )
    assert response.status_code == 200
    blocks_by_label = {b['label']: b for b in response.data['blocks']}
    assert blocks_by_label['Semester 1']['total_count'] == 1
    assert blocks_by_label['Semester 1']['completed_count'] == 0
    assert blocks_by_label['Semester 2']['total_count'] == 1
    assert blocks_by_label['Semester 2']['completed_count'] == 0


def test_get_subject_progress_requires_student(api_client, auth_header, topic):
    user = User.objects.create_user(email='not-a-student@example.com', role=Role.STUDENT)
    response = api_client.get(
        f'/student-lessons/subjects/{topic.subject_id}/progress', headers=auth_header(user)
    )
    assert response.status_code == 403


def test_get_topic_progress(api_client, auth_header, topic, student, student_lesson):
    response = api_client.get(
        f'/student-lessons/topics/{topic.id}/progress', headers=auth_header(student.user)
    )
    assert response.status_code == 200
    assert response.data == {'completed_count': 0, 'total_count': 1, 'completed_percent': 0.0}


def test_get_topic_progress_counts_unassigned_lessons(api_client, auth_header, topic, student, student_lesson):
    Lesson.objects.create(
        topic=topic, order_index=2, title='Never assigned',
        lesson_type=LessonType.THEORY, grading_type='binary',
    )

    response = api_client.get(
        f'/student-lessons/topics/{topic.id}/progress', headers=auth_header(student.user)
    )
    assert response.status_code == 200
    assert response.data == {'completed_count': 0, 'total_count': 2, 'completed_percent': 0.0}


def test_list_subject_lessons_includes_unassigned_lessons(
    api_client, auth_header, topic, student, other_student, student_lesson
):
    unassigned_lesson = Lesson.objects.create(
        topic=topic, order_index=2, title='Not yet assigned', task_content='Do exercises',
        lesson_type=LessonType.WITH_TASK, grading_type='binary',
    )
    # Assigned to a different student only — must still show up, but as unassigned for `student`.
    StudentLesson.objects.create(student=other_student, lesson=unassigned_lesson, scheduled_date=datetime.date.today())

    response = api_client.get(
        f'/student-lessons/subjects/{topic.subject_id}/lessons', headers=auth_header(student.user)
    )
    assert response.status_code == 200
    assert len(response.data) == 2

    assigned_row = next(row for row in response.data if row['id'] == student_lesson.lesson_id)
    assert assigned_row['student_lesson_id'] == student_lesson.id
    assert assigned_row['status'] == 'assigned'
    assert assigned_row['scheduled_date'] == str(student_lesson.scheduled_date)

    unassigned_row = next(row for row in response.data if row['id'] == unassigned_lesson.id)
    assert unassigned_row['student_lesson_id'] is None
    assert unassigned_row['status'] is None
    assert unassigned_row['task_content'] == 'Do exercises'
    assert unassigned_row['scheduled_date'] is None


def test_list_topic_lessons_paginated_and_scoped_to_own_student(
    api_client, auth_header, topic, student, other_student, student_lesson
):
    lesson2 = Lesson.objects.create(
        topic=topic, order_index=2, title='Second lesson',
        lesson_type=LessonType.THEORY, grading_type='binary',
    )
    StudentLesson.objects.create(student=student, lesson=lesson2, scheduled_date=datetime.date.today())
    # Another student's row must never leak into the response.
    StudentLesson.objects.create(student=other_student, lesson=lesson2, scheduled_date=datetime.date.today())

    response = api_client.get(
        f'/student-lessons/topics/{topic.id}/lessons?limit=1', headers=auth_header(student.user)
    )
    assert response.status_code == 200
    assert response.data['count'] == 2
    assert len(response.data['items']) == 1
    assert response.data['items'][0]['title'] == 'Understanding fractions'
    assert response.data['items'][0]['status'] == 'assigned'


def test_list_topic_lessons_includes_subject_block_label(api_client, auth_header, topic, student, student_lesson):
    from academics.models import SubjectBlock

    block = SubjectBlock.objects.create(subject=topic.subject, index=1, label='Semester 1')
    topic.subject_block = block
    topic.save()

    response = api_client.get(
        f'/student-lessons/topics/{topic.id}/lessons', headers=auth_header(student.user)
    )
    assert response.status_code == 200
    assert response.data['items'][0]['subject_block_label'] == 'Semester 1'


def test_list_topic_lessons_includes_task_content(api_client, auth_header, topic, student, student_lesson):
    student_lesson.lesson.task_content = 'Solve exercises 1-5'
    student_lesson.lesson.save(update_fields=['task_content'])

    response = api_client.get(
        f'/student-lessons/topics/{topic.id}/lessons', headers=auth_header(student.user)
    )
    assert response.status_code == 200
    assert response.data['items'][0]['task_content'] == 'Solve exercises 1-5'


def test_get_next_lesson_returns_earliest_incomplete_in_curriculum_order(
    api_client, auth_header, topic, student, student_lesson
):
    # student_lesson is topic/order_index=1 ("Understanding fractions"), still assigned.
    later_topic = Topic.objects.create(subject=topic.subject, title='Decimals', order_index=2)
    later_lesson = Lesson.objects.create(
        topic=later_topic, order_index=1, title='Decimal basics',
        lesson_type=LessonType.THEORY, grading_type='binary',
    )
    StudentLesson.objects.create(student=student, lesson=later_lesson, scheduled_date=datetime.date.today())

    response = api_client.get(
        f'/student-lessons/subjects/{topic.subject_id}/next-lesson', headers=auth_header(student.user)
    )
    assert response.status_code == 200
    assert response.data['title'] == 'Understanding fractions'
    assert response.data['topic_title'] == 'Fractions'
    assert response.data['id'] == student_lesson.id


def test_get_next_lesson_skips_completed_and_returns_next_in_order(
    api_client, auth_header, topic, student, student_lesson
):
    from lessons import services

    services.start(student_lesson, student.user)
    services.confirm_understanding(student_lesson, student.user, understood=True)  # -> completed

    lesson2 = Lesson.objects.create(
        topic=topic, order_index=2, title='Second lesson',
        lesson_type=LessonType.THEORY, grading_type='binary',
    )
    sl2 = StudentLesson.objects.create(student=student, lesson=lesson2, scheduled_date=datetime.date.today())

    response = api_client.get(
        f'/student-lessons/subjects/{topic.subject_id}/next-lesson', headers=auth_header(student.user)
    )
    assert response.status_code == 200
    assert response.data['id'] == sl2.id
    assert response.data['title'] == 'Second lesson'


def test_get_next_lesson_null_when_everything_completed(api_client, auth_header, topic, student, student_lesson):
    from lessons import services

    services.start(student_lesson, student.user)
    services.confirm_understanding(student_lesson, student.user, understood=True)

    response = api_client.get(
        f'/student-lessons/subjects/{topic.subject_id}/next-lesson', headers=auth_header(student.user)
    )
    assert response.status_code == 200
    assert response.data is None


def test_get_quiz_hint_returns_correct_choice(api_client, auth_header, topic, student):
    from lessons.models import LessonType, QuizChoice, QuizQuestion

    lesson = Lesson.objects.create(
        topic=topic, order_index=3, title='Quiz lesson',
        lesson_type=LessonType.WITH_QUIZ, grading_type='points',
    )
    StudentLesson.objects.create(student=student, lesson=lesson, scheduled_date=datetime.date.today())
    question = QuizQuestion.objects.create(lesson=lesson, prompt='2+2?')
    correct = QuizChoice.objects.create(question=question, text='4', is_correct=True)
    QuizChoice.objects.create(question=question, text='5', is_correct=False)

    response = api_client.get(
        f'/student-lessons/quiz-questions/{question.id}/hint', headers=auth_header(student.user)
    )
    assert response.status_code == 200
    assert response.data['correct_choice_id'] == correct.id


def test_get_quiz_hint_rejects_students_without_the_lesson(api_client, auth_header, topic, other_student):
    from lessons.models import LessonType, QuizChoice, QuizQuestion

    lesson = Lesson.objects.create(
        topic=topic, order_index=4, title='Quiz lesson',
        lesson_type=LessonType.WITH_QUIZ, grading_type='points',
    )
    question = QuizQuestion.objects.create(lesson=lesson, prompt='2+2?')
    QuizChoice.objects.create(question=question, text='4', is_correct=True)

    response = api_client.get(
        f'/student-lessons/quiz-questions/{question.id}/hint', headers=auth_header(other_student.user)
    )
    assert response.status_code == 403
