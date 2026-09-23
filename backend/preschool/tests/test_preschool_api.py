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


def _real_png(name='big.png', size=(1200, 900)):
    from PIL import Image

    out = io.BytesIO()
    Image.new('RGB', size, (10, 120, 200)).save(out, 'PNG')
    return SimpleUploadedFile(name, out.getvalue(), content_type='image/png')


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
        response = api_client.get(f'/preschool/stories/{published_story.slug}')
        assert response.status_code == 200
        assert response.data['content'] == 'Жив-був {дід} і {баба}.'
        assert response.data['assets'] == []

    def test_get_draft_story_is_404_publicly(self, api_client, draft_story):
        response = api_client.get(f'/preschool/stories/{draft_story.slug}')
        assert response.status_code == 404

    def test_get_unknown_story_404(self, api_client):
        response = api_client.get('/preschool/stories/unknown-slug')
        assert response.status_code == 404


class TestStorySlug:
    def test_slug_transliterates_cyrillic_title(self, tutor):
        story = Story.objects.create(title='Колобок', created_by=tutor)
        assert story.slug == 'kolobok'

    def test_duplicate_titles_get_disambiguated_slugs(self, tutor):
        first = Story.objects.create(title='Нова казка', created_by=tutor)
        second = Story.objects.create(title='Нова казка', created_by=tutor)
        assert first.slug == 'nova-kazka'
        assert second.slug == 'nova-kazka-2'

    def test_slug_stays_stable_after_title_edit(self, tutor):
        story = Story.objects.create(title='Колобок', created_by=tutor)
        story.title = 'Колобок (нова версія)'
        story.save()
        assert story.slug == 'kolobok'

    def test_create_endpoint_returns_slug(self, api_client, auth_header, tutor):
        response = api_client.post(
            '/preschool/tutor/stories', data={'title': 'Ріпка'}, headers=auth_header(tutor.user),
        )
        assert response.data['slug'] == 'ripka'


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
        public_response = api_client.get(f'/preschool/stories/{draft_story.slug}')
        assert public_response.status_code == 200

    def test_tutor_unpublishes_story(self, api_client, auth_header, tutor, published_story):
        response = api_client.patch(
            f'/preschool/tutor/stories/{published_story.id}',
            data={'is_published': False},
            headers=auth_header(tutor.user),
        )
        assert response.status_code == 200
        public_response = api_client.get(f'/preschool/stories/{published_story.slug}')
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


class TestStoryAssetRefs:
    """Story.content references an asset by its stable ref, never by its
    storage URL — with S3 querystring auth that URL is a presigned link
    that expires an hour later (see models.STORY_ASSET_REF_PREFIX)."""

    def _upload(self, api_client, auth_header, tutor, story, *files):
        return api_client.post(
            f'/preschool/tutor/stories/{story.id}/assets',
            FILES=MultiValueDict({'files': list(files)}),
            headers=auth_header(tutor.user),
        ).data

    def test_upload_returns_ref_and_image_thumbnail(self, api_client, auth_header, tutor, draft_story, settings, tmp_path):
        settings.MEDIA_ROOT = tmp_path
        image, audio = self._upload(api_client, auth_header, tutor, draft_story, _real_png(), _audio('koza.mp3'))

        asset = StoryAsset.objects.get(id=image['id'])
        assert image['ref'] == f'/api/story-asset/{asset.stored_name}'
        assert '/CACHE/' in image['thumbnail_url']
        assert audio['thumbnail_url'] is None
        (thumbnail,) = (tmp_path / 'CACHE').rglob('*.png')
        from PIL import Image

        assert max(Image.open(thumbnail).size) == 320

    def test_saving_content_rewrites_storage_urls_to_refs(self, api_client, auth_header, tutor, draft_story):
        (uploaded,) = self._upload(api_client, auth_header, tutor, draft_story, _image('page1.png'))
        name = StoryAsset.objects.get(id=uploaded['id']).stored_name
        signed = f'https://s3.example.com/bucket/story_assets/{name}?AWSAccessKeyId=abc&Signature=x%3D&Expires=1790145517'

        response = api_client.patch(
            f'/preschool/tutor/stories/{draft_story.id}',
            data={'content': f'Текст\n\n{{ {signed} }}\n\n{{ {uploaded["url"]} }} і {{ба-ба}}'},
            headers=auth_header(tutor.user),
        )

        assert response.data['content'] == (
            f'Текст\n\n{{ /api/story-asset/{name} }}\n\n{{ /api/story-asset/{name} }} і {{ба-ба}}'
        )

    def test_asset_url_endpoint_resolves_ref_publicly(self, api_client, auth_header, tutor, draft_story):
        (uploaded,) = self._upload(api_client, auth_header, tutor, draft_story, _image('page1.png'))
        name = uploaded['ref'].rsplit('/', 1)[1]

        response = api_client.get(f'/preschool/story-assets/{name}')

        assert response.status_code == 200
        assert response.data['url'] == uploaded['url']

    def test_asset_url_endpoint_404s_unknown_or_malformed_names(self, api_client):
        assert api_client.get(f'/preschool/story-assets/{"0" * 32}.png').status_code == 404
        assert api_client.get('/preschool/story-assets/..%2Fsecret.png').status_code == 404

    def test_cover_is_served_as_thumbnail(self, api_client, auth_header, tutor, draft_story, settings, tmp_path):
        settings.MEDIA_ROOT = tmp_path
        response = api_client.patch(
            f'/preschool/tutor/stories/{draft_story.id}',
            FILES=MultiValueDict({'cover_image': [_real_png('cover.png', (2000, 1500))]}),
            headers=auth_header(tutor.user),
        )

        assert '/CACHE/' in response.data['cover_image']
        (thumbnail,) = (tmp_path / 'CACHE').rglob('*.png')
        from PIL import Image

        assert Image.open(thumbnail).size == (640, 480)


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
        assert f'{{ {referenced_asset["ref"]} }}' in response.data['content']
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


class TestGames:
    def test_seeded_picker_lists_every_category_in_order(self, api_client):
        response = api_client.get('/preschool/games')

        assert response.status_code == 200
        assert [category['name'] for category in response.data] == ['Картки', 'Читання', 'Математика', 'Інше']
        assert response.data[1]['games'][0] == {
            'id': response.data[1]['games'][0]['id'],
            'title': 'Склади',
            'url': '/games/syllables',
            'icon_url': None,
        }

    def test_hides_inactive_games_and_categories(self, api_client):
        from preschool.models import Game, GameCategory

        Game.objects.filter(url='/games/balloons').update(is_active=False)
        GameCategory.objects.filter(name='Інше').update(is_active=False)

        response = api_client.get('/preschool/games')

        urls = [game['url'] for category in response.data for game in category['games']]
        assert '/games/balloons' not in urls
        assert '/games/cards' in urls
        assert '/games/trains' not in urls

    def test_drops_category_with_no_active_games(self, api_client):
        from preschool.models import Game

        Game.objects.filter(category__name='Інше').update(is_active=False)

        response = api_client.get('/preschool/games')

        assert 'Інше' not in [category['name'] for category in response.data]

    def test_icon_is_served_as_thumbnail(self, api_client, settings, tmp_path):
        from preschool.models import Game

        settings.MEDIA_ROOT = tmp_path
        game = Game.objects.get(url='/games/trains')
        game.icon.save('train.png', _real_png('train.png', (1000, 1000)))

        response = api_client.get('/preschool/games')

        trains = next(g for c in response.data for g in c['games'] if g['url'] == '/games/trains')
        assert '/CACHE/' in trains['icon_url']
