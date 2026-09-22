import io
import json
import zipfile

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils.datastructures import MultiValueDict

from accounts.models import Role, StudentProfile, TutorProfile, User
from reading.models import Syllable

pytestmark = pytest.mark.django_db

FAKE_PNG = b'\x89PNG\r\n\x1a\nfake'


@pytest.fixture
def tutor():
    user = User.objects.create_user(email='tutor@example.com', role=Role.TUTOR)
    return TutorProfile.objects.create(user=user)


@pytest.fixture
def student():
    user = User.objects.create_user(email='student@example.com', role=Role.STUDENT)
    return StudentProfile.objects.create(user=user)


def _syllables_zip(consonant_words: dict[str, dict[str, str]], utf8_names: bool = True) -> SimpleUploadedFile:
    """Builds a ZIP shaped like public/static/syllables/<consonant>/
    {words.json,<syllable>.png} — `consonant_words` maps a folder name to
    its words.json content (syllable -> word); a fake PNG is written for
    every syllable key. `utf8_names=False` writes entries without the ZIP
    UTF-8 flag (ZIP_FILECOUNT_LIMIT's default when Python doesn't detect
    non-ASCII), reproducing the cp437-mangled-name shape some zip tools
    (e.g. macOS's CLI `zip` under some locales) actually produce."""
    def write(archive: zipfile.ZipFile, name: str, content: bytes) -> None:
        if utf8_names:
            archive.writestr(name, content)
        else:
            archive.writestr(zipfile.ZipInfo(name), content)

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w') as archive:
        for folder, words in consonant_words.items():
            write(archive, f'{folder}/words.json', json.dumps(words, ensure_ascii=False).encode())
            for syllable in words:
                write(archive, f'{folder}/{syllable}.png', FAKE_PNG)
    return SimpleUploadedFile('syllables.zip', buffer.getvalue(), content_type='application/zip')


class TestSyllableImport:
    def test_import_creates_syllables_with_icons(self, api_client, auth_header, tutor):
        upload = _syllables_zip({'б': {'ба': 'баран', 'бо': 'бобер'}})

        response = api_client.post(
            '/reading/tutor/syllables/import', FILES=MultiValueDict({'file': [upload]}), headers=auth_header(tutor.user),
        )

        assert response.status_code == 200
        assert response.data == {'created': 2, 'updated': 0, 'skipped': 0}
        rows = {(s.first_letter, s.second_part): s for s in Syllable.objects.all()}
        assert rows[('Б', 'А')].word == 'Баран'
        assert rows[('Б', 'А')].is_default is True
        assert bool(rows[('Б', 'А')].icon)
        assert rows[('Б', 'О')].word == 'Бобер'

    def test_reimport_updates_instead_of_duplicating(self, api_client, auth_header, tutor):
        upload = _syllables_zip({'б': {'ба': 'баран'}})
        api_client.post(
            '/reading/tutor/syllables/import', FILES=MultiValueDict({'file': [upload]}), headers=auth_header(tutor.user),
        )

        upload2 = _syllables_zip({'б': {'ба': 'баран'}})
        response = api_client.post(
            '/reading/tutor/syllables/import', FILES=MultiValueDict({'file': [upload2]}), headers=auth_header(tutor.user),
        )

        assert response.data == {'created': 0, 'updated': 1, 'skipped': 0}
        assert Syllable.objects.count() == 1

    def test_import_does_not_steal_default_from_existing_group(self, api_client, auth_header, tutor):
        Syllable.objects.create(first_letter='Б', second_part='А', word='Банан', is_default=True)
        upload = _syllables_zip({'б': {'ба': 'баран'}})

        response = api_client.post(
            '/reading/tutor/syllables/import', FILES=MultiValueDict({'file': [upload]}), headers=auth_header(tutor.user),
        )

        assert response.data == {'created': 1, 'updated': 0, 'skipped': 0}
        baran = Syllable.objects.get(word='Баран')
        assert baran.is_default is False

    def test_import_skips_syllable_with_no_matching_image(self, api_client, auth_header, tutor):
        upload = _syllables_zip({'б': {'ба': 'баран'}})
        # Overwrite with a words.json entry that has no corresponding PNG.
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w') as archive:
            archive.writestr('б/words.json', '{"ба": "баран", "бе": "бегемот"}')
            archive.writestr('б/ба.png', FAKE_PNG)
        upload = SimpleUploadedFile('syllables.zip', buffer.getvalue(), content_type='application/zip')

        response = api_client.post(
            '/reading/tutor/syllables/import', FILES=MultiValueDict({'file': [upload]}), headers=auth_header(tutor.user),
        )

        assert response.data == {'created': 1, 'updated': 0, 'skipped': 1}

    def test_import_decodes_non_utf8_flagged_cyrillic_names(self, api_client, auth_header, tutor):
        upload = _syllables_zip({'б': {'ба': 'баран'}}, utf8_names=False)

        response = api_client.post(
            '/reading/tutor/syllables/import', FILES=MultiValueDict({'file': [upload]}), headers=auth_header(tutor.user),
        )

        assert response.data == {'created': 1, 'updated': 0, 'skipped': 0}
        assert Syllable.objects.filter(first_letter='Б', second_part='А', word='Баран').exists()

    def test_import_forbidden_for_non_tutor(self, api_client, auth_header, student):
        upload = _syllables_zip({'б': {'ба': 'баран'}})
        response = api_client.post(
            '/reading/tutor/syllables/import', FILES=MultiValueDict({'file': [upload]}), headers=auth_header(student.user),
        )
        assert response.status_code == 403
        assert not Syllable.objects.exists()

    def test_import_rejects_non_zip_file(self, api_client, auth_header, tutor):
        bad_file = SimpleUploadedFile('notzip.txt', b'not a zip', content_type='text/plain')
        response = api_client.post(
            '/reading/tutor/syllables/import', FILES=MultiValueDict({'file': [bad_file]}), headers=auth_header(tutor.user),
        )
        assert response.status_code == 400


class TestTutorSyllablesList:
    def test_list_requires_tutor(self, api_client, auth_header, student):
        response = api_client.get('/reading/tutor/syllables', headers=auth_header(student.user))
        assert response.status_code == 403

    def test_list_returns_every_syllable(self, api_client, auth_header, tutor):
        Syllable.objects.create(first_letter='Б', second_part='А', word='Банан', is_default=True)
        Syllable.objects.create(first_letter='М', second_part='О', word='Морква', is_default=True)

        response = api_client.get('/reading/tutor/syllables', headers=auth_header(tutor.user))

        assert response.status_code == 200
        assert len(response.data) == 2
