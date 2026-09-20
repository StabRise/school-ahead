"""Subject.is_marked / SubjectGroup.is_marked — what a tutor marks to be
shown in the students' preschool bookshelf by default (the eye buttons on the
class page)."""

import importlib

import pytest
from django.apps import apps as django_apps

from academics.models import Class, School, Subject, SubjectGroup
from accounts.models import Role, StudentProfile, TutorProfile, User
from tutoring.models import TutorSubjectAssignment

pytestmark = pytest.mark.django_db


@pytest.fixture
def school_class():
    school = School.objects.create(name='Ahead School')
    return Class.objects.create(school=school, name='1', order_index=1, academic_year='2025/2026')


@pytest.fixture
def subject(school_class):
    return Subject.objects.create(school_class=school_class, name='Math')


@pytest.fixture
def group():
    SubjectGroup.objects.all().delete()
    return SubjectGroup.objects.create(name='Українська школа', order_index=1)


@pytest.fixture
def tutor():
    user = User.objects.create_user(email='tutor@example.com', role=Role.TUTOR)
    return TutorProfile.objects.create(user=user)


def _set(api_client, path, value, headers):
    return api_client.patch(path, json={'is_marked': value}, headers=headers)


def test_new_subjects_and_groups_start_unmarked(subject, group):
    assert subject.is_marked is False
    assert group.is_marked is False


def test_a_tutor_marks_and_unmarks_their_subject(api_client, auth_header, tutor, subject):
    TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
    headers = auth_header(tutor.user)

    response = _set(api_client, f'/tutor/subjects/{subject.id}/is-marked', True, headers)

    assert response.status_code == 200
    assert response.data['is_marked'] is True
    subject.refresh_from_db()
    assert subject.is_marked is True

    _set(api_client, f'/tutor/subjects/{subject.id}/is-marked', False, headers)
    subject.refresh_from_db()
    assert subject.is_marked is False


def test_a_tutor_cannot_mark_a_subject_they_do_not_teach(api_client, auth_header, tutor, subject):
    response = _set(api_client, f'/tutor/subjects/{subject.id}/is-marked', True, auth_header(tutor.user))

    assert response.status_code == 403
    subject.refresh_from_db()
    assert subject.is_marked is False


def test_a_tutor_marks_and_unmarks_a_group(api_client, auth_header, tutor, group):
    headers = auth_header(tutor.user)

    response = _set(api_client, f'/tutor/subject-groups/{group.id}/is-marked', True, headers)

    assert response.status_code == 200
    assert response.data['is_marked'] is True
    group.refresh_from_db()
    assert group.is_marked is True

    _set(api_client, f'/tutor/subject-groups/{group.id}/is-marked', False, headers)
    group.refresh_from_db()
    assert group.is_marked is False


def test_an_unknown_group_404s(api_client, auth_header, tutor):
    response = _set(api_client, '/tutor/subject-groups/999999/is-marked', True, auth_header(tutor.user))

    assert response.status_code == 404


def test_a_student_cannot_mark_anything(api_client, auth_header, school_class, subject, group):
    user = User.objects.create_user(email='student@example.com', role=Role.STUDENT)
    StudentProfile.objects.create(user=user, school_class=school_class)
    headers = auth_header(user)

    assert _set(api_client, f'/tutor/subjects/{subject.id}/is-marked', True, headers).status_code == 403
    assert _set(api_client, f'/tutor/subject-groups/{group.id}/is-marked', True, headers).status_code == 403
    subject.refresh_from_db()
    group.refresh_from_db()
    assert subject.is_marked is False and group.is_marked is False


def test_the_flag_reaches_the_client_in_every_shape_it_is_read(api_client, auth_header, tutor, subject, group):
    subject.is_marked = True
    subject.group = group
    subject.save()
    group.is_marked = True
    group.save()
    TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
    headers = auth_header(tutor.user)

    assert api_client.get('/academics/subject-groups').json()[0]['is_marked'] is True
    assert api_client.get(f'/academics/subjects/{subject.id}', headers=headers).json()['is_marked'] is True
    (assignment,) = api_client.get('/tutor/assignments', headers=headers).json()
    assert assignment['is_marked'] is True


def test_the_migration_marks_everything_that_already_exists(subject, group):
    """So the shelf's default view isn't empty the moment this is deployed."""
    migration = importlib.import_module('academics.migrations.0022_subject_and_group_is_marked')
    assert subject.is_marked is False and group.is_marked is False

    migration.mark_existing(django_apps, None)

    subject.refresh_from_db()
    group.refresh_from_db()
    assert subject.is_marked is True and group.is_marked is True
