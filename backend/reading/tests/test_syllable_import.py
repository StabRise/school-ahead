import io
import json
import unicodedata
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


def _letters_zip(consonant_words: dict[str, list[str]], audio: dict[str, bytes] | None = None) -> SimpleUploadedFile:
    """Builds a ZIP shaped like public/static/letters/<consonant>/<Word>.
    <ext> — no words.json, unlike _syllables_zip above. `consonant_words`
    maps a folder name to the words whose picture lives directly in it (one
    fake image per word); `audio` optionally adds `<folder>/<stem>.mp3`
    entries (a 2-letter stem for a bare-syllable recording, a full word for
    a word recording — same convention as import_reading_syllables)."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w') as archive:
        for folder, words in consonant_words.items():
            for word in words:
                archive.writestr(f'{folder}/{word}.png', FAKE_PNG)
        for name, content in (audio or {}).items():
            archive.writestr(name, content)
    return SimpleUploadedFile('letters.zip', buffer.getvalue(), content_type='application/zip')


class TestLettersShapeSyllableImport:
    def test_import_derives_word_from_filename(self, api_client, auth_header, tutor):
        upload = _letters_zip({'Б': ['Бик', 'Баба']})

        response = api_client.post(
            '/reading/tutor/syllables/import', FILES=MultiValueDict({'file': [upload]}), headers=auth_header(tutor.user),
        )

        assert response.status_code == 200
        assert response.data == {'created': 2, 'updated': 0, 'skipped': 0}
        rows = {(s.first_letter, s.second_part): s for s in Syllable.objects.all()}
        assert rows[('Б', 'И')].word == 'Бик'
        assert rows[('Б', 'И')].is_default is True
        assert bool(rows[('Б', 'И')].icon)
        assert rows[('Б', 'А')].word == 'Баба'

    def test_import_makes_a_card_for_every_image_regardless_of_folder(self, api_client, auth_header, tutor):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w') as archive:
            archive.writestr('Б/Бик.png', FAKE_PNG)
            archive.writestr('Б/Мак.jpeg', FAKE_PNG)
        upload = SimpleUploadedFile('letters.zip', buffer.getvalue(), content_type='application/zip')

        response = api_client.post(
            '/reading/tutor/syllables/import', FILES=MultiValueDict({'file': [upload]}), headers=auth_header(tutor.user),
        )

        assert response.data == {'created': 2, 'updated': 0, 'skipped': 0}

    def test_import_takes_letter_from_each_word_in_a_mixed_folder(self, api_client, auth_header, tutor):
        upload = _letters_zip({'litery': ['namiot', 'balon', 'rak']})

        response = api_client.post(
            '/reading/tutor/syllables/import',
            data={'language': 'pl'},
            FILES=MultiValueDict({'file': [upload]}),
            headers=auth_header(tutor.user),
        )

        assert response.status_code == 200
        assert response.data == {'created': 3, 'updated': 0, 'skipped': 0}
        rows = {(s.first_letter, s.second_part): s.word for s in Syllable.objects.filter(language='pl')}
        assert rows == {('N', 'A'): 'Namiot', ('B', 'A'): 'Balon', ('R', 'A'): 'Rak'}

    def test_import_treats_a_numbered_folder_as_mixed_words(self, api_client, auth_header, tutor):
        # A zipped-up `1/` folder (macOS Finder's "Compress").
        upload = _letters_zip({'1': ['cebula', 'byk']})

        response = api_client.post(
            '/reading/tutor/syllables/import',
            data={'language': 'pl'},
            FILES=MultiValueDict({'file': [upload]}),
            headers=auth_header(tutor.user),
        )

        assert response.data == {'created': 2, 'updated': 0, 'skipped': 0}
        assert set(Syllable.objects.values_list('word', flat=True)) == {'Cebula', 'Byk'}

    def test_import_normalizes_decomposed_macos_names(self, api_client, auth_header, tutor):
        # Finder's "Compress" stores names NFD-decomposed (`ą` as `a` + a
        # combining ogonek).
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w') as archive:
            archive.writestr(unicodedata.normalize('NFD', '1/ąkier.png'), FAKE_PNG)
        upload = SimpleUploadedFile('mac.zip', buffer.getvalue(), content_type='application/zip')

        response = api_client.post(
            '/reading/tutor/syllables/import',
            data={'language': 'pl'},
            FILES=MultiValueDict({'file': [upload]}),
            headers=auth_header(tutor.user),
        )

        assert response.data == {'created': 1, 'updated': 0, 'skipped': 0}
        syllable = Syllable.objects.get()
        assert (syllable.first_letter, syllable.second_part, syllable.word) == ('Ą', 'K', 'Ąkier')

    def test_import_keeps_polish_digraphs_as_one_consonant(self, api_client, auth_header, tutor):
        upload = _letters_zip({'1': ['chata', 'czapla', 'rzeka', 'szafa', 'cebula']}, audio={'1/cza.mp3': b'mp3'})

        response = api_client.post(
            '/reading/tutor/syllables/import',
            data={'language': 'pl'},
            FILES=MultiValueDict({'file': [upload]}),
            headers=auth_header(tutor.user),
        )

        assert response.data == {'created': 5, 'updated': 0, 'skipped': 0}
        rows = {s.word: (s.first_letter, s.second_part) for s in Syllable.objects.all()}
        assert rows == {
            'Chata': ('CH', 'A'),
            'Czapla': ('CZ', 'A'),
            'Rzeka': ('RZ', 'E'),
            'Szafa': ('SZ', 'A'),
            'Cebula': ('C', 'E'),
        }
        assert Syllable.objects.get(word='Czapla').syllable_audio

    def test_import_does_not_split_digraphs_outside_polish(self, api_client, auth_header, tutor):
        upload = _letters_zip({'litery': ['chata']})

        api_client.post(
            '/reading/tutor/syllables/import',
            data={'language': 'en'},
            FILES=MultiValueDict({'file': [upload]}),
            headers=auth_header(tutor.user),
        )

        syllable = Syllable.objects.get()
        assert (syllable.first_letter, syllable.second_part) == ('C', 'H')

    def test_import_reads_images_at_the_archive_root(self, api_client, auth_header, tutor):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w') as archive:
            archive.writestr('Мак.png', FAKE_PNG)
        upload = SimpleUploadedFile('root.zip', buffer.getvalue(), content_type='application/zip')

        response = api_client.post(
            '/reading/tutor/syllables/import', FILES=MultiValueDict({'file': [upload]}), headers=auth_header(tutor.user),
        )

        assert response.data == {'created': 1, 'updated': 0, 'skipped': 0}
        assert Syllable.objects.get().word == 'Мак'

    def test_import_attaches_word_and_syllable_audio(self, api_client, auth_header, tutor):
        upload = _letters_zip({'Б': ['Бик']}, audio={'Б/бик.mp3': b'ID3wordaudio', 'Б/би.mp3': b'ID3syllableaudio'})

        response = api_client.post(
            '/reading/tutor/syllables/import', FILES=MultiValueDict({'file': [upload]}), headers=auth_header(tutor.user),
        )

        assert response.data == {'created': 1, 'updated': 0, 'skipped': 0}
        syllable = Syllable.objects.get(first_letter='Б', second_part='И')
        assert bool(syllable.word_audio)
        assert bool(syllable.syllable_audio)

    def test_reimport_updates_instead_of_duplicating(self, api_client, auth_header, tutor):
        api_client.post(
            '/reading/tutor/syllables/import',
            FILES=MultiValueDict({'file': [_letters_zip({'Б': ['Бик']})]}),
            headers=auth_header(tutor.user),
        )

        response = api_client.post(
            '/reading/tutor/syllables/import',
            FILES=MultiValueDict({'file': [_letters_zip({'Б': ['Бик']})]}),
            headers=auth_header(tutor.user),
        )

        assert response.data == {'created': 0, 'updated': 1, 'skipped': 0}
        assert Syllable.objects.count() == 1


class TestSyllableImport:
    def test_import_uses_picked_language(self, api_client, auth_header, tutor):
        upload = _syllables_zip({'б': {'ба': 'баран'}})

        response = api_client.post(
            '/reading/tutor/syllables/import',
            data={'language': 'pl'},
            FILES=MultiValueDict({'file': [upload]}),
            headers=auth_header(tutor.user),
        )

        assert response.status_code == 200
        syllable = Syllable.objects.get()
        assert syllable.language == 'pl'
        # Its own language's group had no default card yet.
        assert syllable.is_default is True

    def test_import_rejects_unknown_language(self, api_client, auth_header, tutor):
        upload = _syllables_zip({'б': {'ба': 'баран'}})

        response = api_client.post(
            '/reading/tutor/syllables/import',
            data={'language': 'xx'},
            FILES=MultiValueDict({'file': [upload]}),
            headers=auth_header(tutor.user),
        )

        assert response.status_code == 422
        assert not Syllable.objects.exists()

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
        assert rows[('Б', 'А')].language == 'uk'
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


class TestSetDefaultSyllable:
    def test_marks_syllable_default_and_unmarks_previous(self, api_client, auth_header, tutor):
        old_default = Syllable.objects.create(first_letter='М', second_part='О', word='Морква', is_default=True)
        candidate = Syllable.objects.create(first_letter='М', second_part='О', word='Морозиво', is_default=False)

        response = api_client.post(
            f'/reading/tutor/syllables/{candidate.id}/set-default', headers=auth_header(tutor.user),
        )

        assert response.status_code == 200
        assert response.data['is_default'] is True
        old_default.refresh_from_db()
        candidate.refresh_from_db()
        assert old_default.is_default is False
        assert candidate.is_default is True

    def test_does_not_touch_other_groups(self, api_client, auth_header, tutor):
        other_group_default = Syllable.objects.create(first_letter='Б', second_part='А', word='Банан', is_default=True)
        candidate = Syllable.objects.create(first_letter='М', second_part='О', word='Морква', is_default=False)

        response = api_client.post(
            f'/reading/tutor/syllables/{candidate.id}/set-default', headers=auth_header(tutor.user),
        )

        assert response.status_code == 200
        other_group_default.refresh_from_db()
        assert other_group_default.is_default is True

    def test_already_default_is_a_no_op(self, api_client, auth_header, tutor):
        already_default = Syllable.objects.create(first_letter='М', second_part='О', word='Морква', is_default=True)

        response = api_client.post(
            f'/reading/tutor/syllables/{already_default.id}/set-default', headers=auth_header(tutor.user),
        )

        assert response.status_code == 200
        already_default.refresh_from_db()
        assert already_default.is_default is True

    def test_requires_tutor(self, api_client, auth_header, student):
        candidate = Syllable.objects.create(first_letter='М', second_part='О', word='Морква', is_default=False)

        response = api_client.post(
            f'/reading/tutor/syllables/{candidate.id}/set-default', headers=auth_header(student.user),
        )

        assert response.status_code == 403
        candidate.refresh_from_db()
        assert candidate.is_default is False

    def test_404_for_unknown_id(self, api_client, auth_header, tutor):
        response = api_client.post('/reading/tutor/syllables/999999/set-default', headers=auth_header(tutor.user))
        assert response.status_code == 404
