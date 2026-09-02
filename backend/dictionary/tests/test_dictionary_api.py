import pytest

from accounts.models import Role, StudentProfile, User
from dictionary.models import DictionaryItem, DictionaryItemStatus

pytestmark = pytest.mark.django_db


@pytest.fixture
def student():
    user = User.objects.create_user(email='student@example.com', role=Role.STUDENT)
    return StudentProfile.objects.create(user=user)


@pytest.fixture
def other_student():
    user = User.objects.create_user(email='other-student@example.com', role=Role.STUDENT)
    return StudentProfile.objects.create(user=user)


def test_add_dictionary_item_persists_and_returns_it(api_client, auth_header, student):
    response = api_client.post(
        '/dictionary',
        json={
            'text': 'mitochondria',
            'lang': 'en',
            'translation': 'мітохондрія',
            'sample': 'The mitochondria is the powerhouse of the cell.',
            'sample_translation': 'Мітохондрія — це енергетична станція клітини.',
        },
        headers=auth_header(student.user),
    )

    assert response.status_code == 200
    assert response.data['text'] == 'mitochondria'
    assert response.data['lang'] == 'en'
    assert response.data['translation'] == 'мітохондрія'
    assert response.data['status'] == DictionaryItemStatus.NEW
    item = DictionaryItem.objects.get()
    assert item.student_id == student.id


def test_add_dictionary_item_rejects_more_than_five_words(api_client, auth_header, student):
    response = api_client.post(
        '/dictionary',
        json={
            'text': 'one two three four five six',
            'lang': 'en',
            'translation': 'переклад',
            'sample': 'Some full sentence.',
            'sample_translation': 'Якесь речення.',
        },
        headers=auth_header(student.user),
    )

    assert response.status_code == 400
    assert DictionaryItem.objects.count() == 0


def test_add_dictionary_item_rejects_invalid_lang(api_client, auth_header, student):
    response = api_client.post(
        '/dictionary',
        json={
            'text': 'word',
            'lang': 'fr',
            'translation': 'слово',
            'sample': 'A sentence.',
            'sample_translation': 'Речення.',
        },
        headers=auth_header(student.user),
    )

    assert response.status_code == 400


def test_list_dictionary_items_scoped_to_own_student_ordered_newest_first(
    api_client, auth_header, student, other_student
):
    DictionaryItem.objects.create(
        student=other_student, text='other', lang='en', translation='інше', sample='s', sample_translation='р',
    )
    older = DictionaryItem.objects.create(
        student=student, text='first', lang='en', translation='перше', sample='s', sample_translation='р',
    )
    newer = DictionaryItem.objects.create(
        student=student, text='second', lang='en', translation='друге', sample='s', sample_translation='р',
    )

    response = api_client.get('/dictionary', headers=auth_header(student.user))

    assert response.status_code == 200
    ids = [item['id'] for item in response.data]
    assert ids == [newer.id, older.id]


def test_update_dictionary_item_status_persists(api_client, auth_header, student):
    item = DictionaryItem.objects.create(
        student=student, text='word', lang='en', translation='слово', sample='s', sample_translation='р',
    )

    response = api_client.patch(
        f'/dictionary/{item.id}/status',
        json={'status': DictionaryItemStatus.KNOWN},
        headers=auth_header(student.user),
    )

    assert response.status_code == 200
    assert response.data['status'] == DictionaryItemStatus.KNOWN
    item.refresh_from_db()
    assert item.status == DictionaryItemStatus.KNOWN


def test_update_dictionary_item_status_rejects_invalid_value(api_client, auth_header, student):
    item = DictionaryItem.objects.create(
        student=student, text='word', lang='en', translation='слово', sample='s', sample_translation='р',
    )

    response = api_client.patch(
        f'/dictionary/{item.id}/status',
        json={'status': 'fluent'},
        headers=auth_header(student.user),
    )

    assert response.status_code == 400


def test_update_dictionary_item_status_forbidden_for_other_student(api_client, auth_header, student, other_student):
    item = DictionaryItem.objects.create(
        student=student, text='word', lang='en', translation='слово', sample='s', sample_translation='р',
    )

    response = api_client.patch(
        f'/dictionary/{item.id}/status',
        json={'status': DictionaryItemStatus.KNOWN},
        headers=auth_header(other_student.user),
    )

    assert response.status_code == 403


def test_delete_dictionary_item_removes_it(api_client, auth_header, student):
    item = DictionaryItem.objects.create(
        student=student, text='word', lang='en', translation='слово', sample='s', sample_translation='р',
    )

    response = api_client.delete(f'/dictionary/{item.id}', headers=auth_header(student.user))

    assert response.status_code == 204
    assert not DictionaryItem.objects.filter(id=item.id).exists()


def test_delete_dictionary_item_forbidden_for_other_student(api_client, auth_header, student, other_student):
    item = DictionaryItem.objects.create(
        student=student, text='word', lang='en', translation='слово', sample='s', sample_translation='р',
    )

    response = api_client.delete(f'/dictionary/{item.id}', headers=auth_header(other_student.user))

    assert response.status_code == 403
    assert DictionaryItem.objects.filter(id=item.id).exists()
