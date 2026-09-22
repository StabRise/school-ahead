import pytest

from reading.models import Syllable

pytestmark = pytest.mark.django_db


@pytest.fixture
def syllable_group():
    default = Syllable.objects.create(first_letter='М', second_part='О', word='Морква', is_default=True)
    extra = Syllable.objects.create(first_letter='М', second_part='О', word='Морозиво', is_default=False)
    other = Syllable.objects.create(first_letter='Б', second_part='А', word='Банан', is_default=True)
    return default, extra, other


def test_list_syllables_is_public(api_client, syllable_group):
    response = api_client.get('/reading/syllables')
    assert response.status_code == 200
    assert len(response.data) == 3


def test_list_syllables_filters_by_consonant(api_client, syllable_group):
    response = api_client.get('/reading/syllables', query_params={'consonant': 'м'})
    assert response.status_code == 200
    words = {row['word'] for row in response.data}
    assert words == {'Морква', 'Морозиво'}


def test_list_syllables_filters_by_is_default(api_client, syllable_group):
    response = api_client.get('/reading/syllables', query_params={'is_default': True})
    assert response.status_code == 200
    words = {row['word'] for row in response.data}
    assert words == {'Морква', 'Банан'}


def test_list_consonants_is_public(api_client, syllable_group):
    response = api_client.get('/reading/consonants')
    assert response.status_code == 200
    assert response.data == ['Б', 'М']
