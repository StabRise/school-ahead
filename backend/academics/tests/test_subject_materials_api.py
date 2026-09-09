import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from academics.models import Class, School, Subject, SubjectMaterial
from accounts.models import Role, TutorProfile, User
from tutoring.models import TutorSubjectAssignment

pytestmark = pytest.mark.django_db


@pytest.fixture
def school_class():
    school = School.objects.create(name='Ahead School')
    return Class.objects.create(school=school, name='5', order_index=5, academic_year='2025/2026')


@pytest.fixture
def subject(school_class):
    return Subject.objects.create(school_class=school_class, name='Math')


@pytest.fixture
def tutor():
    user = User.objects.create_user(email='tutor@example.com', role=Role.TUTOR)
    return TutorProfile.objects.create(user=user)


@pytest.fixture
def assigned_tutor(tutor, subject):
    TutorSubjectAssignment.objects.create(tutor=tutor, subject=subject)
    return tutor


def _pdf_file(name='handout.pdf'):
    return SimpleUploadedFile(name, b'%PDF-1.4\n%fake pdf content', content_type='application/pdf')


class TestListSubjectMaterials:
    def test_lists_materials_in_order(self, api_client, auth_header, assigned_tutor, subject):
        SubjectMaterial.objects.create(subject=subject, title='Second', order_index=1)
        SubjectMaterial.objects.create(subject=subject, title='First', order_index=0)

        response = api_client.get(
            f'/academics/subjects/{subject.id}/materials', headers=auth_header(assigned_tutor.user)
        )
        assert response.status_code == 200
        assert [m['title'] for m in response.data] == ['First', 'Second']


class TestAddSubjectMaterial:
    def test_tutor_uploads_pdf_material(self, api_client, auth_header, assigned_tutor, subject):
        response = api_client.post(
            f'/academics/subjects/{subject.id}/materials',
            data={'title': 'Chapter 1'},
            FILES={'file': _pdf_file()},
            headers=auth_header(assigned_tutor.user),
        )
        assert response.status_code == 200
        assert response.data['title'] == 'Chapter 1'
        assert response.data['file'].startswith('http')
        assert response.data['file'].endswith('.pdf')

    def test_rejects_non_pdf_file(self, api_client, auth_header, assigned_tutor, subject):
        response = api_client.post(
            f'/academics/subjects/{subject.id}/materials',
            data={'title': 'Not a PDF'},
            FILES={'file': SimpleUploadedFile('notes.txt', b'hello', content_type='text/plain')},
            headers=auth_header(assigned_tutor.user),
        )
        assert response.status_code == 400

    def test_non_tutor_for_subject_is_rejected(self, api_client, auth_header, tutor, subject):
        # `tutor` has no TutorSubjectAssignment for this subject.
        response = api_client.post(
            f'/academics/subjects/{subject.id}/materials',
            data={'title': 'Chapter 1'},
            FILES={'file': _pdf_file()},
            headers=auth_header(tutor.user),
        )
        assert response.status_code == 403


class TestDeleteSubjectMaterial:
    def test_tutor_deletes_material(self, api_client, auth_header, assigned_tutor, subject):
        material = SubjectMaterial.objects.create(subject=subject, title='Old handout')

        response = api_client.delete(
            f'/academics/materials/{material.id}', headers=auth_header(assigned_tutor.user)
        )
        assert response.status_code == 204
        assert not SubjectMaterial.objects.filter(id=material.id).exists()

    def test_non_tutor_for_subject_is_rejected(self, api_client, auth_header, tutor, subject):
        material = SubjectMaterial.objects.create(subject=subject, title='Old handout')

        response = api_client.delete(f'/academics/materials/{material.id}', headers=auth_header(tutor.user))
        assert response.status_code == 403
        assert SubjectMaterial.objects.filter(id=material.id).exists()
