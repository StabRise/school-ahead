from django.conf import settings
from django.utils import timezone
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from ninja_jwt.exceptions import TokenError
from ninja_jwt.tokens import AccessToken
from ninja_jwt.tokens import RefreshToken as JWTRefreshToken

from .models import RefreshToken, Role, SocialAccount, User

_google_request = google_requests.Request()


class InvalidGoogleToken(Exception):
    pass


class RefreshTokenError(Exception):
    pass


def verify_google_id_token(raw_id_token: str) -> dict:
    """Verifies a Google Identity Services ID token and returns its claims.

    See docs/architecture/05-auth-flow.md, Diagram A.
    """
    try:
        return google_id_token.verify_oauth2_token(
            raw_id_token, _google_request, audience=settings.GOOGLE_CLIENT_ID
        )
    except ValueError as exc:
        raise InvalidGoogleToken(str(exc)) from exc


def get_or_create_user_from_google(claims: dict) -> User:
    provider_uid = claims['sub']

    social_account = SocialAccount.objects.filter(
        provider=SocialAccount.Provider.GOOGLE, provider_uid=provider_uid
    ).select_related('user').first()
    if social_account:
        return social_account.user

    email = claims['email']
    user, _created = User.objects.get_or_create(
        email=email,
        defaults={
            'first_name': claims.get('given_name', ''),
            'last_name': claims.get('family_name', ''),
            'avatar_url': claims.get('picture', ''),
            'role': Role.STUDENT,
        },
    )
    SocialAccount.objects.create(
        user=user,
        provider=SocialAccount.Provider.GOOGLE,
        provider_uid=provider_uid,
        raw_data=claims,
    )
    return user


def issue_token_pair(user: User) -> tuple[str, str]:
    """Issues a new access+refresh JWT pair, persisting a RefreshToken row
    whose UUID becomes the refresh JWT's `jti` claim."""
    now = timezone.now()
    db_token = RefreshToken.objects.create(
        user=user, expires_at=now + settings.REFRESH_TOKEN_LIFETIME
    )

    access = AccessToken.for_user(user)

    refresh = JWTRefreshToken.for_user(user)
    refresh['jti'] = str(db_token.id)

    return str(access), str(refresh)


def rotate_refresh_token(raw_refresh_token: str) -> tuple[str, str]:
    """Validates, revokes, and rotates a refresh token. Raises
    RefreshTokenError if the token is invalid, expired, or already revoked."""
    try:
        token = JWTRefreshToken(raw_refresh_token)
    except TokenError as exc:
        raise RefreshTokenError('Invalid or expired refresh token') from exc

    jti = token.get('jti')
    try:
        db_token = RefreshToken.objects.select_related('user').get(id=jti)
    except (RefreshToken.DoesNotExist, ValueError, TypeError) as exc:
        raise RefreshTokenError('Refresh token not recognized') from exc

    if db_token.is_revoked:
        raise RefreshTokenError('Refresh token has been revoked')
    if db_token.expires_at <= timezone.now():
        raise RefreshTokenError('Refresh token has expired')

    user = db_token.user
    now = timezone.now()
    new_db_token = RefreshToken.objects.create(
        user=user, expires_at=now + settings.REFRESH_TOKEN_LIFETIME
    )
    db_token.revoked_at = now
    db_token.replaced_by = new_db_token
    db_token.save(update_fields=['revoked_at', 'replaced_by'])

    access = AccessToken.for_user(user)
    refresh = JWTRefreshToken.for_user(user)
    refresh['jti'] = str(new_db_token.id)

    return str(access), str(refresh)


def revoke_refresh_token(raw_refresh_token: str) -> None:
    try:
        token = JWTRefreshToken(raw_refresh_token, verify=False)
    except TokenError:
        return

    jti = token.get('jti')
    RefreshToken.objects.filter(id=jti, revoked_at__isnull=True).update(
        revoked_at=timezone.now()
    )
