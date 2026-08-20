from django.conf import settings
from django.http import HttpRequest, HttpResponse
from ninja import Router
from ninja.errors import HttpError

from common.auth import CookieOrBearerJWTAuth
from common.csrf import require_csrf

from . import services
from .cookies import clear_auth_cookies, set_auth_cookies
from .schemas import GoogleLoginIn, GoogleLoginOut, MeOut, UserOut

router = Router(tags=['auth'])


def _user_out(user) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        role=user.role,
        locale=user.locale,
        avatar_url=user.avatar_url,
    )


@router.post('/google', response=GoogleLoginOut, auth=None, operation_id='google_login')
def google_login(request: HttpRequest, response: HttpResponse, payload: GoogleLoginIn):
    """Verifies a Google ID token, gets/creates the user, and sets auth
    cookies. No CSRF check: there's no pre-existing session to protect, and
    the ID token itself is the anti-forgery proof. See
    docs/architecture/05-auth-flow.md, Diagram A."""
    try:
        claims = services.verify_google_id_token(payload.id_token)
    except services.InvalidGoogleToken as exc:
        raise HttpError(401, 'Invalid Google ID token') from exc

    user = services.get_or_create_user_from_google(claims)
    access_token, refresh_token = services.issue_token_pair(user)
    set_auth_cookies(response, access_token, refresh_token)

    return GoogleLoginOut(user=_user_out(user))


@router.post('/refresh', auth=None, operation_id='refresh')
def refresh(request: HttpRequest, response: HttpResponse):
    """Rotates the refresh token. Requires CSRF: unlike /google, this acts on
    an already-established session via the auto-attached refresh_token
    cookie. There's no CookieOrBearerJWTAuth here (this endpoint authenticates
    via the refresh_token cookie, not access_token), so the CSRF check is
    always cookie-driven. See docs/architecture/05-auth-flow.md, Diagram C."""
    request.auth_via_cookie = True
    require_csrf(request)

    raw_refresh = request.COOKIES.get(settings.REFRESH_TOKEN_COOKIE_NAME)
    if not raw_refresh:
        raise HttpError(401, 'No refresh token cookie')

    try:
        access_token, new_refresh_token = services.rotate_refresh_token(raw_refresh)
    except services.RefreshTokenError as exc:
        raise HttpError(401, str(exc)) from exc

    set_auth_cookies(response, access_token, new_refresh_token)
    return {}


@router.post('/logout', auth=CookieOrBearerJWTAuth(), operation_id='logout')
def logout(request: HttpRequest, response: HttpResponse):
    require_csrf(request)

    raw_refresh = request.COOKIES.get(settings.REFRESH_TOKEN_COOKIE_NAME)
    if raw_refresh:
        services.revoke_refresh_token(raw_refresh)

    clear_auth_cookies(response)
    response.status_code = 204
    return response


@router.get('/me', response=MeOut, auth=CookieOrBearerJWTAuth(), operation_id='me')
def me(request: HttpRequest):
    return MeOut(user=_user_out(request.auth))
