"""PATCH /tutor/subject-groups/reorder — drag-and-drop ordering of the global
SubjectGroups on the tutor's Class detail page."""

import pytest

from academics.models import SubjectGroup
from accounts.models import Role, TutorProfile, User

pytestmark = pytest.mark.django_db


@pytest.fixture
def groups():
    # The seed migration already creates the two real groups — start clean.
    SubjectGroup.objects.all().delete()
    return [SubjectGroup.objects.create(name=name, order_index=index) for index, name in enumerate('ABC')]


@pytest.fixture
def tutor_headers(auth_header):
    user = User.objects.create_user(email='tutor@example.com', role=Role.TUTOR)
    TutorProfile.objects.create(user=user)
    return auth_header(user)


def _order():
    return list(SubjectGroup.objects.values_list('name', flat=True))


def test_reorders_the_groups(api_client, tutor_headers, groups):
    a, b, c = groups

    response = api_client.patch(
        '/tutor/subject-groups/reorder',
        json={'items': [{'id': c.id, 'order_index': 0}, {'id': a.id, 'order_index': 1}, {'id': b.id, 'order_index': 2}]},
        headers=tutor_headers,
    )

    assert response.status_code == 200
    assert response.data == {'updated': 3}
    assert _order() == ['C', 'A', 'B']


def test_the_new_order_is_what_the_groups_list_returns(api_client, tutor_headers, groups):
    a, b, c = groups
    api_client.patch(
        '/tutor/subject-groups/reorder',
        json={'items': [{'id': b.id, 'order_index': 0}, {'id': c.id, 'order_index': 1}, {'id': a.id, 'order_index': 2}]},
        headers=tutor_headers,
    )

    response = api_client.get('/academics/subject-groups')

    assert [g['name'] for g in response.json()] == ['B', 'C', 'A']


def test_an_unknown_group_404s_and_changes_nothing(api_client, tutor_headers, groups):
    a, b, c = groups

    response = api_client.patch(
        '/tutor/subject-groups/reorder',
        json={'items': [{'id': c.id, 'order_index': 0}, {'id': 999999, 'order_index': 1}]},
        headers=tutor_headers,
    )

    assert response.status_code == 404
    assert _order() == ['A', 'B', 'C']


def test_a_student_cannot_reorder(api_client, auth_header, groups):
    student = User.objects.create_user(email='student@example.com', role=Role.STUDENT)
    a, b, c = groups

    response = api_client.patch(
        '/tutor/subject-groups/reorder',
        json={'items': [{'id': c.id, 'order_index': 0}]},
        headers=auth_header(student),
    )

    assert response.status_code == 403
    assert _order() == ['A', 'B', 'C']


def test_it_requires_signing_in(api_client, groups):
    response = api_client.patch('/tutor/subject-groups/reorder', json={'items': []})

    assert response.status_code == 401
