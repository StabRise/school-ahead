from django.conf import settings
from django.http import HttpRequest, HttpResponse
from django.shortcuts import get_object_or_404
from ninja import Router
from ninja.errors import HttpError

from common.auth import CookieOrBearerJWTAuth
from common.csrf import require_csrf
from common.permissions import get_own_student_profile

from . import services
from .cookies import clear_auth_cookies, set_auth_cookies
from .models import Avatar, AvatarItem, InterfaceMode, TranslationScope
from .schemas import (
    AvatarItemOut,
    AvatarOut,
    GoogleLoginIn,
    GoogleLoginOut,
    MeOut,
    UpdateAvatarIn,
    UpdateAvatarItemsIn,
    UpdateInterfaceModeIn,
    UpdateTranslationSettingsIn,
    UserOut,
)

router = Router(tags=['auth'])


def _avatar_item_out(
    item: AvatarItem | None, request: HttpRequest, unlocked_ids: set[int] | None
) -> AvatarItemOut | None:
    if item is None:
        return None
    image_url = request.build_absolute_uri(item.image.url) if item.image else None
    # unlocked_ids is None for a viewer with no shop-gating concept (no
    # StudentProfile) — everything reads as unlocked. Otherwise gated by
    # accounts.services.is_item_unlocked's rule, inlined here since we
    # already have the id set precomputed for the whole response.
    is_unlocked = unlocked_ids is None or item.price == 0 or item.id in unlocked_ids
    return AvatarItemOut(
        id=item.id,
        slot=item.slot,
        key=item.key,
        name=item.name,
        image=image_url,
        scale=item.scale,
        offset_x=item.offset_x,
        offset_y=item.offset_y,
        layer_order=item.layer_order,
        price=item.price,
        is_unlocked=is_unlocked,
    )


def _avatar_out(avatar: Avatar | None, request: HttpRequest, unlocked_ids: set[int] | None) -> AvatarOut | None:
    if avatar is None:
        return None
    image_url = request.build_absolute_uri(avatar.image.url) if avatar.image else None
    items = [_avatar_item_out(item, request, unlocked_ids) for item in avatar.items.filter(is_active=True)]
    return AvatarOut(id=avatar.id, key=avatar.key, name=avatar.name, image=image_url, scale=avatar.scale, items=items)


def _equipped_items_out(student_profile, field_name: str, request: HttpRequest, unlocked_ids) -> list[AvatarItemOut]:
    manager = getattr(student_profile, field_name)
    items = manager.filter(is_active=True).order_by('layer_order', 'id')
    return [_avatar_item_out(item, request, unlocked_ids) for item in items]


def _user_out(request: HttpRequest, user) -> UserOut:
    student_profile = getattr(user, 'student_profile', None)
    unlocked_ids = (
        set(student_profile.unlocked_items.values_list('id', flat=True)) if student_profile else None
    )
    return UserOut(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        role=user.role,
        locale=user.locale,
        avatar_url=user.avatar_url,
        interface_mode=student_profile.interface_mode if student_profile else None,
        translation_scope=student_profile.translation_scope if student_profile else None,
        translate_on_select=student_profile.translate_on_select if student_profile else None,
        equipped_avatar=_avatar_out(student_profile.equipped_avatar, request, unlocked_ids) if student_profile else None,
        equipped_clothing_items=_equipped_items_out(student_profile, 'equipped_clothing_items', request, unlocked_ids)
        if student_profile
        else [],
        equipped_headwear_items=_equipped_items_out(student_profile, 'equipped_headwear_items', request, unlocked_ids)
        if student_profile
        else [],
        equipped_accessory_items=_equipped_items_out(student_profile, 'equipped_accessory_items', request, unlocked_ids)
        if student_profile
        else [],
        diamond_balance=student_profile.diamond_balance_cache if student_profile else None,
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

    return GoogleLoginOut(user=_user_out(request, user))


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
    return MeOut(user=_user_out(request, request.auth))


@router.patch(
    '/me/interface-mode',
    response=MeOut,
    auth=CookieOrBearerJWTAuth(),
    operation_id='update_interface_mode',
)
def update_interface_mode(request: HttpRequest, payload: UpdateInterfaceModeIn):
    """Toggles the Default/Preschool view switch — see
    docs/interfaces/preschool.md."""
    require_csrf(request)
    if payload.interface_mode not in InterfaceMode.values:
        raise HttpError(400, 'Invalid interface_mode')

    student = get_own_student_profile(request)
    student.interface_mode = payload.interface_mode
    student.save(update_fields=['interface_mode'])
    return MeOut(user=_user_out(request, request.auth))


@router.patch(
    '/me/translation-settings',
    response=MeOut,
    auth=CookieOrBearerJWTAuth(),
    operation_id='update_translation_settings',
)
def update_translation_settings(request: HttpRequest, payload: UpdateTranslationSettingsIn):
    """Persists the read-along "Перекласти" feature's settings (see the
    Profile page's "Переклад Матеріалів" section): whether a translation
    covers the whole sentence or just the selected word, and whether it
    happens automatically on selection or needs the explicit button."""
    require_csrf(request)
    if payload.translation_scope not in TranslationScope.values:
        raise HttpError(400, 'Invalid translation_scope')

    student = get_own_student_profile(request)
    student.translation_scope = payload.translation_scope
    student.translate_on_select = payload.translate_on_select
    student.save(update_fields=['translation_scope', 'translate_on_select'])
    return MeOut(user=_user_out(request, request.auth))


@router.get('/avatars', response=list[AvatarOut], auth=CookieOrBearerJWTAuth(), operation_id='list_avatars')
def list_avatars(request: HttpRequest):
    """The companion-character catalog a student can pick from — see
    docs/core/avatar.md. Every active Avatar is available to everyone for
    now (only its wardrobe items are shop-gated); a future per-student
    unlock table would filter the avatars themselves too."""
    student_profile = getattr(request.auth, 'student_profile', None)
    unlocked_ids = (
        set(student_profile.unlocked_items.values_list('id', flat=True)) if student_profile else None
    )
    return [_avatar_out(a, request, unlocked_ids) for a in Avatar.objects.filter(is_active=True)]


@router.patch(
    '/me/avatar',
    response=MeOut,
    auth=CookieOrBearerJWTAuth(),
    operation_id='update_avatar',
)
def update_avatar(request: HttpRequest, payload: UpdateAvatarIn):
    """Equips a companion character, or unequips it entirely when avatar_id
    is null (the frontend then falls back to the Google account picture, or
    initials if there isn't one — see components/header.tsx) — see
    docs/core/avatar.md section 2.1. Clears the wardrobe either way:
    equipped clothing/headwear/accessory belong to the previous avatar's
    catalog and wouldn't make sense on the new body (or on no body at all).
    This only unequips them — purchased items stay in unlocked_items and are
    equippable again the moment the student switches back."""
    require_csrf(request)
    student = get_own_student_profile(request)
    if payload.avatar_id is None:
        student.equipped_avatar = None
    else:
        student.equipped_avatar = get_object_or_404(Avatar, id=payload.avatar_id, is_active=True)
    student.save(update_fields=['equipped_avatar'])
    student.equipped_clothing_items.clear()
    student.equipped_headwear_items.clear()
    student.equipped_accessory_items.clear()
    return MeOut(user=_user_out(request, request.auth))


def _resolve_slot_items(student, item_ids: list[int], slot: str) -> list[AvatarItem]:
    items = list(AvatarItem.objects.filter(id__in=item_ids, slot=slot, is_active=True))
    found_ids = {item.id for item in items}
    missing = set(item_ids) - found_ids
    if missing:
        raise HttpError(404, f'{slot} item(s) not found: {sorted(missing)}')
    if any(item.avatar_id != student.equipped_avatar_id for item in items):
        raise HttpError(400, f'{slot} item does not belong to the equipped avatar')
    if any(not services.is_item_unlocked(student, item) for item in items):
        raise HttpError(403, f'{slot} item is not unlocked — purchase it first')
    return items


@router.patch(
    '/me/avatar-items',
    response=MeOut,
    auth=CookieOrBearerJWTAuth(),
    operation_id='update_avatar_items',
)
def update_avatar_items(request: HttpRequest, payload: UpdateAvatarItemsIn):
    """Equips/unequips the wardrobe on top of the current equipped_avatar —
    see docs/core/avatar.md section 2.2. Always sends the full wardrobe state
    (see UpdateAvatarItemsIn): every slot can hold several pieces worn
    together at once, stacked by AvatarItem.layer_order. Every item must
    already be unlocked (free, or bought via POST .../purchase)."""
    require_csrf(request)
    student = get_own_student_profile(request)
    student.equipped_clothing_items.set(_resolve_slot_items(student, payload.clothing_item_ids, 'clothing'))
    student.equipped_headwear_items.set(_resolve_slot_items(student, payload.headwear_item_ids, 'headwear'))
    student.equipped_accessory_items.set(_resolve_slot_items(student, payload.accessory_item_ids, 'accessory'))
    return MeOut(user=_user_out(request, request.auth))


@router.post(
    '/me/avatar-items/{item_id}/purchase',
    response=MeOut,
    auth=CookieOrBearerJWTAuth(),
    operation_id='purchase_avatar_item',
)
def purchase_avatar_item(request: HttpRequest, item_id: int):
    """Buys a wardrobe item with Diamonds — see docs/core/avatar.md section
    2.2. Unlocks persist independent of equipped_avatar (accounts.services.
    purchase_avatar_item), so switching companions and back never loses
    something already paid for. 409 if already unlocked, 402 if the
    student's diamond_balance_cache can't cover the price (the frontend
    shows the "earn more Diamonds" prompt the doc calls for)."""
    require_csrf(request)
    student = get_own_student_profile(request)
    item = get_object_or_404(AvatarItem, id=item_id, is_active=True)
    try:
        services.purchase_avatar_item(student, item)
    except services.ItemAlreadyUnlocked as exc:
        raise HttpError(409, 'Item already unlocked') from exc
    except services.InsufficientDiamonds as exc:
        raise HttpError(402, 'Not enough Diamonds') from exc
    return MeOut(user=_user_out(request, request.auth))


@router.post(
    '/me/balloon-pop-reward',
    response=MeOut,
    auth=CookieOrBearerJWTAuth(),
    operation_id='reward_balloon_pop',
)
def reward_balloon_pop(request: HttpRequest):
    """Awards a Diamond for reaching the balloon-pop minigame's 100-balloon
    milestone (frontend/components/preschool/balloon-pop-game.tsx). See
    accounts.services.award_balloon_pop_diamond for the trust model."""
    require_csrf(request)
    student = get_own_student_profile(request)
    services.award_balloon_pop_diamond(student)
    return MeOut(user=_user_out(request, request.auth))


@router.post(
    '/me/balloon-quiz-reward',
    response=MeOut,
    auth=CookieOrBearerJWTAuth(),
    operation_id='reward_balloon_quiz',
)
def reward_balloon_quiz(request: HttpRequest):
    """Awards a Diamond for passing the balloon-pop minigame's bonus "?"
    heart-balloon quiz (frontend/components/preschool/balloon-quiz.tsx). See
    accounts.services.award_balloon_quiz_diamond for the trust model."""
    require_csrf(request)
    student = get_own_student_profile(request)
    services.award_balloon_quiz_diamond(student)
    return MeOut(user=_user_out(request, request.auth))


@router.post(
    '/me/reading-game-reward',
    response=MeOut,
    auth=CookieOrBearerJWTAuth(),
    operation_id='reward_reading_game',
)
def reward_reading_game(request: HttpRequest):
    """Awards a Diamond for clearing a consonant level of the reading
    minigame (frontend/components/preschool/reading-game.tsx). See
    accounts.services.award_reading_game_diamond for the trust model."""
    require_csrf(request)
    student = get_own_student_profile(request)
    services.award_reading_game_diamond(student)
    return MeOut(user=_user_out(request, request.auth))


@router.post(
    '/me/trains-game-reward',
    response=MeOut,
    auth=CookieOrBearerJWTAuth(),
    operation_id='reward_trains_game',
)
def reward_trains_game(request: HttpRequest):
    """Awards a Diamond for the trains minigame's 10-letter milestone
    (frontend/components/preschool/trains-game.tsx). See
    accounts.services.award_trains_game_diamond for the trust model."""
    require_csrf(request)
    student = get_own_student_profile(request)
    services.award_trains_game_diamond(student)
    return MeOut(user=_user_out(request, request.auth))


@router.post(
    '/me/stories-game-reward',
    response=MeOut,
    auth=CookieOrBearerJWTAuth(),
    operation_id='reward_stories_game',
)
def reward_stories_game(request: HttpRequest):
    """Awards a Diamond for the "Казки" minigame's 5-star milestone
    (frontend/components/preschool/stories-game.tsx). See
    accounts.services.award_stories_game_diamond for the trust model."""
    require_csrf(request)
    student = get_own_student_profile(request)
    services.award_stories_game_diamond(student)
    return MeOut(user=_user_out(request, request.auth))
