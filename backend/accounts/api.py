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
from .models import Avatar, AvatarItem, InterfaceMode
from .schemas import (
    AvatarItemOut,
    AvatarOut,
    GoogleLoginIn,
    GoogleLoginOut,
    MeOut,
    UpdateAvatarIn,
    UpdateAvatarItemsIn,
    UpdateInterfaceModeIn,
    UserOut,
)

router = Router(tags=['auth'])


def _avatar_item_out(item: AvatarItem | None, request: HttpRequest) -> AvatarItemOut | None:
    if item is None:
        return None
    image_url = request.build_absolute_uri(item.image.url) if item.image else None
    return AvatarItemOut(id=item.id, slot=item.slot, key=item.key, name=item.name, image=image_url)


def _avatar_out(avatar: Avatar | None, request: HttpRequest) -> AvatarOut | None:
    if avatar is None:
        return None
    image_url = request.build_absolute_uri(avatar.image.url) if avatar.image else None
    items = [_avatar_item_out(item, request) for item in avatar.items.filter(is_active=True)]
    return AvatarOut(id=avatar.id, key=avatar.key, name=avatar.name, image=image_url, items=items)


def _user_out(request: HttpRequest, user) -> UserOut:
    student_profile = getattr(user, 'student_profile', None)
    return UserOut(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        role=user.role,
        locale=user.locale,
        avatar_url=user.avatar_url,
        interface_mode=student_profile.interface_mode if student_profile else None,
        equipped_avatar=_avatar_out(student_profile.equipped_avatar, request) if student_profile else None,
        equipped_clothing=_avatar_item_out(student_profile.equipped_clothing, request) if student_profile else None,
        equipped_headwear=_avatar_item_out(student_profile.equipped_headwear, request) if student_profile else None,
        equipped_accessory=_avatar_item_out(student_profile.equipped_accessory, request) if student_profile else None,
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


@router.get('/avatars', response=list[AvatarOut], auth=CookieOrBearerJWTAuth(), operation_id='list_avatars')
def list_avatars(request: HttpRequest):
    """The companion-character catalog a student can pick from — see
    docs/core/avatar.md. Every active Avatar is available to everyone for
    now; a future per-student unlock table would filter this."""
    return [_avatar_out(a, request) for a in Avatar.objects.filter(is_active=True)]


@router.patch(
    '/me/avatar',
    response=MeOut,
    auth=CookieOrBearerJWTAuth(),
    operation_id='update_avatar',
)
def update_avatar(request: HttpRequest, payload: UpdateAvatarIn):
    """Equips a companion character — see docs/core/avatar.md section 2.1."""
    require_csrf(request)
    student = get_own_student_profile(request)
    avatar = get_object_or_404(Avatar, id=payload.avatar_id, is_active=True)
    student.equipped_avatar = avatar
    student.save(update_fields=['equipped_avatar'])
    return MeOut(user=_user_out(request, request.auth))


def _resolve_slot_item(student, item_id: int | None, slot: str) -> AvatarItem | None:
    if item_id is None:
        return None
    item = get_object_or_404(AvatarItem, id=item_id, slot=slot, is_active=True)
    if item.avatar_id != student.equipped_avatar_id:
        raise HttpError(400, f'{slot} item does not belong to the equipped avatar')
    return item


@router.patch(
    '/me/avatar-items',
    response=MeOut,
    auth=CookieOrBearerJWTAuth(),
    operation_id='update_avatar_items',
)
def update_avatar_items(request: HttpRequest, payload: UpdateAvatarItemsIn):
    """Equips/unequips the wardrobe slots on top of the current
    equipped_avatar — see docs/core/avatar.md section 2.2. Always sends the
    full slot state (see UpdateAvatarItemsIn)."""
    require_csrf(request)
    student = get_own_student_profile(request)
    student.equipped_clothing = _resolve_slot_item(student, payload.clothing_item_id, 'clothing')
    student.equipped_headwear = _resolve_slot_item(student, payload.headwear_item_id, 'headwear')
    student.equipped_accessory = _resolve_slot_item(student, payload.accessory_item_id, 'accessory')
    student.save(update_fields=['equipped_clothing', 'equipped_headwear', 'equipped_accessory'])
    return MeOut(user=_user_out(request, request.auth))
