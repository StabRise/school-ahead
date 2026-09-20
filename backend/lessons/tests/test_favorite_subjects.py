"""FavoriteSubject — the heart on the preschool subject page, and the
bookshelf's "favourites" view that lists what it marked."""

import pytest

from academics.models import Class, School, Subject
from accounts.models import Role, StudentProfile, TutorProfile, User
from lessons.models import FavoriteSubject

pytestmark = pytest.mark.django_db


@pytest.fixture
def school():
    return School.objects.create(name='Ahead School')


@pytest.fixture
def school_class(school):
    return Class.objects.create(school=school, name='1', order_index=1, academic_year='2025/2026')


@pytest.fixture
def subjects(school_class):
    return [Subject.objects.create(school_class=school_class, name=name) for name in ('Math', 'Art')]


@pytest.fixture
def student(school_class):
    user = User.objects.create_user(email='student@example.com', role=Role.STUDENT)
    return StudentProfile.objects.create(user=user, school_class=school_class)


def _favorite(api_client, headers, subject_id, value):
    return api_client.patch(
        f'/student-lessons/subjects/{subject_id}/favorite', json={'is_favorite': value}, headers=headers
    )


def test_marking_a_subject_as_a_favourite(api_client, auth_header, student, subjects):
    math, _ = subjects
    headers = auth_header(student.user)

    response = _favorite(api_client, headers, math.id, True)

    assert response.status_code == 200
    assert response.data == {'subject_id': math.id, 'is_favorite': True}
    assert api_client.get('/student-lessons/favorite-subjects', headers=headers).json() == [math.id]


def test_marking_twice_is_the_same_as_once(api_client, auth_header, student, subjects):
    math, _ = subjects
    headers = auth_header(student.user)

    _favorite(api_client, headers, math.id, True)
    response = _favorite(api_client, headers, math.id, True)

    assert response.status_code == 200
    assert FavoriteSubject.objects.filter(student=student, subject=math).count() == 1


def test_unmarking_and_unmarking_what_was_never_marked(api_client, auth_header, student, subjects):
    math, art = subjects
    headers = auth_header(student.user)
    _favorite(api_client, headers, math.id, True)

    _favorite(api_client, headers, math.id, False)
    response = _favorite(api_client, headers, art.id, False)

    assert response.status_code == 200
    assert response.data == {'subject_id': art.id, 'is_favorite': False}
    assert api_client.get('/student-lessons/favorite-subjects', headers=headers).json() == []


def test_favourites_are_per_student(api_client, auth_header, school_class, student, subjects):
    math, _ = subjects
    other = StudentProfile.objects.create(
        user=User.objects.create_user(email='other@example.com', role=Role.STUDENT), school_class=school_class
    )
    _favorite(api_client, auth_header(student.user), math.id, True)

    assert api_client.get('/student-lessons/favorite-subjects', headers=auth_header(other.user)).json() == []


def test_a_subject_of_another_class_404s(api_client, auth_header, school, student):
    other_class = Class.objects.create(school=school, name='2', order_index=2, academic_year='2025/2026')
    foreign = Subject.objects.create(school_class=other_class, name='Physics')

    response = _favorite(api_client, auth_header(student.user), foreign.id, True)

    assert response.status_code == 404
    assert not FavoriteSubject.objects.exists()


def test_a_tutor_has_no_favourites(api_client, auth_header, subjects):
    tutor = TutorProfile.objects.create(user=User.objects.create_user(email='tutor@example.com', role=Role.TUTOR))
    headers = auth_header(tutor.user)

    assert _favorite(api_client, headers, subjects[0].id, True).status_code == 403
    assert api_client.get('/student-lessons/favorite-subjects', headers=headers).status_code == 403


def test_it_requires_signing_in(api_client, subjects):
    assert api_client.get('/student-lessons/favorite-subjects').status_code == 401
    response = api_client.patch(f'/student-lessons/subjects/{subjects[0].id}/favorite', json={'is_favorite': True})
    assert response.status_code == 401
