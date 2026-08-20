from unittest.mock import patch

import pytest

from accounts.models import RefreshToken, Role, User

pytestmark = pytest.mark.django_db

GOOGLE_CLAIMS = {
    'sub': 'google-uid-123',
    'email': 'student@example.com',
    'given_name': 'Ada',
    'family_name': 'Lovelace',
    'picture': 'https://example.com/avatar.png',
}


def _cookie_value(response, name):
    return response.cookies[name].value


@patch('accounts.services.verify_google_id_token', return_value=GOOGLE_CLAIMS)
def test_google_login_creates_user_and_sets_cookies(mock_verify, api_client):
    response = api_client.post('/auth/google', json={'id_token': 'fake-id-token'})

    assert response.status_code == 200
    assert response.data['user']['email'] == 'student@example.com'
    assert response.data['user']['role'] == Role.STUDENT

    assert User.objects.filter(email='student@example.com').exists()
    assert 'access_token' in response.cookies
    assert 'refresh_token' in response.cookies
    assert 'csrf_token' in response.cookies


@patch('accounts.services.verify_google_id_token', return_value=GOOGLE_CLAIMS)
def test_me_with_cookie(mock_verify, api_client):
    login = api_client.post('/auth/google', json={'id_token': 'fake-id-token'})
    access_token = _cookie_value(login, 'access_token')

    response = api_client.get('/auth/me', COOKIES={'access_token': access_token})

    assert response.status_code == 200
    assert response.data['user']['email'] == 'student@example.com'


@patch('accounts.services.verify_google_id_token', return_value=GOOGLE_CLAIMS)
def test_me_with_bearer_header(mock_verify, api_client):
    login = api_client.post('/auth/google', json={'id_token': 'fake-id-token'})
    access_token = _cookie_value(login, 'access_token')

    response = api_client.get(
        '/auth/me', headers={'Authorization': f'Bearer {access_token}'}
    )

    assert response.status_code == 200
    assert response.data['user']['email'] == 'student@example.com'


@patch('accounts.services.verify_google_id_token', return_value=GOOGLE_CLAIMS)
def test_refresh_rotates_token_and_rejects_reuse(mock_verify, api_client):
    login = api_client.post('/auth/google', json={'id_token': 'fake-id-token'})
    refresh_token = _cookie_value(login, 'refresh_token')
    csrf_token = _cookie_value(login, 'csrf_token')

    assert RefreshToken.objects.count() == 1
    original = RefreshToken.objects.get()

    response = api_client.post(
        '/auth/refresh',
        COOKIES={'refresh_token': refresh_token, 'csrf_token': csrf_token},
        headers={'X-CSRF-Token': csrf_token},
    )
    assert response.status_code == 200

    original.refresh_from_db()
    assert original.is_revoked
    assert RefreshToken.objects.count() == 2

    reuse_response = api_client.post(
        '/auth/refresh',
        COOKIES={'refresh_token': refresh_token, 'csrf_token': csrf_token},
        headers={'X-CSRF-Token': csrf_token},
    )
    assert reuse_response.status_code == 401


@patch('accounts.services.verify_google_id_token', return_value=GOOGLE_CLAIMS)
def test_refresh_without_csrf_header_rejected(mock_verify, api_client):
    login = api_client.post('/auth/google', json={'id_token': 'fake-id-token'})
    refresh_token = _cookie_value(login, 'refresh_token')
    csrf_token = _cookie_value(login, 'csrf_token')

    response = api_client.post(
        '/auth/refresh', COOKIES={'refresh_token': refresh_token, 'csrf_token': csrf_token}
    )
    assert response.status_code == 403


@patch('accounts.services.verify_google_id_token', return_value=GOOGLE_CLAIMS)
def test_logout_revokes_and_clears_cookies(mock_verify, api_client):
    login = api_client.post('/auth/google', json={'id_token': 'fake-id-token'})
    access_token = _cookie_value(login, 'access_token')
    refresh_token = _cookie_value(login, 'refresh_token')
    csrf_token = _cookie_value(login, 'csrf_token')

    response = api_client.post(
        '/auth/logout',
        COOKIES={
            'access_token': access_token,
            'refresh_token': refresh_token,
            'csrf_token': csrf_token,
        },
        headers={'X-CSRF-Token': csrf_token},
    )
    assert response.status_code == 204

    # Logout revokes the refresh token (blocking any future refresh) and
    # instructs the browser to clear cookies, but access_token is a
    # stateless JWT — it remains valid for its own short lifetime even
    # after logout, per docs/architecture/05-auth-flow.md. A real client
    # can no longer authenticate post-logout because the cookie is gone,
    # not because the token itself was blacklisted.
    db_token = RefreshToken.objects.get()
    assert db_token.is_revoked

    refresh_after_logout = api_client.post(
        '/auth/refresh',
        COOKIES={'refresh_token': refresh_token, 'csrf_token': csrf_token},
        headers={'X-CSRF-Token': csrf_token},
    )
    assert refresh_after_logout.status_code == 401

    me_without_cookie = api_client.get('/auth/me')
    assert me_without_cookie.status_code == 401


@patch('accounts.services.verify_google_id_token', return_value=GOOGLE_CLAIMS)
def test_logout_via_bearer_exempt_from_csrf(mock_verify, api_client):
    login = api_client.post('/auth/google', json={'id_token': 'fake-id-token'})
    access_token = _cookie_value(login, 'access_token')
    refresh_token = _cookie_value(login, 'refresh_token')

    response = api_client.post(
        '/auth/logout',
        COOKIES={'refresh_token': refresh_token},
        headers={'Authorization': f'Bearer {access_token}'},
    )
    assert response.status_code == 204
