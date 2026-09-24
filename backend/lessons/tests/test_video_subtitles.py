import datetime
from types import SimpleNamespace

import pytest
from youtube_transcript_api import (
    FetchedTranscript,
    FetchedTranscriptSnippet,
    NoTranscriptFound,
    RequestBlocked,
    TranscriptsDisabled,
)

from academics.models import Class, School, Subject, Topic
from accounts.models import Role, StudentProfile, TutorProfile, User
from lessons import video_subtitles
from lessons.models import Lesson, LessonType, StudentLesson, YoutubeVideo
from tutoring.models import TutorSubjectAssignment

pytestmark = pytest.mark.django_db

VIDEO_A = 'aaaaaaaaaaa'
VIDEO_B = 'bbbbbbbbbbb'


@pytest.fixture
def subject():
    school = School.objects.create(name='Ahead School')
    school_class = Class.objects.create(school=school, name='5', order_index=5, academic_year='2025/2026')
    return Subject.objects.create(school_class=school_class, name='English')


@pytest.fixture
def tutor(subject):
    user = User.objects.create_user(email='tutor@example.com', role=Role.TUTOR)
    tutor = TutorProfile.objects.create(user=user)
    TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
    return tutor


def _lesson(subject, content, task_content=''):
    topic = Topic.objects.create(subject=subject, title='T', order_index=1)
    return Lesson.objects.create(
        topic=topic, order_index=1, title='L', lesson_type=LessonType.THEORY, grading_type='binary',
        content=content, task_content=task_content,
    )


def _track(language_code, is_generated, snippets=()):
    fetched = FetchedTranscript(
        snippets=[FetchedTranscriptSnippet(text=text, start=start, duration=1.0) for text, start in snippets],
        video_id=VIDEO_A,
        language='',
        language_code=language_code,
        is_generated=is_generated,
    )
    return SimpleNamespace(language_code=language_code, is_generated=is_generated, fetch=lambda: fetched)


class _FakeTranscriptList(list):
    def _find(self, codes, generated):
        for track in self:
            if track.language_code in codes and track.is_generated == generated:
                return track
        raise NoTranscriptFound('', codes, None)

    def find_generated_transcript(self, codes):
        return self._find(codes, True)

    def find_manually_created_transcript(self, codes):
        return self._find(codes, False)


class _FakeApi:
    tracks: dict = {}

    def list(self, video_id):
        tracks = self.tracks[video_id]
        if isinstance(tracks, Exception):
            raise tracks
        return _FakeTranscriptList(tracks)


@pytest.fixture
def fake_youtube(monkeypatch):
    _FakeApi.tracks = {}
    monkeypatch.setattr(video_subtitles, 'YouTubeTranscriptApi', _FakeApi)
    monkeypatch.setattr(video_subtitles, '_fetch_title', lambda video_id: f'Title {video_id}')
    return _FakeApi.tracks


def test_lesson_video_ids_dedupes_across_content_and_task(subject):
    lesson = _lesson(
        subject,
        f'[Watch](https://www.youtube.com/watch?v={VIDEO_A})\n\nhttps://youtu.be/{VIDEO_B}',
        f'Again: https://www.youtube.com/embed/{VIDEO_A}',
    )
    assert video_subtitles.lesson_video_ids(lesson) == [VIDEO_A, VIDEO_B]


def test_original_language_prefers_manual_track(fake_youtube):
    fake_youtube[VIDEO_A] = [
        _track('de', False, [('Hallo', 0)]),
        _track('en', False, [('Hello', 0), ('world', 1), ('Next paragraph', 10)]),
        _track('en', True, [('hello auto', 0)]),
    ]

    result = video_subtitles.video_subtitles(VIDEO_A)

    assert result['status'] == 'ok'
    assert result['original_language'] == 'en'
    assert result['languages'] == ['en', 'de']
    assert result['text'] == 'Hello world\n\nNext paragraph'
    assert result['source'] == 'youtube'


def test_picked_language_is_shown_and_cached(fake_youtube):
    fake_youtube[VIDEO_A] = [_track('de', False, [('Hallo', 0)]), _track('en', True, [('hello', 0)])]
    video = video_subtitles.load_video(VIDEO_A)

    video_subtitles.select_language(video, 'de')
    fake_youtube[VIDEO_A] = RequestBlocked(VIDEO_A)
    video_subtitles.video_subtitles(VIDEO_A)  # first fetch fails: nothing cached
    fake_youtube[VIDEO_A] = [_track('de', False, [('Hallo', 0)]), _track('en', True, [('hello', 0)])]
    first = video_subtitles.video_subtitles(VIDEO_A)
    fake_youtube[VIDEO_A] = RequestBlocked(VIDEO_A)
    second = video_subtitles.video_subtitles(VIDEO_A)

    assert first['text'] == second['text'] == 'Hallo'
    assert second['language_code'] == 'de'


def test_without_generated_track_defaults_to_first_track(fake_youtube):
    # Only hand-written tracks — the spoken language is unknown.
    fake_youtube[VIDEO_A] = [_track('en', False, [('Green, green', 0)]), _track('es', False, [('Verde', 0)])]

    result = video_subtitles.video_subtitles(VIDEO_A)

    assert result['original_language'] == ''
    assert result['languages'] == ['en', 'es']
    assert result['language_code'] == 'en'
    assert result['text'] == 'Green, green'

    video_subtitles.select_language(YoutubeVideo.objects.get(video_id=VIDEO_A), 'es')
    assert video_subtitles.video_subtitles(VIDEO_A)['text'] == 'Verde'


def test_regional_track_matches_original_language(fake_youtube):
    fake_youtube[VIDEO_A] = [_track('es-419', False, [('Hola', 0)]), _track('es', True, [('hola auto', 0)])]

    result = video_subtitles.video_subtitles(VIDEO_A)

    assert result['languages'] == ['es']
    assert result['language_code'] == 'es'
    assert result['text'] == 'Hola'


def test_no_subtitles_at_all(fake_youtube):
    fake_youtube[VIDEO_A] = TranscriptsDisabled(VIDEO_A)

    result = video_subtitles.video_subtitles(VIDEO_A)

    assert result['status'] == 'unavailable'
    assert result['languages'] == []


def test_youtube_unreachable_caches_nothing(fake_youtube):
    fake_youtube[VIDEO_A] = RequestBlocked(VIDEO_A)

    assert video_subtitles.video_subtitles(VIDEO_A)['status'] == 'error'
    assert not YoutubeVideo.objects.exists()


def test_endpoint_lists_videos_in_order(api_client, auth_header, fake_youtube, tutor, subject):
    fake_youtube[VIDEO_A] = [_track('en', True, [('hello', 0)])]
    fake_youtube[VIDEO_B] = [_track('uk', True, [('привіт', 0)])]
    lesson = _lesson(subject, f'https://youtu.be/{VIDEO_A}\n\nhttps://youtu.be/{VIDEO_B}')

    response = api_client.get(f'/tutor/lessons/{lesson.id}/video-subtitles', headers=auth_header(tutor.user))

    assert response.status_code == 200
    assert [(v['video_id'], v['text'], v['status']) for v in response.data] == [
        (VIDEO_A, 'hello', 'ok'),
        (VIDEO_B, 'привіт', 'ok'),
    ]


def test_select_language_endpoint(api_client, auth_header, fake_youtube, tutor, subject):
    fake_youtube[VIDEO_A] = [_track('en', True, [('hello', 0)]), _track('de', False, [('Hallo', 0)])]
    lesson = _lesson(subject, f'https://youtu.be/{VIDEO_A}')
    url = f'/tutor/lessons/{lesson.id}/video-subtitles/{VIDEO_A}/language'

    response = api_client.put(url, json={'language_code': 'de'}, headers=auth_header(tutor.user))
    assert response.status_code == 200
    assert response.data['text'] == 'Hallo'

    response = api_client.put(url, json={'language_code': 'fr'}, headers=auth_header(tutor.user))
    assert response.status_code == 400

    other_url = f'/tutor/lessons/{lesson.id}/video-subtitles/{VIDEO_B}/language'
    response = api_client.put(other_url, json={'language_code': ''}, headers=auth_header(tutor.user))
    assert response.status_code == 404


def test_endpoint_rejects_tutor_of_other_subject(api_client, auth_header, subject):
    user = User.objects.create_user(email='other@example.com', role=Role.TUTOR)
    TutorProfile.objects.create(user=user)
    lesson = _lesson(subject, f'https://youtu.be/{VIDEO_A}')

    response = api_client.get(f'/tutor/lessons/{lesson.id}/video-subtitles', headers=auth_header(user))

    assert response.status_code == 403


def _student_lesson(subject, lesson, email='student@example.com'):
    user = User.objects.create_user(email=email, role=Role.STUDENT)
    student = StudentProfile.objects.create(user=user, school_class=subject.school_class)
    return StudentLesson.objects.create(student=student, lesson=lesson, scheduled_date=datetime.date.today())


def test_student_sees_tutors_pick_and_can_view_another_language_unsaved(
    api_client, auth_header, fake_youtube, subject
):
    fake_youtube[VIDEO_A] = [_track('en', True, [('hello', 0)]), _track('de', False, [('Hallo', 0)])]
    lesson = _lesson(subject, f'https://youtu.be/{VIDEO_A}')
    student_lesson = _student_lesson(subject, lesson)
    video_subtitles.select_language(video_subtitles.load_video(VIDEO_A), 'de')
    headers = auth_header(student_lesson.student.user)

    response = api_client.get(f'/student-lessons/{student_lesson.id}/video-subtitles', headers=headers)
    assert response.status_code == 200
    assert response.data[0]['text'] == 'Hallo'

    response = api_client.get(
        f'/student-lessons/{student_lesson.id}/video-subtitles/{VIDEO_A}?language=en', headers=headers
    )
    assert response.status_code == 200
    assert response.data['text'] == 'hello'
    assert YoutubeVideo.objects.get(video_id=VIDEO_A).selected_language == 'de'

    response = api_client.get(
        f'/student-lessons/{student_lesson.id}/video-subtitles/{VIDEO_A}?language=fr', headers=headers
    )
    assert response.status_code == 400


def test_student_cannot_read_another_students_lesson(api_client, auth_header, fake_youtube, subject):
    lesson = _lesson(subject, f'https://youtu.be/{VIDEO_A}')
    student_lesson = _student_lesson(subject, lesson)
    other = _student_lesson(subject, lesson, email='other-student@example.com')

    response = api_client.get(
        f'/student-lessons/{student_lesson.id}/video-subtitles', headers=auth_header(other.student.user)
    )

    assert response.status_code in (403, 404)
