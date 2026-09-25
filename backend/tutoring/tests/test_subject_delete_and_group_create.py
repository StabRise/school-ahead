"""DELETE /tutor/subjects/{id}, POST /tutor/subject-groups and PATCH
/tutor/subjects/{id}/group — removing a subject and adding a subject category
(the tutor's Class detail page), and changing a subject's category (its own
detail page)."""

import pytest

from academics.models import Class, School, Subject, SubjectGroup
from accounts.models import Role, TutorProfile, User
from tutoring.models import TutorSubjectAssignment

pytestmark = pytest.mark.django_db


@pytest.fixture
def class_teacher():
    user = User.objects.create_user(email='teacher@example.com', role=Role.TUTOR)
    return TutorProfile.objects.create(user=user)


@pytest.fixture
def other_tutor():
    user = User.objects.create_user(email='other@example.com', role=Role.TUTOR)
    return TutorProfile.objects.create(user=user)


@pytest.fixture
def subject(class_teacher):
    school = School.objects.create(name='Ahead School')
    school_class = Class.objects.create(
        school=school, name='1', order_index=1, academic_year='2025/2026', class_teacher=class_teacher
    )
    return Subject.objects.create(school_class=school_class, name='Math')


class TestDeleteSubject:
    def test_class_teacher_deletes_the_subject(self, api_client, auth_header, class_teacher, subject):
        response = api_client.delete(f'/tutor/subjects/{subject.id}', headers=auth_header(class_teacher.user))

        assert response.status_code == 204
        assert not Subject.objects.filter(id=subject.id).exists()

    def test_a_tutor_teaching_it_but_not_class_teacher_cannot(self, api_client, auth_header, other_tutor, subject):
        TutorSubjectAssignment.objects.create(tutor=other_tutor, subject=subject)

        response = api_client.delete(f'/tutor/subjects/{subject.id}', headers=auth_header(other_tutor.user))

        assert response.status_code == 403
        assert Subject.objects.filter(id=subject.id).exists()

    def test_404_for_unknown_subject(self, api_client, auth_header, class_teacher):
        response = api_client.delete('/tutor/subjects/999999', headers=auth_header(class_teacher.user))

        assert response.status_code == 404


class TestCreateSubjectGroup:
    def test_adds_the_group_at_the_end(self, api_client, auth_header, other_tutor):
        SubjectGroup.objects.all().delete()
        SubjectGroup.objects.create(name='A', order_index=0)
        SubjectGroup.objects.create(name='B', order_index=4)

        response = api_client.post(
            '/tutor/subject-groups', json={'name': '  Польська школа '}, headers=auth_header(other_tutor.user)
        )

        assert response.status_code == 200
        assert response.data['name'] == 'Польська школа'
        assert response.data['order_index'] == 5
        assert list(SubjectGroup.objects.values_list('name', flat=True)) == ['A', 'B', 'Польська школа']

    def test_first_group_starts_at_zero(self, api_client, auth_header, other_tutor):
        SubjectGroup.objects.all().delete()

        response = api_client.post('/tutor/subject-groups', json={'name': 'A'}, headers=auth_header(other_tutor.user))

        assert response.data['order_index'] == 0

    def test_rejects_a_blank_name(self, api_client, auth_header, other_tutor):
        response = api_client.post('/tutor/subject-groups', json={'name': '   '}, headers=auth_header(other_tutor.user))

        assert response.status_code == 422

    def test_requires_a_tutor(self, api_client, auth_header):
        student = User.objects.create_user(email='student@example.com', role=Role.STUDENT)

        response = api_client.post('/tutor/subject-groups', json={'name': 'A'}, headers=auth_header(student))

        assert response.status_code == 403


class TestSetSubjectGroup:
    def test_moves_the_subject_to_the_end_of_another_category(self, api_client, auth_header, other_tutor, subject):
        TutorSubjectAssignment.objects.create(tutor=other_tutor, subject=subject)
        Subject.objects.create(school_class=subject.school_class, name='Art', order_index=3)
        group = SubjectGroup.objects.create(name='Польська школа')

        response = api_client.patch(
            f'/tutor/subjects/{subject.id}/group', json={'group_id': group.id}, headers=auth_header(other_tutor.user)
        )

        assert response.status_code == 200
        assert response.data['group_id'] == group.id
        assert response.data['group_name'] == 'Польська школа'
        subject.refresh_from_db()
        assert subject.group_id == group.id
        assert subject.order_index == 1

    def test_null_clears_the_category(self, api_client, auth_header, other_tutor, subject):
        TutorSubjectAssignment.objects.create(tutor=other_tutor, subject=subject)
        subject.group = SubjectGroup.objects.create(name='A')
        subject.save()

        response = api_client.patch(
            f'/tutor/subjects/{subject.id}/group', json={'group_id': None}, headers=auth_header(other_tutor.user)
        )

        assert response.data['group_id'] is None
        subject.refresh_from_db()
        assert subject.group_id is None

    def test_tutor_not_teaching_it_cannot(self, api_client, auth_header, other_tutor, subject):
        group = SubjectGroup.objects.create(name='A')

        response = api_client.patch(
            f'/tutor/subjects/{subject.id}/group', json={'group_id': group.id}, headers=auth_header(other_tutor.user)
        )

        assert response.status_code == 403

    def test_404_for_unknown_group(self, api_client, auth_header, other_tutor, subject):
        TutorSubjectAssignment.objects.create(tutor=other_tutor, subject=subject)

        response = api_client.patch(
            f'/tutor/subjects/{subject.id}/group', json={'group_id': 999999}, headers=auth_header(other_tutor.user)
        )

        assert response.status_code == 404
