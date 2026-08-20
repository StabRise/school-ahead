import pytest
from ninja.testing import TestClient

from core.urls import api


@pytest.fixture
def api_client():
    return TestClient(api)


@pytest.fixture
def auth_header():
    """Returns a function that mints a real access token for a user and
    returns the Authorization header dict — for tests that need to exercise
    a router's actual CookieOrBearerJWTAuth resolution, not just its view
    function directly."""
    from accounts.services import issue_token_pair

    def _auth_header(user):
        access_token, _refresh_token = issue_token_pair(user)
        return {'Authorization': f'Bearer {access_token}'}

    return _auth_header
