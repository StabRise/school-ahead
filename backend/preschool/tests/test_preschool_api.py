import io
import zipfile

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils.datastructures import MultiValueDict

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
def published_story(tutor):
    return Story.objects.create(
        title='Колобок', subtitle='адаптація', content='Жив-був {дід} і {баба}.', is_published=True, created_by=tutor,
    )


@pytest.fixture
def draft_story(tutor):
    return Story.objects.create(title='Чернетка', content='ще пишеться', is_published=False, created_by=tutor)


def _image(name='cover.png'):
    return SimpleUploadedFile(name, b'\x89PNG\r\n\x1a\nfake', content_type='image/png')


def _audio(name='clip.mp3'):
    return SimpleUploadedFile(name, b'ID3fake', content_type='audio/mpeg')


def _story_zip(markdown: str, files: dict[str, bytes]) -> SimpleUploadedFile:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w') as archive:
        archive.writestr('story.md', markdown)
        for name, data in files.items():
            archive.writestr(name, data)
    return SimpleUploadedFile('story.zip', buffer.getvalue(), content_type='application/zip')


class TestPublicStories:
    def test_list_only_includes_published(self, api_client, published_story, draft_story):
        response = api_client.get('/preschool/stories')
        assert response.status_code == 200
        titles = [entry['title'] for entry in response.data]
        assert titles == ['Колобок']

    def test_list_entry_omits_content(self, api_client, published_story):
        response = api_client.get('/preschool/stories')
        assert 'content' not in response.data[0]
        assert response.data[0]['is_published'] is True

    def test_get_published_story_includes_content_and_assets(self, api_client, published_story):
        response = api_client.get(f'/preschool/stories/{published_story.id}')
        assert response.status_code == 200
        assert response.data['content'] == 'Жив-був {дід} і {баба}.'
        assert response.data['assets'] == []

    def test_get_draft_story_is_404_publicly(self, api_client, draft_story):
        response = api_client.get(f'/preschool/stories/{draft_story.id}')
        assert response.status_code == 404

    def test_get_unknown_story_404(self, api_client):
        response = api_client.get('/preschool/stories/999999')
        assert response.status_code == 404


class TestTutorStoriesList:
    def test_lists_drafts_and_published(self, api_client, auth_header, tutor, published_story, draft_story):
        response = api_client.get('/preschool/tutor/stories', headers=auth_header(tutor.user))
        assert response.status_code == 200
        titles = {entry['title'] for entry in response.data}
        assert titles == {'Колобок', 'Чернетка'}

    def test_forbidden_for_non_tutor(self, api_client, auth_header, student, draft_story):
        response = api_client.get('/preschool/tutor/stories', headers=auth_header(student))
        assert response.status_code == 403

    def test_get_draft_story_works_for_tutor(self, api_client, auth_header, tutor, draft_story):
        response = api_client.get(f'/preschool/tutor/stories/{draft_story.id}', headers=auth_header(tutor.user))
        assert response.status_code == 200
        assert response.data['content'] == 'ще пишеться'


class TestCreateStory:
    def test_tutor_creates_unpublished_story(self, api_client, auth_header, tutor):
        response = api_client.post(
            '/preschool/tutor/stories', data={'title': 'Ріпка'}, headers=auth_header(tutor.user),
        )
        assert response.status_code == 200
        assert response.data['title'] == 'Ріпка'
        assert response.data['is_published'] is False
        story = Story.objects.get(title='Ріпка')
        assert story.created_by_id == tutor.id
        assert story.is_published is False

    def test_forbidden_for_non_tutor(self, api_client, auth_header, student):
        response = api_client.post('/preschool/tutor/stories', data={'title': 'Ріпка'}, headers=auth_header(student))
        assert response.status_code == 403
        assert not Story.objects.filter(title='Ріпка').exists()


class TestUpdateStory:
    def test_tutor_updates_content(self, api_client, auth_header, tutor, draft_story):
        response = api_client.patch(
            f'/preschool/tutor/stories/{draft_story.id}',
            data={'content': 'Новий текст.'},
            headers=auth_header(tutor.user),
        )
        assert response.status_code == 200
        assert response.data['content'] == 'Новий текст.'
        draft_story.refresh_from_db()
        assert draft_story.content == 'Новий текст.'
        assert draft_story.title == 'Чернетка'  # untouched fields stay as-is

    def test_tutor_publishes_story(self, api_client, auth_header, tutor, draft_story):
        response = api_client.patch(
            f'/preschool/tutor/stories/{draft_story.id}',
            data={'is_published': True},
            headers=auth_header(tutor.user),
        )
        assert response.status_code == 200
        assert response.data['is_published'] is True
        draft_story.refresh_from_db()
        assert draft_story.is_published is True
        # Now visible on the public endpoints too.
        public_response = api_client.get(f'/preschool/stories/{draft_story.id}')
        assert public_response.status_code == 200

    def test_tutor_unpublishes_story(self, api_client, auth_header, tutor, published_story):
        response = api_client.patch(
            f'/preschool/tutor/stories/{published_story.id}',
            data={'is_published': False},
            headers=auth_header(tutor.user),
        )
        assert response.status_code == 200
        public_response = api_client.get(f'/preschool/stories/{published_story.id}')
        assert public_response.status_code == 404

    def test_forbidden_for_non_tutor(self, api_client, auth_header, student, draft_story):
        response = api_client.patch(
            f'/preschool/tutor/stories/{draft_story.id}', data={'content': 'Хак'}, headers=auth_header(student),
        )
        assert response.status_code == 403
        draft_story.refresh_from_db()
        assert draft_story.content != 'Хак'


class TestDeleteStory:
    def test_tutor_deletes_story(self, api_client, auth_header, tutor, draft_story):
        response = api_client.delete(f'/preschool/tutor/stories/{draft_story.id}', headers=auth_header(tutor.user))
        assert response.status_code == 204
        assert not Story.objects.filter(id=draft_story.id).exists()

    def test_forbidden_for_non_tutor(self, api_client, auth_header, student, draft_story):
        response = api_client.delete(f'/preschool/tutor/stories/{draft_story.id}', headers=auth_header(student))
        assert response.status_code == 403
        assert Story.objects.filter(id=draft_story.id).exists()


class TestStoryAssets:
    def test_tutor_bulk_uploads_assets_and_returns_absolute_urls(self, api_client, auth_header, tutor, draft_story):
        response = api_client.post(
            f'/preschool/tutor/stories/{draft_story.id}/assets',
            FILES=MultiValueDict({'files': [_image('page1.png'), _audio('koza.mp3')]}),
            headers=auth_header(tutor.user),
        )

        assert response.status_code == 200
        assert len(response.data) == 2
        urls = [asset['url'] for asset in response.data]
        assert all(url.startswith('http') for url in urls)
        assert any(url.endswith('.png') for url in urls)
        assert any(url.endswith('.mp3') for url in urls)
        filenames = {asset['original_filename'] for asset in response.data}
        assert filenames == {'page1.png', 'koza.mp3'}
        assert StoryAsset.objects.filter(story=draft_story).count() == 2

    def test_uploaded_assets_appear_on_tutor_detail(self, api_client, auth_header, tutor, draft_story):
        api_client.post(
            f'/preschool/tutor/stories/{draft_story.id}/assets',
            FILES=MultiValueDict({'files': [_image()]}),
            headers=auth_header(tutor.user),
        )
        response = api_client.get(f'/preschool/tutor/stories/{draft_story.id}', headers=auth_header(tutor.user))
        assert len(response.data['assets']) == 1
        assert response.data['assets'][0]['original_filename'] == 'cover.png'

    def test_rejects_disallowed_extension(self, api_client, auth_header, tutor, draft_story):
        bad_file = SimpleUploadedFile('malware.exe', b'not-a-real-media-file', content_type='application/octet-stream')
        response = api_client.post(
            f'/preschool/tutor/stories/{draft_story.id}/assets',
            FILES=MultiValueDict({'files': [bad_file]}),
            headers=auth_header(tutor.user),
        )
        assert response.status_code == 400
        assert StoryAsset.objects.filter(story=draft_story).count() == 0

    def test_forbidden_for_non_tutor(self, api_client, auth_header, student, draft_story):
        response = api_client.post(
            f'/preschool/tutor/stories/{draft_story.id}/assets',
            FILES=MultiValueDict({'files': [_image()]}),
            headers=auth_header(student),
        )
        assert response.status_code == 403
        assert StoryAsset.objects.filter(story=draft_story).count() == 0

    def test_tutor_deletes_one_asset(self, api_client, auth_header, tutor, draft_story):
        upload_response = api_client.post(
            f'/preschool/tutor/stories/{draft_story.id}/assets',
            FILES=MultiValueDict({'files': [_image()]}),
            headers=auth_header(tutor.user),
        )
        asset_id = upload_response.data[0]['id']

        response = api_client.delete(
            f'/preschool/tutor/stories/{draft_story.id}/assets/{asset_id}', headers=auth_header(tutor.user),
        )
        assert response.status_code == 204
        assert not StoryAsset.objects.filter(id=asset_id).exists()


class TestStoryExportImport:
    def test_export_produces_zip_with_story_md_and_referenced_asset(self, api_client, auth_header, tutor, draft_story):
        upload_response = api_client.post(
            f'/preschool/tutor/stories/{draft_story.id}/assets',
            FILES=MultiValueDict({'files': [_image('page1.png')]}),
            headers=auth_header(tutor.user),
        )
        asset_url = upload_response.data[0]['url']
        api_client.patch(
            f'/preschool/tutor/stories/{draft_story.id}',
            data={'content': f'Текст {{ {asset_url} }} кінець'},
            headers=auth_header(tutor.user),
        )

        response = api_client.get(f'/preschool/tutor/stories/{draft_story.id}/export', headers=auth_header(tutor.user))

        assert response.status_code == 200
        archive = zipfile.ZipFile(io.BytesIO(response.content))
        assert set(archive.namelist()) == {'story.md', 'page1.png'}
        markdown = archive.read('story.md').decode()
        assert markdown.startswith('# Чернетка')
        assert '{ page1.png }' in markdown
        assert asset_url not in markdown

    def test_export_forbidden_for_non_tutor(self, api_client, auth_header, student, draft_story):
        response = api_client.get(f'/preschool/tutor/stories/{draft_story.id}/export', headers=auth_header(student))
        assert response.status_code == 403

    def test_tutor_imports_zip_as_unpublished_story_with_assets(self, api_client, auth_header, tutor):
        markdown = '# Ріпка\n\n### переказ\n\nДід тягне { ріпку }.\n\n{ 1.png }'
        upload = _story_zip(
            markdown, {'cover.png': b'\x89PNGfake', '1.png': b'\x89PNGfake2', 'background.mp3': b'ID3unused'},
        )

        response = api_client.post(
            '/preschool/tutor/stories/import', FILES=MultiValueDict({'file': [upload]}), headers=auth_header(tutor.user),
        )

        assert response.status_code == 200
        assert response.data['title'] == 'Ріпка'
        assert response.data['subtitle'] == 'переказ'
        assert response.data['is_published'] is False
        assert response.data['cover_image'].startswith('http')
        # Both media files are imported as assets — even background.mp3,
        # which the body never references via "{...}" — mirroring the
        # export's own "every asset, referenced or not" completeness.
        filenames = {asset['original_filename'] for asset in response.data['assets']}
        assert filenames == {'1.png', 'background.mp3'}
        referenced_asset = next(a for a in response.data['assets'] if a['original_filename'] == '1.png')
        assert f'{{ {referenced_asset["url"]} }}' in response.data['content']
        assert '{ ріпку }' in response.data['content']  # non-file card group left untouched
        story = Story.objects.get(title='Ріпка')
        assert story.created_by_id == tutor.id

    def test_import_forbidden_for_non_tutor(self, api_client, auth_header, student):
        upload = _story_zip('# Ріпка\n\nтекст', {})
        response = api_client.post(
            '/preschool/tutor/stories/import', FILES=MultiValueDict({'file': [upload]}), headers=auth_header(student),
        )
        assert response.status_code == 403
        assert not Story.objects.filter(title='Ріпка').exists()

    def test_import_rejects_non_zip_file(self, api_client, auth_header, tutor):
        bad_file = SimpleUploadedFile('notzip.txt', b'not a zip', content_type='text/plain')
        response = api_client.post(
            '/preschool/tutor/stories/import', FILES=MultiValueDict({'file': [bad_file]}), headers=auth_header(tutor.user),
        )
        assert response.status_code == 400

    def test_import_rejects_zip_without_story_md(self, api_client, auth_header, tutor):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w') as archive:
            archive.writestr('notes.txt', 'no story.md here')
        upload = SimpleUploadedFile('story.zip', buffer.getvalue(), content_type='application/zip')

        response = api_client.post(
            '/preschool/tutor/stories/import', FILES=MultiValueDict({'file': [upload]}), headers=auth_header(tutor.user),
        )
        assert response.status_code == 400
