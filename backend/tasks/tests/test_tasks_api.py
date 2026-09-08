import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from academics.models import Class, School, Subject, Topic
from accounts.models import Role, StudentProfile, TutorProfile, User
from tasks import services
from tasks.models import Task, TaskCompletion, TaskKind, TaskSubmission
from tutoring.models import TutorSubjectAssignment

pytestmark = pytest.mark.django_db


@pytest.fixture
def school_class():
    school = School.objects.create(name='Ahead School')
    return Class.objects.create(school=school, name='5', order_index=5, academic_year='2025/2026')


@pytest.fixture
def other_class(school_class):
    return Class.objects.create(
        school=school_class.school, name='6', order_index=6, academic_year='2025/2026'
    )


@pytest.fixture
def subject(school_class):
    return Subject.objects.create(school_class=school_class, name='Math')


@pytest.fixture
def topic(subject):
    return Topic.objects.create(subject=subject, title='Fractions', order_index=1)


@pytest.fixture
def tutor():
    user = User.objects.create_user(email='tutor@example.com', role=Role.TUTOR)
    return TutorProfile.objects.create(user=user)


@pytest.fixture
def assigned_tutor(tutor, subject):
    TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
    return tutor


@pytest.fixture
def student(school_class):
    user = User.objects.create_user(email='student@example.com', role=Role.STUDENT)
    return StudentProfile.objects.create(user=user, school_class=school_class)


@pytest.fixture
def other_class_student(other_class):
    user = User.objects.create_user(email='other-class-student@example.com', role=Role.STUDENT)
    return StudentProfile.objects.create(user=user, school_class=other_class)


def _image_file(name='drawing.png'):
    return SimpleUploadedFile(name, b'\x89PNG\r\n', content_type='image/png')


class TestCreateTask:
    def test_tutor_creates_markdown_task(self, api_client, auth_header, assigned_tutor, topic):
        response = api_client.post(
            '/tasks/tasks',
            data={'topic_id': topic.id, 'title': 'Read chapter 3', 'kind': TaskKind.MARKDOWN, 'content': '# Do it'},
            headers=auth_header(assigned_tutor.user),
        )
        assert response.status_code == 200
        assert response.data['kind'] == 'markdown'
        assert response.data['content'] == '# Do it'
        assert response.data['image'] is None

    def test_tutor_creates_image_task(self, api_client, auth_header, assigned_tutor, topic):
        response = api_client.post(
            '/tasks/tasks',
            data={'topic_id': topic.id, 'title': 'Trace the shape', 'kind': TaskKind.IMAGE},
            FILES={'image': _image_file()},
            headers=auth_header(assigned_tutor.user),
        )
        assert response.status_code == 200
        assert response.data['kind'] == 'image'
        assert response.data['image'].startswith('http')

    def test_non_tutor_for_subject_is_rejected(self, api_client, auth_header, tutor, topic):
        # `tutor` has no TutorSubjectAssignment for this subject.
        response = api_client.post(
            '/tasks/tasks',
            data={'topic_id': topic.id, 'title': 'X', 'kind': TaskKind.MARKDOWN, 'content': 'x'},
            headers=auth_header(tutor.user),
        )
        assert response.status_code == 403


class TestUpdateAndDeleteTask:
    def test_tutor_updates_task(self, api_client, auth_header, assigned_tutor, topic):
        task = Task.objects.create(topic=topic, title='Old', kind=TaskKind.MARKDOWN, content='old')

        response = api_client.patch(
            f'/tasks/tasks/{task.id}',
            data={'topic_id': topic.id, 'title': 'New', 'kind': TaskKind.MARKDOWN, 'content': 'new'},
            headers=auth_header(assigned_tutor.user),
        )
        assert response.status_code == 200
        assert response.data['title'] == 'New'
        assert response.data['content'] == 'new'

    def test_non_tutor_cannot_update(self, api_client, auth_header, tutor, topic):
        task = Task.objects.create(topic=topic, title='Old', kind=TaskKind.MARKDOWN, content='old')

        response = api_client.patch(
            f'/tasks/tasks/{task.id}',
            data={'topic_id': topic.id, 'title': 'New', 'kind': TaskKind.MARKDOWN, 'content': 'new'},
            headers=auth_header(tutor.user),
        )
        assert response.status_code == 403

    def test_tutor_deletes_task(self, api_client, auth_header, assigned_tutor, topic):
        task = Task.objects.create(topic=topic, title='Old', kind=TaskKind.MARKDOWN, content='old')

        response = api_client.delete(f'/tasks/tasks/{task.id}', headers=auth_header(assigned_tutor.user))
        assert response.status_code == 204
        assert not Task.objects.filter(id=task.id).exists()

    def test_non_tutor_cannot_delete(self, api_client, auth_header, tutor, topic):
        task = Task.objects.create(topic=topic, title='Old', kind=TaskKind.MARKDOWN, content='old')

        response = api_client.delete(f'/tasks/tasks/{task.id}', headers=auth_header(tutor.user))
        assert response.status_code == 403
        assert Task.objects.filter(id=task.id).exists()


class TestListAndComplete:
    def test_student_lists_tasks_with_done_flags(self, api_client, auth_header, student, topic):
        task1 = Task.objects.create(topic=topic, title='T1', kind=TaskKind.MARKDOWN, content='a')
        Task.objects.create(topic=topic, title='T2', kind=TaskKind.MARKDOWN, content='b')
        TaskCompletion.objects.create(student=student, task=task1)

        response = api_client.get(f'/tasks/subjects/{topic.subject_id}', headers=auth_header(student.user))
        assert response.status_code == 200
        done_by_title = {t['title']: t['is_done'] for t in response.data}
        assert done_by_title == {'T1': True, 'T2': False}

    def test_student_in_different_class_is_rejected(
        self, api_client, auth_header, other_class_student, topic
    ):
        response = api_client.get(
            f'/tasks/subjects/{topic.subject_id}', headers=auth_header(other_class_student.user)
        )
        assert response.status_code == 403

    def test_tutor_for_subject_can_list_tasks(self, api_client, auth_header, assigned_tutor, topic):
        Task.objects.create(topic=topic, title='T1', kind=TaskKind.MARKDOWN, content='a')

        response = api_client.get(
            f'/tasks/subjects/{topic.subject_id}', headers=auth_header(assigned_tutor.user)
        )
        assert response.status_code == 200
        assert [t['title'] for t in response.data] == ['T1']
        # A tutor has no single student's completion state to show.
        assert response.data[0]['is_done'] is False

    def test_non_tutor_non_student_cannot_list_tasks(self, api_client, auth_header, tutor, topic):
        # `tutor` has no TutorSubjectAssignment for this subject and no
        # StudentProfile either.
        response = api_client.get(f'/tasks/subjects/{topic.subject_id}', headers=auth_header(tutor.user))
        assert response.status_code == 403

    def test_complete_then_uncomplete_toggles_is_done(self, api_client, auth_header, student, topic):
        task = Task.objects.create(topic=topic, title='T1', kind=TaskKind.MARKDOWN, content='a')

        complete_response = api_client.post(f'/tasks/tasks/{task.id}/complete', headers=auth_header(student.user))
        assert complete_response.status_code == 200
        assert complete_response.data['is_done'] is True
        assert TaskCompletion.objects.filter(student=student, task=task).exists()

        uncomplete_response = api_client.delete(
            f'/tasks/tasks/{task.id}/complete', headers=auth_header(student.user)
        )
        assert uncomplete_response.status_code == 200
        assert uncomplete_response.data['is_done'] is False
        assert not TaskCompletion.objects.filter(student=student, task=task).exists()

    def test_completing_twice_is_idempotent(self, api_client, auth_header, student, topic):
        task = Task.objects.create(topic=topic, title='T1', kind=TaskKind.MARKDOWN, content='a')

        api_client.post(f'/tasks/tasks/{task.id}/complete', headers=auth_header(student.user))
        response = api_client.post(f'/tasks/tasks/{task.id}/complete', headers=auth_header(student.user))

        assert response.status_code == 200
        assert TaskCompletion.objects.filter(student=student, task=task).count() == 1

    def test_progress_reflects_completed_subset(self, api_client, auth_header, student, topic):
        task1 = Task.objects.create(topic=topic, title='T1', kind=TaskKind.MARKDOWN, content='a')
        Task.objects.create(topic=topic, title='T2', kind=TaskKind.MARKDOWN, content='b')
        TaskCompletion.objects.create(student=student, task=task1)

        response = api_client.get(
            f'/tasks/subjects/{topic.subject_id}/progress', headers=auth_header(student.user)
        )
        assert response.status_code == 200
        assert response.data == {'completed_count': 1, 'total_count': 2, 'completed_percent': 50.0}

    def test_student_in_different_class_cannot_complete(
        self, api_client, auth_header, other_class_student, topic
    ):
        task = Task.objects.create(topic=topic, title='T1', kind=TaskKind.MARKDOWN, content='a')

        response = api_client.post(
            f'/tasks/tasks/{task.id}/complete', headers=auth_header(other_class_student.user)
        )
        assert response.status_code == 403


class TestGetTaskAndSubmission:
    def test_student_gets_task_with_no_submission(self, api_client, auth_header, student, topic):
        task = Task.objects.create(topic=topic, title='T1', kind=TaskKind.MARKDOWN, content='a')

        response = api_client.get(f'/tasks/tasks/{task.id}', headers=auth_header(student.user))
        assert response.status_code == 200
        assert response.data['is_done'] is False
        assert response.data['my_submission'] is None

    def test_tutor_gets_task_with_null_submission(self, api_client, auth_header, assigned_tutor, topic):
        task = Task.objects.create(topic=topic, title='T1', kind=TaskKind.MARKDOWN, content='a')

        response = api_client.get(f'/tasks/tasks/{task.id}', headers=auth_header(assigned_tutor.user))
        assert response.status_code == 200
        assert response.data['my_submission'] is None

    def test_non_tutor_non_student_cannot_get_task(self, api_client, auth_header, tutor, topic):
        task = Task.objects.create(topic=topic, title='T1', kind=TaskKind.MARKDOWN, content='a')

        response = api_client.get(f'/tasks/tasks/{task.id}', headers=auth_header(tutor.user))
        assert response.status_code == 403

    def test_student_submits_text_answer(self, api_client, auth_header, student, topic):
        task = Task.objects.create(topic=topic, title='T1', kind=TaskKind.MARKDOWN, content='a')

        response = api_client.post(
            f'/tasks/tasks/{task.id}/submission',
            data={'text': 'my answer'},
            headers=auth_header(student.user),
        )
        assert response.status_code == 200
        assert response.data['my_submission']['text'] == 'my answer'
        assert response.data['my_submission']['file'] is None
        assert TaskSubmission.objects.filter(student=student, task=task, text='my answer').exists()

    def test_student_submits_image_answer(self, api_client, auth_header, student, topic):
        task = Task.objects.create(topic=topic, title='T1', kind=TaskKind.MARKDOWN, content='a')

        response = api_client.post(
            f'/tasks/tasks/{task.id}/submission',
            FILES={'file': _image_file()},
            headers=auth_header(student.user),
        )
        assert response.status_code == 200
        assert response.data['my_submission']['file'].startswith('http')

    def test_resubmitting_overwrites_previous_answer(self, api_client, auth_header, student, topic):
        task = Task.objects.create(topic=topic, title='T1', kind=TaskKind.MARKDOWN, content='a')

        api_client.post(
            f'/tasks/tasks/{task.id}/submission', data={'text': 'first'}, headers=auth_header(student.user)
        )
        response = api_client.post(
            f'/tasks/tasks/{task.id}/submission', data={'text': 'second'}, headers=auth_header(student.user)
        )

        assert response.status_code == 200
        assert response.data['my_submission']['text'] == 'second'
        assert TaskSubmission.objects.filter(student=student, task=task).count() == 1

    def test_submission_is_independent_of_completion(self, api_client, auth_header, student, topic):
        task = Task.objects.create(topic=topic, title='T1', kind=TaskKind.MARKDOWN, content='a')

        response = api_client.post(
            f'/tasks/tasks/{task.id}/submission', data={'text': 'answer'}, headers=auth_header(student.user)
        )
        assert response.status_code == 200
        # Submitting an answer does not, by itself, mark the task done.
        assert response.data['is_done'] is False

    def test_submission_requires_text_or_file(self, api_client, auth_header, student, topic):
        task = Task.objects.create(topic=topic, title='T1', kind=TaskKind.MARKDOWN, content='a')

        response = api_client.post(
            f'/tasks/tasks/{task.id}/submission', data={}, headers=auth_header(student.user)
        )
        assert response.status_code == 400

    def test_student_in_different_class_cannot_submit(
        self, api_client, auth_header, other_class_student, topic
    ):
        task = Task.objects.create(topic=topic, title='T1', kind=TaskKind.MARKDOWN, content='a')

        response = api_client.post(
            f'/tasks/tasks/{task.id}/submission',
            data={'text': 'answer'},
            headers=auth_header(other_class_student.user),
        )
        assert response.status_code == 403


class TestParseTasksMarkdown:
    def test_splits_headings_into_topic_line_lists(self):
        text = (
            'Class: 8\nSubject: Matematyka\n\n'
            '## Procenty\n  str. 88, zad. 6\n  str. 87, zad. 5\n\n'
            '## Equations\nstr. 112, zad. 10\n'
        )
        sections = services.parse_tasks_markdown(text)

        assert sections == [
            ('Procenty', ['str. 88, zad. 6', 'str. 87, zad. 5']),
            ('Equations', ['str. 112, zad. 10']),
        ]

    def test_ignores_lines_before_first_heading(self):
        sections = services.parse_tasks_markdown('Class: 8\nSubject: Matematyka\n\n## Algebra\n')
        assert sections == [('Algebra', [])]

    def test_heading_with_no_lines_yields_empty_list(self):
        sections = services.parse_tasks_markdown('## Algebra\n\n## Geometria\nline 1\n')
        assert sections == [('Algebra', []), ('Geometria', ['line 1'])]

    def test_no_headings_returns_empty_list(self):
        assert services.parse_tasks_markdown('just some text\nno headings here') == []


class TestImportTasksMarkdown:
    def test_creates_topics_and_tasks(self, subject):
        sections = [('Procenty', ['str. 88, zad. 6', 'str. 87, zad. 5']), ('Algebra', [])]

        summary = services.import_tasks_markdown(subject, sections)

        assert summary.topics_created == 2
        assert summary.topics_reused == 0
        assert summary.tasks_created == 2
        assert summary.tasks_skipped == 0

        procenty = Topic.objects.get(subject=subject, title='Procenty')
        assert list(procenty.tasks.order_by('order_index').values_list('title', 'kind', 'content')) == [
            ('str. 88, zad. 6', TaskKind.MARKDOWN, 'str. 88, zad. 6'),
            ('str. 87, zad. 5', TaskKind.MARKDOWN, 'str. 87, zad. 5'),
        ]
        assert Topic.objects.get(subject=subject, title='Algebra').tasks.count() == 0

    def test_reuses_existing_topic_by_exact_title(self, subject, topic):
        summary = services.import_tasks_markdown(subject, [(topic.title, ['new line'])])

        assert summary.topics_created == 0
        assert summary.topics_reused == 1
        assert Topic.objects.filter(subject=subject).count() == 1
        assert topic.tasks.count() == 1

    def test_reupload_skips_duplicate_task_lines(self, subject):
        sections = [('Procenty', ['str. 88, zad. 6'])]
        services.import_tasks_markdown(subject, sections)

        summary = services.import_tasks_markdown(subject, sections)

        assert summary.topics_created == 0
        assert summary.topics_reused == 1
        assert summary.tasks_created == 0
        assert summary.tasks_skipped == 1
        assert Topic.objects.get(subject=subject, title='Procenty').tasks.count() == 1

    def test_new_topics_get_assigned_a_block(self, subject):
        from academics import services as academics_services

        subject.block_count = 1
        subject.save()
        academics_services.ensure_subject_blocks(subject)

        services.import_tasks_markdown(subject, [('Algebra', ['line 1'])])

        topic = Topic.objects.get(subject=subject, title='Algebra')
        assert topic.subject_block is not None


class TestImportSubjectTasksMarkdownApi:
    def _md_file(self, content: str):
        return SimpleUploadedFile('tasks.md', content.encode('utf-8'), content_type='text/markdown')

    def test_tutor_uploads_markdown_file(self, api_client, auth_header, assigned_tutor, subject):
        content = '## Procenty\nstr. 88, zad. 6\nstr. 87, zad. 5\n\n## Equations\nstr. 112, zad. 10\n'

        response = api_client.post(
            f'/tasks/subjects/{subject.id}/import-markdown',
            FILES={'file': self._md_file(content)},
            headers=auth_header(assigned_tutor.user),
        )

        assert response.status_code == 200
        assert response.data == {
            'topics_created': 2,
            'topics_reused': 0,
            'tasks_created': 3,
            'tasks_skipped': 0,
        }
        assert Task.objects.filter(topic__subject=subject).count() == 3

    def test_non_tutor_for_subject_is_rejected(self, api_client, auth_header, tutor, subject):
        response = api_client.post(
            f'/tasks/subjects/{subject.id}/import-markdown',
            FILES={'file': self._md_file('## Algebra\nline 1\n')},
            headers=auth_header(tutor.user),
        )
        assert response.status_code == 403
        assert not Task.objects.filter(topic__subject=subject).exists()
