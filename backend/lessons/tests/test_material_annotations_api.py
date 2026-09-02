import datetime

import pytest
from academics.models import Class, School, Subject, Topic
from accounts.models import Role, StudentProfile, User

from lessons.models import Lesson, LessonType, StudentLesson, StudentLessonMaterial

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
def material(topic, student):
    lesson = Lesson.objects.create(
        topic=topic, order_index=1, title='Understanding fractions',
        lesson_type=LessonType.THEORY, grading_type='binary',
    )
    student_lesson = StudentLesson.objects.create(
        student=student, lesson=lesson, scheduled_date=datetime.date.today()
    )
    return StudentLessonMaterial.objects.create(
        student_lesson=student_lesson,
        title='Sample',
        content=[{'kind': 'paragraph', 'sentences': ['Hello.', 'World.']}],
        language='en',
    )


def test_add_and_list_shape_annotation(api_client, auth_header, student, material):
    headers = auth_header(student.user)

    post_response = api_client.post(
        f'/student-lessons/materials/{material.id}/annotations',
        json={'kind': 'rectangle', 'color': '#ff0000', 'geometry': {'x': 0.1, 'y': 0.2, 'width': 0.3, 'height': 0.1}},
        headers=headers,
    )
    assert post_response.status_code == 200
    assert post_response.data['kind'] == 'rectangle'
    assert post_response.data['color'] == '#ff0000'
    assert post_response.data['geometry'] == {'x': 0.1, 'y': 0.2, 'width': 0.3, 'height': 0.1}
    assert post_response.data['sentence_start'] is None

    list_response = api_client.get(f'/student-lessons/materials/{material.id}/annotations', headers=headers)
    assert list_response.status_code == 200
    assert len(list_response.data) == 1


def test_add_highlight_and_comment_annotations(api_client, auth_header, student, material):
    headers = auth_header(student.user)

    highlight_response = api_client.post(
        f'/student-lessons/materials/{material.id}/annotations',
        json={'kind': 'highlight', 'sentence_start': 0, 'sentence_end': 1},
        headers=headers,
    )
    assert highlight_response.status_code == 200
    assert highlight_response.data['sentence_start'] == 0
    assert highlight_response.data['sentence_end'] == 1

    comment_response = api_client.post(
        f'/student-lessons/materials/{material.id}/annotations',
        json={'kind': 'comment', 'sentence_start': 1, 'sentence_end': 1, 'body': 'Why is this true?'},
        headers=headers,
    )
    assert comment_response.status_code == 200
    assert comment_response.data['body'] == 'Why is this true?'

    list_response = api_client.get(f'/student-lessons/materials/{material.id}/annotations', headers=headers)
    assert len(list_response.data) == 2


def test_delete_annotation(api_client, auth_header, student, material):
    headers = auth_header(student.user)
    post_response = api_client.post(
        f'/student-lessons/materials/{material.id}/annotations',
        json={'kind': 'freehand', 'geometry': {'points': [{'x': 0.1, 'y': 0.1}, {'x': 0.2, 'y': 0.2}]}},
        headers=headers,
    )
    annotation_id = post_response.data['id']

    delete_response = api_client.delete(
        f'/student-lessons/materials/{material.id}/annotations/{annotation_id}', headers=headers
    )
    assert delete_response.status_code == 204

    list_response = api_client.get(f'/student-lessons/materials/{material.id}/annotations', headers=headers)
    assert list_response.data == []


def test_annotations_scoped_to_owner(api_client, auth_header, other_student, material):
    headers = auth_header(other_student.user)

    post_response = api_client.post(
        f'/student-lessons/materials/{material.id}/annotations',
        json={'kind': 'highlight', 'sentence_start': 0, 'sentence_end': 0},
        headers=headers,
    )
    assert post_response.status_code == 403

    list_response = api_client.get(f'/student-lessons/materials/{material.id}/annotations', headers=headers)
    assert list_response.status_code == 403


@pytest.fixture
def rich_material(topic, student):
    """4 blocks: a heading (sentence index 0), a 3-sentence paragraph
    (indices 1-3), an unindexed image, and a 1-sentence paragraph (index 4)
    — enough shape to exercise cross-block deletion and an empty block being
    dropped entirely."""
    lesson = Lesson.objects.create(
        topic=topic, order_index=2, title='Rich lesson',
        lesson_type=LessonType.THEORY, grading_type='binary',
    )
    student_lesson = StudentLesson.objects.create(
        student=student, lesson=lesson, scheduled_date=datetime.date.today()
    )
    return StudentLessonMaterial.objects.create(
        student_lesson=student_lesson,
        title='Rich',
        content=[
            {'kind': 'heading', 'sentences': ['Title']},
            {'kind': 'paragraph', 'sentences': ['S1', 'S2', 'S3']},
            {'kind': 'image', 'src': 'https://example.com/img.png', 'alt': 'img'},
            {'kind': 'paragraph', 'sentences': ['S4']},
        ],
        language='en',
    )


def test_delete_sentences_removes_from_content_and_drops_empty_block(api_client, auth_header, student, rich_material):
    headers = auth_header(student.user)

    response = api_client.post(
        f'/student-lessons/materials/{rich_material.id}/delete-sentences',
        json={'sentence_indices': [2, 4]},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.data['content'] == [
        {'kind': 'heading', 'sentences': ['Title'], 'src': None, 'alt': None},
        {'kind': 'paragraph', 'sentences': ['S1', 'S3'], 'src': None, 'alt': None},
        {'kind': 'image', 'sentences': None, 'src': 'https://example.com/img.png', 'alt': 'img'},
    ]


def test_delete_sentences_remaps_overlapping_annotation(api_client, auth_header, student, rich_material):
    headers = auth_header(student.user)
    highlight = api_client.post(
        f'/student-lessons/materials/{rich_material.id}/annotations',
        json={'kind': 'highlight', 'sentence_start': 1, 'sentence_end': 3},
        headers=headers,
    ).data

    api_client.post(
        f'/student-lessons/materials/{rich_material.id}/delete-sentences',
        json={'sentence_indices': [2]},
        headers=headers,
    )

    list_response = api_client.get(f'/student-lessons/materials/{rich_material.id}/annotations', headers=headers)
    [remapped] = [a for a in list_response.data if a['id'] == highlight['id']]
    # Old range [1,3] = S1,S2,S3; S2 (index 2) deleted; S1/S3 shift to 1/2.
    assert remapped['sentence_start'] == 1
    assert remapped['sentence_end'] == 2


def test_delete_sentences_drops_annotation_entirely_within_deleted_range(api_client, auth_header, student, rich_material):
    headers = auth_header(student.user)
    comment = api_client.post(
        f'/student-lessons/materials/{rich_material.id}/annotations',
        json={'kind': 'comment', 'sentence_start': 2, 'sentence_end': 2, 'body': 'about S2'},
        headers=headers,
    ).data

    api_client.post(
        f'/student-lessons/materials/{rich_material.id}/delete-sentences',
        json={'sentence_indices': [2]},
        headers=headers,
    )

    list_response = api_client.get(f'/student-lessons/materials/{rich_material.id}/annotations', headers=headers)
    assert comment['id'] not in [a['id'] for a in list_response.data]


def test_delete_sentences_scoped_to_owner(api_client, auth_header, other_student, rich_material):
    response = api_client.post(
        f'/student-lessons/materials/{rich_material.id}/delete-sentences',
        json={'sentence_indices': [0]},
        headers=auth_header(other_student.user),
    )
    assert response.status_code == 403
