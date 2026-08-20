import hmac

from django.conf import settings
from django.http import HttpRequest
from ninja.errors import HttpError


def require_csrf(request: HttpRequest) -> None:
    """Double-submit CSRF check for cookie-authenticated requests only.
    Bearer-authenticated requests (Next.js server calls) are exempt, since a
    Bearer header is never auto-attached by a browser. See
    docs/architecture/05-auth-flow.md."""
    if not getattr(request, 'auth_via_cookie', False):
        return

    cookie_value = request.COOKIES.get(settings.CSRF_TOKEN_COOKIE_NAME, '')
    header_value = request.headers.get(settings.CSRF_TOKEN_HEADER_NAME, '')

    if not cookie_value or not hmac.compare_digest(cookie_value, header_value):
        raise HttpError(403, 'CSRF token missing or invalid')
