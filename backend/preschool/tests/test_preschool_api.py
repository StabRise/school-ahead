import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from accounts.models import Role, TutorProfile, User
from preschool.models import Story, StoryAsset

pytestmark = pytest.mark.django_db


@pytest.fixture
def tutor():
    user = User.objects.create_user(email='tutor@example.com', role=Role.TUTOR)
    return TutorProfile.objects.create(user=user)


@pytest.fixture
def student():
    user = User.objects.create_user(email='student@example.com', role=Role.STUDENT)
    return user


@pytest.fixture
def story(tutor):
    return Story.objects.create(title='Колобок', subtitle='адаптація', content='Жив-був {дід} і {баба}.', created_by=tutor)


def _image(name='cover.png'):
    return SimpleUploadedFile(name, b'\x89PNG\r\n\x1a\nfake', content_type='image/png')


def test_list_stories_is_public(api_client, story):
    response = api_client.get('/preschool/stories')
    assert response.status_code == 200
    assert len(response.data) == 1
    entry = response.data[0]
    assert entry['id'] == story.id
    assert entry['title'] == 'Колобок'
    assert entry['subtitle'] == 'адаптація'
    assert entry['cover_image'] is None
    assert 'content' not in entry  # list response omits the body


def test_get_story_is_public_and_includes_content(api_client, story):
    response = api_client.get(f'/preschool/stories/{story.id}')
    assert response.status_code == 200
    assert response.data['content'] == 'Жив-був {дід} і {баба}.'


def test_get_story_404_for_unknown_id(api_client):
    response = api_client.get('/preschool/stories/999999')
    assert response.status_code == 404


def test_tutor_creates_story_with_cover(api_client, auth_header, tutor):
    response = api_client.post(
        '/preschool/stories',
        data={'title': 'Ріпка', 'subtitle': '', 'content': '{Дід} тягне {ріпку}.'},
        FILES={'cover_image': _image()},
        headers=auth_header(tutor.user),
    )

    assert response.status_code == 200
    assert response.data['title'] == 'Ріпка'
    assert response.data['cover_image'].startswith('http')
    story = Story.objects.get(title='Ріпка')
    assert story.created_by_id == tutor.id


def test_create_story_forbidden_for_non_tutor(api_client, auth_header, student):
    response = api_client.post(
        '/preschool/stories', data={'title': 'Ріпка'}, headers=auth_header(student),
    )
    assert response.status_code == 403
    assert not Story.objects.filter(title='Ріпка').exists()


def test_tutor_updates_story_content(api_client, auth_header, tutor, story):
    response = api_client.patch(
        f'/preschool/stories/{story.id}', data={'content': 'Новий текст.'}, headers=auth_header(tutor.user),
    )

    assert response.status_code == 200
    assert response.data['content'] == 'Новий текст.'
    story.refresh_from_db()
    assert story.content == 'Новий текст.'
    assert story.title == 'Колобок'  # untouched fields stay as-is


def test_update_story_forbidden_for_non_tutor(api_client, auth_header, student, story):
    response = api_client.patch(
        f'/preschool/stories/{story.id}', data={'content': 'Хак'}, headers=auth_header(student),
    )
    assert response.status_code == 403
    story.refresh_from_db()
    assert story.content != 'Хак'


def test_tutor_deletes_story(api_client, auth_header, tutor, story):
    response = api_client.delete(f'/preschool/stories/{story.id}', headers=auth_header(tutor.user))
    assert response.status_code == 204
    assert not Story.objects.filter(id=story.id).exists()


def test_delete_story_forbidden_for_non_tutor(api_client, auth_header, student, story):
    response = api_client.delete(f'/preschool/stories/{story.id}', headers=auth_header(student))
    assert response.status_code == 403
    assert Story.objects.filter(id=story.id).exists()


def test_tutor_uploads_story_image_and_returns_absolute_url(api_client, auth_header, tutor, story):
    response = api_client.post(
        f'/preschool/stories/{story.id}/images', FILES={'image': _image('page1.png')}, headers=auth_header(tutor.user),
    )

    assert response.status_code == 200
    assert response.data['url'].startswith('http')
    assert response.data['url'].endswith('.png')
    assert StoryAsset.objects.filter(story=story).count() == 1


def test_upload_story_image_forbidden_for_non_tutor(api_client, auth_header, student, story):
    response = api_client.post(
        f'/preschool/stories/{story.id}/images', FILES={'image': _image()}, headers=auth_header(student),
    )
    assert response.status_code == 403
    assert StoryAsset.objects.filter(story=story).count() == 0
