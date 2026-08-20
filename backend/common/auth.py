from django.conf import settings
from django.http import HttpRequest
from ninja.security import HttpBearer
from ninja_jwt.authentication import JWTBaseAuthentication


class CookieOrBearerJWTAuth(JWTBaseAuthentication, HttpBearer):
    """Accepts the JWT from either the httpOnly access_token cookie (browser
    calls) or an Authorization: Bearer header (Next.js server calls reusing
    the same token). Both resolve to the same request.auth = User.

    Sets request.auth_via_cookie so the CSRF dependency (common/csrf.py)
    knows whether to enforce the double-submit check — only cookie-
    authenticated requests need it. See docs/architecture/05-auth-flow.md.
    """

    def __call__(self, request: HttpRequest):
        cookie_token = request.COOKIES.get(settings.ACCESS_TOKEN_COOKIE_NAME)
        if cookie_token:
            request.auth_via_cookie = True
            return self.authenticate(request, cookie_token)

        request.auth_via_cookie = False
        return super().__call__(request)

    def authenticate(self, request: HttpRequest, token: str):
        return self.jwt_authenticate(request, token)
