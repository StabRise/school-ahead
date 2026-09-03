from django.conf import settings
from django.db.models import F
from django.utils import timezone
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from ninja_jwt.exceptions import TokenError
from ninja_jwt.tokens import AccessToken
from ninja_jwt.tokens import RefreshToken as JWTRefreshToken

from .models import AvatarItem, RefreshToken, Role, SocialAccount, StudentProfile, User

_google_request = google_requests.Request()


class InvalidGoogleToken(Exception):
    pass


class RefreshTokenError(Exception):
    pass


class ItemAlreadyUnlocked(Exception):
    pass


class InsufficientDiamonds(Exception):
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


# Diamond reward for the balloon-pop minigame's 100-balloon milestone (see
# frontend/components/preschool/balloon-pop-game.tsx). Same intentionally
# simple StudentProfile.diamond_balance_cache counter as
# lessons.services.LESSON_COMPLETION_DIAMONDS — no append-only ledger, and no
# server-side tracking of balloons popped, so this trusts the frontend to
# call it once per milestone reached in a play session.
BALLOON_POP_MILESTONE_DIAMONDS = 1


def award_balloon_pop_diamond(student: StudentProfile) -> None:
    """Same atomic F() update as _award_completion_diamonds, so this can run
    concurrently with other requests touching the same StudentProfile."""
    StudentProfile.objects.filter(pk=student.pk).update(
        diamond_balance_cache=F('diamond_balance_cache') + BALLOON_POP_MILESTONE_DIAMONDS
    )
    student.refresh_from_db(fields=['diamond_balance_cache'])


# Diamond reward for passing the balloon-pop minigame's bonus "?" heart-
# balloon quiz (see frontend/components/preschool/balloon-quiz.tsx) — awarded
# once the student answers over 60% of the quiz's questions correctly. Same
# trust model as BALLOON_POP_MILESTONE_DIAMONDS above: no server-side
# tracking of quiz answers, the frontend calls this once per passed quiz.
BALLOON_QUIZ_REWARD_DIAMONDS = 1


def award_balloon_quiz_diamond(student: StudentProfile) -> None:
    """Same atomic F() update as award_balloon_pop_diamond."""
    StudentProfile.objects.filter(pk=student.pk).update(
        diamond_balance_cache=F('diamond_balance_cache') + BALLOON_QUIZ_REWARD_DIAMONDS
    )
    student.refresh_from_db(fields=['diamond_balance_cache'])


# Diamond reward for clearing a consonant level of the reading (syllable
# drag-and-drop) minigame (see frontend/components/preschool/reading-game.tsx)
# — awarded once every syllable card has a matching picture card placed on
# it. Same trust model as BALLOON_POP_MILESTONE_DIAMONDS above: no
# server-side tracking of placements, the frontend calls this once per level
# cleared.
READING_GAME_LEVEL_REWARD_DIAMONDS = 1


def award_reading_game_diamond(student: StudentProfile) -> None:
    """Same atomic F() update as award_balloon_pop_diamond."""
    StudentProfile.objects.filter(pk=student.pk).update(
        diamond_balance_cache=F('diamond_balance_cache') + READING_GAME_LEVEL_REWARD_DIAMONDS
    )
    student.refresh_from_db(fields=['diamond_balance_cache'])


# Diamond reward for the trains minigame's 10-letter milestone (see
# frontend/components/preschool/trains-game.tsx) — awarded every 10 letters
# a student presses on the on-screen keyboard as the matching train car
# rolls by. Same trust model as BALLOON_POP_MILESTONE_DIAMONDS above: no
# server-side tracking of letters collected, the frontend calls this once
# per milestone reached in a play session.
TRAINS_GAME_MILESTONE_DIAMONDS = 1


def award_trains_game_diamond(student: StudentProfile) -> None:
    """Same atomic F() update as award_balloon_pop_diamond."""
    StudentProfile.objects.filter(pk=student.pk).update(
        diamond_balance_cache=F('diamond_balance_cache') + TRAINS_GAME_MILESTONE_DIAMONDS
    )
    student.refresh_from_db(fields=['diamond_balance_cache'])


# Diamond reward for the "Казки" (Stories) minigame's 5-star milestone (see
# frontend/components/preschool/stories-game.tsx) — a star is earned each
# time a student opens a syllable/word card inside a story, and every 5
# stars award a Diamond. Same trust model as BALLOON_POP_MILESTONE_DIAMONDS
# above: no server-side tracking of cards opened, the frontend calls this
# once per milestone reached in a play session.
STORIES_GAME_MILESTONE_DIAMONDS = 1


def award_stories_game_diamond(student: StudentProfile) -> None:
    """Same atomic F() update as award_balloon_pop_diamond."""
    StudentProfile.objects.filter(pk=student.pk).update(
        diamond_balance_cache=F('diamond_balance_cache') + STORIES_GAME_MILESTONE_DIAMONDS
    )
    student.refresh_from_db(fields=['diamond_balance_cache'])


def is_item_unlocked(student: StudentProfile, item: AvatarItem) -> bool:
    """Free items are unlocked for everyone; priced ones need a purchase
    record. See docs/core/avatar.md section 2.2."""
    return item.price == 0 or student.unlocked_items.filter(pk=item.pk).exists()


def purchase_avatar_item(student: StudentProfile, item: AvatarItem) -> None:
    """Buys a wardrobe item for `student` — see docs/core/avatar.md section
    2.2. The unlock is recorded on StudentProfile.unlocked_items, which is
    never touched by the equip endpoints, so switching to a different
    companion and back doesn't lose access to anything already paid for.

    The balance check and deduction happen in one conditional UPDATE
    (diamond_balance_cache__gte=item.price) so two concurrent purchase
    requests can't both succeed off a stale in-memory balance — same
    approach as lessons.services._award_completion_diamonds."""
    if is_item_unlocked(student, item):
        raise ItemAlreadyUnlocked()

    updated = StudentProfile.objects.filter(
        pk=student.pk, diamond_balance_cache__gte=item.price
    ).update(diamond_balance_cache=F('diamond_balance_cache') - item.price)
    if updated == 0:
        raise InsufficientDiamonds()

    student.unlocked_items.add(item)
    student.refresh_from_db(fields=['diamond_balance_cache'])
