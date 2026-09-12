from django.conf import settings
from django.db.models import F
from django.http import HttpRequest
from django.utils import timezone
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from ninja_jwt.exceptions import TokenError
from ninja_jwt.tokens import AccessToken
from ninja_jwt.tokens import RefreshToken as JWTRefreshToken

from .models import (
    Avatar,
    AvatarItem,
    EquippedItemOrder,
    EquippedItemPlacement,
    RefreshToken,
    Role,
    SocialAccount,
    StudentProfile,
    User,
)
from .schemas import AvatarItemOut, AvatarOut

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


# Diamond reward for the "Картки" (Cards) minigame's 10-star milestone (see
# frontend/packages/preschool-games/src/cards-game.tsx's CardsFallingGame) —
# a star is earned each time a student taps the falling card matching the
# announced target syllable, and every 10 stars award a Diamond. Same trust
# model as BALLOON_POP_MILESTONE_DIAMONDS above: no server-side tracking of
# matches, the frontend calls this once per milestone reached in a play
# session.
CARDS_GAME_MILESTONE_DIAMONDS = 1


def award_cards_game_diamond(student: StudentProfile) -> None:
    """Same atomic F() update as award_balloon_pop_diamond."""
    StudentProfile.objects.filter(pk=student.pk).update(
        diamond_balance_cache=F('diamond_balance_cache') + CARDS_GAME_MILESTONE_DIAMONDS
    )
    student.refresh_from_db(fields=['diamond_balance_cache'])


# Diamond reward for the multiplication-table minigame (see
# frontend/packages/preschool-games/src/multiplication-game.tsx) — awarded
# once for successfully finishing every question of a session with at
# least one life remaining. Same trust model as BALLOON_POP_MILESTONE_DIAMONDS
# above: no server-side tracking of the run, the frontend calls this once
# per completed session.
MULTIPLICATION_GAME_MILESTONE_DIAMONDS = 1


def award_multiplication_game_diamond(student: StudentProfile) -> None:
    """Same atomic F() update as award_balloon_pop_diamond."""
    StudentProfile.objects.filter(pk=student.pk).update(
        diamond_balance_cache=F('diamond_balance_cache') + MULTIPLICATION_GAME_MILESTONE_DIAMONDS
    )
    student.refresh_from_db(fields=['diamond_balance_cache'])


# Diamond reward for the "Jumping Frogs" minigame (see
# frontend/packages/preschool-games/src/jumping-frogs-game.tsx) — awarded
# once per lily-pad level cleared, repeatable all game long (same "count"
# milestone shape as CARDS_GAME_MILESTONE_DIAMONDS above, not a one-shot
# "finish the session" reward like MULTIPLICATION_GAME_MILESTONE_DIAMONDS).
# Same trust model as every other minigame reward: no server-side tracking
# of the run, the frontend calls this once per level cleared.
JUMPING_FROGS_MILESTONE_DIAMONDS = 1


def award_jumping_frogs_diamond(student: StudentProfile) -> None:
    """Same atomic F() update as award_balloon_pop_diamond."""
    StudentProfile.objects.filter(pk=student.pk).update(
        diamond_balance_cache=F('diamond_balance_cache') + JUMPING_FROGS_MILESTONE_DIAMONDS
    )
    student.refresh_from_db(fields=['diamond_balance_cache'])


def is_item_unlocked(student: StudentProfile, item: AvatarItem) -> bool:
    """Free items are unlocked for everyone; priced ones need a purchase
    record. See docs/core/avatar.md section 2.2."""
    return item.price == 0 or student.unlocked_items.filter(pk=item.pk).exists()


def avatar_item_out(
    item: AvatarItem | None,
    request: HttpRequest,
    unlocked_ids: set[int] | None,
    placement: tuple[float, float, float, float] | None = None,
    layer_order_override: int | None = None,
) -> AvatarItemOut | None:
    if item is None:
        return None
    image_url = request.build_absolute_uri(item.image.url) if item.image else None
    # unlocked_ids is None for a viewer with no shop-gating concept (no
    # StudentProfile) — everything reads as unlocked. Otherwise gated by
    # is_item_unlocked's rule, inlined here since we already have the id set
    # precomputed for the whole response.
    is_unlocked = unlocked_ids is None or item.price == 0 or item.id in unlocked_ids
    # placement is the requesting student's own EquippedItemPlacement
    # override for this item, if any — see equipped_items_out. Never set for
    # catalog items (avatar_out), only for a student's own equipped items, so
    # anyone else's view of this student's avatar always falls back to the
    # tutor-configured position/size below.
    offset_x, offset_y, rotation, scale = (
        placement if placement is not None else (item.offset_x, item.offset_y, 0.0, item.scale)
    )
    return AvatarItemOut(
        id=item.id,
        slot=item.slot,
        key=item.key,
        name=item.name,
        image=image_url,
        scale=scale,
        offset_x=offset_x,
        offset_y=offset_y,
        rotation=rotation,
        layer_order=layer_order_override if layer_order_override is not None else item.layer_order,
        price=item.price,
        is_unlocked=is_unlocked,
    )


def avatar_out(avatar: Avatar | None, request: HttpRequest, unlocked_ids: set[int] | None) -> AvatarOut | None:
    if avatar is None:
        return None
    image_url = request.build_absolute_uri(avatar.image.url) if avatar.image else None
    items = [avatar_item_out(item, request, unlocked_ids) for item in avatar.items.filter(is_active=True)]
    return AvatarOut(id=avatar.id, key=avatar.key, name=avatar.name, image=image_url, scale=avatar.scale, items=items)


# Default cross-slot draw order (see equipped_items_out) for an item with no
# EquippedItemOrder override yet — reproduces the old fixed stack (clothing
# under headwear under accessory) so a student who's never touched the
# global reorder UI sees no visual change at all.
EQUIPPED_SLOT_PRIORITY = {'clothing': 0, 'headwear': 1, 'accessory': 2}


def equipped_items_out(
    student_profile: StudentProfile, request: HttpRequest, unlocked_ids: set[int] | None
) -> dict[str, list[AvatarItemOut]]:
    """All three wardrobe slots' currently-equipped items at once (not one
    slot at a time — computing this together is what lets stacking order be
    global across slots), keyed by slot ('clothing'/'headwear'/'accessory').
    Each item's `layer_order` in the response is replaced by its *effective*
    global rank (student's own EquippedItemOrder override if any, else
    EQUIPPED_SLOT_PRIORITY-then-catalog-layer_order-then-id) so
    packages/preschool-ui's useEquippedAvatarLayers can merge all three
    lists back into one true stacking order for rendering, instead of just
    concatenating them slot-by-slot."""
    fields = {
        'clothing': 'equipped_clothing_items',
        'headwear': 'equipped_headwear_items',
        'accessory': 'equipped_accessory_items',
    }
    items_by_slot = {slot: list(getattr(student_profile, field).filter(is_active=True)) for slot, field in fields.items()}
    all_items = [item for items in items_by_slot.values() for item in items]

    default_ordered = sorted(all_items, key=lambda item: (EQUIPPED_SLOT_PRIORITY[item.slot], item.layer_order, item.id))
    default_rank = {item.id: index for index, item in enumerate(default_ordered)}
    custom_order = dict(student_profile.item_orders.values_list('item_id', 'order'))
    effective_order = {item.id: custom_order.get(item.id, default_rank[item.id]) for item in all_items}

    # A student's own move/rotate/resize override (EquippedItemPlacement), if
    # any — see avatar_item_out and docs/core/avatar.md section 2.2.
    placements = {
        item_id: (offset_x, offset_y, rotation, scale)
        for item_id, offset_x, offset_y, rotation, scale in student_profile.item_placements.values_list(
            'item_id', 'offset_x', 'offset_y', 'rotation', 'scale'
        )
    }

    return {
        slot: [
            avatar_item_out(item, request, unlocked_ids, placements.get(item.id), effective_order[item.id])
            for item in sorted(items, key=lambda item: (effective_order[item.id], item.id))
        ]
        for slot, items in items_by_slot.items()
    }


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


def save_equipped_item_order(student: StudentProfile, item_ids: list[int]) -> None:
    """Persists the student's own global stacking-order override — one flat
    list spanning every slot, from PATCH /me/avatar-items/order — see
    EquippedItemOrder and accounts.api.update_avatar_item_order. Same
    "always replace with the full state" contract as UpdateAvatarItemsIn:
    fully replaces this student's previous overrides rather than diffing
    against them. A separate action from equipping/unequipping
    (update_avatar_items no longer touches this table at all)."""
    student.item_orders.all().delete()
    rows = [EquippedItemOrder(student_profile=student, item_id=item_id, order=index) for index, item_id in enumerate(item_ids)]
    EquippedItemOrder.objects.bulk_create(rows)


def save_item_placement(
    student: StudentProfile, item: AvatarItem, offset_x: float, offset_y: float, rotation: float, scale: float
) -> None:
    """Persists a student's own move/rotate/resize override for one equipped
    item — see EquippedItemPlacement and accounts.api.
    update_avatar_item_placement. Unlike save_equipped_item_order above,
    this touches only the one item being moved, not the whole table: a
    placement must survive unrelated equip/unequip/reorder actions."""
    EquippedItemPlacement.objects.update_or_create(
        student_profile=student,
        item=item,
        defaults={'offset_x': offset_x, 'offset_y': offset_y, 'rotation': rotation, 'scale': scale},
    )


def clear_item_placement(student: StudentProfile, item: AvatarItem) -> None:
    """Resets one item back to the tutor-configured default position — see
    accounts.api.reset_avatar_item_placement."""
    student.item_placements.filter(item=item).delete()
