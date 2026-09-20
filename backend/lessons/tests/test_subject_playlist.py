"""The preschool subject page's ▶ player queue: one track per lesson of the open
topic that has a YouTube link, in lesson order, whatever the student's filter or
progress."""

import datetime

import pytest

from academics.models import Class, School, Subject, Topic
from accounts.models import Role, StudentProfile, User
from lessons import services
from lessons.models import Lesson, LessonType, StudentLesson, StudentLessonStatus

pytestmark = pytest.mark.django_db


def _watch(video_id):
    return f'https://www.youtube.com/watch?v={video_id}'


@pytest.fixture
def school_class():
    school = School.objects.create(name='Ahead School')
    return Class.objects.create(school=school, name='1', order_index=1, academic_year='2025/2026', is_public=True)


@pytest.fixture
def subject(school_class):
    return Subject.objects.create(school_class=school_class, name='Songs')


@pytest.fixture
def topics(subject):
    return [Topic.objects.create(subject=subject, title=f'Topic {n}', order_index=n) for n in (1, 2)]


def _lesson(topic, order_index, content, title=None):
    return Lesson.objects.create(
        topic=topic,
        order_index=order_index,
        title=title or f'Song {order_index}',
        content=content,
        lesson_type=LessonType.THEORY,
        grading_type='binary',
    )


@pytest.fixture
def student(school_class):
    user = User.objects.create_user(email='student@example.com', role=Role.STUDENT)
    return StudentProfile.objects.create(user=user, school_class=school_class)


@pytest.fixture
def headers(auth_header, student):
    return auth_header(student.user)


def _playlist(api_client, headers, subject, topic):
    return api_client.get(f'/student-lessons/subjects/{subject.id}/playlist?topic_id={topic.id}', headers=headers)


def test_tracks_are_in_lesson_order(api_client, headers, subject, topics):
    second = _lesson(topics[0], 2, _watch('aaaaaaaaaa2'))
    third = _lesson(topics[0], 3, _watch('aaaaaaaaaa3'))
    first = _lesson(topics[0], 1, _watch('aaaaaaaaaa1'))

    response = _playlist(api_client, headers, subject, topics[0])

    assert response.status_code == 200
    assert [t['lesson_id'] for t in response.json()] == [first.id, second.id, third.id]


def test_only_the_open_topics_songs(api_client, headers, subject, topics):
    a, b = topics
    in_a = _lesson(a, 1, _watch('aaaaaaaaaa1'))
    in_b = _lesson(b, 1, _watch('bbbbbbbbbb1'))

    assert [t['lesson_id'] for t in _playlist(api_client, headers, subject, a).json()] == [in_a.id]
    assert [t['lesson_id'] for t in _playlist(api_client, headers, subject, b).json()] == [in_b.id]


def test_a_track_is_the_lessons_title_and_video(api_client, headers, subject, topics):
    _lesson(topics[0], 1, _watch('tVlcKp3bWH8'), title='**Hello Song** — вчимося вітатися')

    (track,) = _playlist(api_client, headers, subject, topics[0]).json()

    assert track['title'] == '**Hello Song** — вчимося вітатися'
    assert track['video_id'] == 'tVlcKp3bWH8'


def test_lessons_without_a_video_are_left_out(api_client, headers, subject, topics):
    with_video = _lesson(topics[0], 1, _watch('aaaaaaaaaa1'))
    _lesson(topics[0], 2, 'Just some text about youtube channels, no link.')
    _lesson(topics[0], 3, '')

    tracks = _playlist(api_client, headers, subject, topics[0]).json()

    assert [t['lesson_id'] for t in tracks] == [with_video.id]


def test_the_first_link_is_used_when_a_lesson_has_several(api_client, headers, subject, topics):
    _lesson(topics[0], 1, f'{_watch("firstfirst1")}\n\n{_watch("secondsecon")}\n\n## Words')

    (track,) = _playlist(api_client, headers, subject, topics[0]).json()

    assert track['video_id'] == 'firstfirst1'


def test_a_markdown_link_and_short_urls_count(api_client, headers, subject, topics):
    _lesson(topics[0], 1, '[Listen](https://youtu.be/shortlink11)')
    _lesson(topics[0], 2, 'https://www.youtube.com/embed/embeddedid1')

    tracks = _playlist(api_client, headers, subject, topics[0]).json()

    assert [t['video_id'] for t in tracks] == ['shortlink11', 'embeddedid1']


def test_finished_and_unassigned_songs_still_play(api_client, headers, student, subject, topics):
    done = _lesson(topics[0], 1, _watch('aaaaaaaaaa1'))
    unassigned = _lesson(topics[0], 2, _watch('aaaaaaaaaa2'))
    StudentLesson.objects.create(
        student=student, lesson=done, scheduled_date=datetime.date.today(), status=StudentLessonStatus.COMPLETED
    )

    tracks = _playlist(api_client, headers, subject, topics[0]).json()

    assert [t['lesson_id'] for t in tracks] == [done.id, unassigned.id]


def test_a_track_carries_the_students_own_state(api_client, headers, student, subject, topics):
    done = _lesson(topics[0], 1, _watch('aaaaaaaaaa1'))
    loved = _lesson(topics[0], 2, _watch('aaaaaaaaaa2'))
    untouched = _lesson(topics[0], 3, _watch('aaaaaaaaaa3'))
    done_row = StudentLesson.objects.create(
        student=student, lesson=done, scheduled_date=datetime.date.today(), status=StudentLessonStatus.COMPLETED
    )
    loved_row = StudentLesson.objects.create(
        student=student, lesson=loved, scheduled_date=datetime.date.today(), is_favorite=True
    )
    # Another student's rows for the same lessons are nobody's business here.
    other = StudentProfile.objects.create(
        user=User.objects.create_user(email='other@example.com', role=Role.STUDENT),
        school_class=student.school_class,
    )
    StudentLesson.objects.create(
        student=other, lesson=untouched, scheduled_date=datetime.date.today(), is_favorite=True
    )

    by_lesson = {t['lesson_id']: t for t in _playlist(api_client, headers, subject, topics[0]).json()}

    assert by_lesson[done.id]['student_lesson_id'] == done_row.id
    assert by_lesson[done.id]['status'] == 'completed'
    assert by_lesson[done.id]['is_favorite'] is False
    assert by_lesson[loved.id]['student_lesson_id'] == loved_row.id
    assert by_lesson[loved.id]['status'] == 'assigned'
    assert by_lesson[loved.id]['is_favorite'] is True
    assert by_lesson[untouched.id]['student_lesson_id'] is None
    assert by_lesson[untouched.id]['status'] is None
    assert by_lesson[untouched.id]['is_favorite'] is False


def test_a_track_says_what_kind_of_lesson_it_is(api_client, headers, subject, topics):
    _lesson(topics[0], 1, _watch('aaaaaaaaaa1'))
    quiz = _lesson(topics[0], 2, _watch('aaaaaaaaaa2'))
    Lesson.objects.filter(id=quiz.id).update(lesson_type=LessonType.WITH_QUIZ)

    tracks = _playlist(api_client, headers, subject, topics[0]).json()

    assert [t['lesson_type'] for t in tracks] == ['theory', 'with_quiz']


def test_a_topic_of_another_subject_has_no_songs_here(api_client, headers, school_class, subject, topics):
    _lesson(topics[0], 1, _watch('aaaaaaaaaa1'))
    other_subject = Subject.objects.create(school_class=school_class, name='Other')
    other_topic = Topic.objects.create(subject=other_subject, title='T', order_index=1)
    _lesson(other_topic, 1, _watch('zzzzzzzzzz1'))

    # Asked under the wrong subject, the other subject's topic gives nothing.
    assert _playlist(api_client, headers, subject, other_topic).json() == []


def test_the_queue_is_capped(subject, topics, monkeypatch):
    monkeypatch.setattr(services, 'PLAYLIST_MAX_TRACKS', 3)
    for index in range(1, 8):
        _lesson(topics[0], index, _watch(f'video{index:06d}'))

    assert len(services.topic_playlist(subject.id, topics[0].id)) == 3


def test_the_work_does_not_grow_with_the_subject(api_client, headers, subject, topics, django_assert_max_num_queries):
    for index in range(1, 60):
        _lesson(topics[0], index, _watch(f'video{index:06d}'))

    with django_assert_max_num_queries(6):
        response = _playlist(api_client, headers, subject, topics[0])
    assert len(response.json()) == 59


def test_it_is_for_students(api_client, auth_header, subject, topics):
    tutor = User.objects.create_user(email='tutor@example.com', role=Role.TUTOR)

    url = f'/student-lessons/subjects/{subject.id}/playlist?topic_id={topics[0].id}'

    assert api_client.get(url, headers=auth_header(tutor)).status_code == 403
    assert api_client.get(url).status_code == 401


# --- the same, for a visitor who isn't signed in --------------------------------


def test_a_visitor_gets_the_playlist_of_a_public_class(api_client, subject, topics):
    first = _lesson(topics[0], 1, _watch('aaaaaaaaaa1'))
    second = _lesson(topics[0], 2, _watch('aaaaaaaaaa2'))
    _lesson(topics[1], 1, _watch('bbbbbbbbbb1'))

    response = api_client.get(f'/public/subjects/{subject.id}/playlist?topic_id={topics[0].id}')

    assert response.status_code == 200
    assert [t['lesson_id'] for t in response.json()] == [first.id, second.id]
    # No student, so nothing of one's own on a track.
    assert {t['student_lesson_id'] for t in response.json()} == {None}
    assert {t['is_favorite'] for t in response.json()} == {False}


def test_a_visitor_gets_404_for_a_private_class(api_client, school_class, subject, topics):
    _lesson(topics[0], 1, _watch('aaaaaaaaaa1'))
    Class.objects.filter(id=school_class.id).update(is_public=False)

    assert api_client.get(f'/public/subjects/{subject.id}/playlist?topic_id={topics[0].id}').status_code == 404
