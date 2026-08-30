import pytest

from accounts.models import Role, StudentProfile, User
from tts.models import TtsVoiceSetting

pytestmark = pytest.mark.django_db


@pytest.fixture
def student():
    user = User.objects.create_user(email='student@example.com', role=Role.STUDENT)
    return StudentProfile.objects.create(user=user)


def test_list_tts_voices_returns_seeded_defaults(api_client, auth_header, student):
    response = api_client.get('/tts/voices', headers=auth_header(student.user))
    assert response.status_code == 200
    voices_by_key = {(row['language'], row['profile']): row['voice_id'] for row in response.data}
    assert voices_by_key[('uk', 'short')] == 'uk_UA-mykyta-high'
    assert voices_by_key[('uk', 'sentence')] == 'uk_UA-mykyta-high'
    assert voices_by_key[('en', 'short')] == 'en_US-lessac-medium'
    assert voices_by_key[('pl', 'sentence')] == 'pl_PL-gosia-medium'


def test_list_tts_voices_reflects_admin_overrides(api_client, auth_header, student):
    TtsVoiceSetting.objects.filter(language='uk', profile='short').update(voice_id='uk_UA-lada-x_low')

    response = api_client.get('/tts/voices', headers=auth_header(student.user))
    assert response.status_code == 200
    voices_by_key = {(row['language'], row['profile']): row['voice_id'] for row in response.data}
    assert voices_by_key[('uk', 'short')] == 'uk_UA-lada-x_low'


def test_list_tts_voices_requires_auth(api_client):
    response = api_client.get('/tts/voices')
    assert response.status_code == 401
