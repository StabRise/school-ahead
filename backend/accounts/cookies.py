import secrets

from django.conf import settings
from django.http import HttpResponse


def _cookie_kwargs(*, max_age: int, path: str = '/', http_only: bool = True) -> dict:
    return {
        'domain': settings.AUTH_COOKIE_DOMAIN,
        'secure': settings.AUTH_COOKIE_SECURE,
        'samesite': settings.AUTH_COOKIE_SAMESITE,
        'httponly': http_only,
        'path': path,
        'max_age': max_age,
    }


def set_auth_cookies(response: HttpResponse, access_token: str, refresh_token: str) -> None:
    """Sets access_token, refresh_token, and csrf_token cookies on the response.
    See docs/architecture/05-auth-flow.md's cookie attributes table."""
    response.set_cookie(
        settings.ACCESS_TOKEN_COOKIE_NAME,
        access_token,
        **_cookie_kwargs(max_age=int(settings.ACCESS_TOKEN_LIFETIME.total_seconds())),
    )
    response.set_cookie(
        settings.REFRESH_TOKEN_COOKIE_NAME,
        refresh_token,
        **_cookie_kwargs(
            max_age=int(settings.REFRESH_TOKEN_LIFETIME.total_seconds()),
            path='/api/auth/refresh',
        ),
    )
    response.set_cookie(
        settings.CSRF_TOKEN_COOKIE_NAME,
        secrets.token_urlsafe(32),
        **_cookie_kwargs(
            max_age=int(settings.REFRESH_TOKEN_LIFETIME.total_seconds()), http_only=False
        ),
    )


def clear_auth_cookies(response: HttpResponse) -> None:
    for name, path in (
        (settings.ACCESS_TOKEN_COOKIE_NAME, '/'),
        (settings.REFRESH_TOKEN_COOKIE_NAME, '/api/auth/refresh'),
        (settings.CSRF_TOKEN_COOKIE_NAME, '/'),
    ):
        response.delete_cookie(name, path=path, domain=settings.AUTH_COOKIE_DOMAIN)
