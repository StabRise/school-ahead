from unittest.mock import patch

import pytest

from accounts.models import (
    Avatar,
    AvatarItem,
    InterfaceMode,
    RefreshToken,
    Role,
    StudentProfile,
    User,
)

pytestmark = pytest.mark.django_db

GOOGLE_CLAIMS = {
    'sub': 'google-uid-123',
    'email': 'student@example.com',
    'given_name': 'Ada',
    'family_name': 'Lovelace',
    'picture': 'https://example.com/avatar.png',
}


def _cookie_value(response, name):
    return response.cookies[name].value


@patch('accounts.services.verify_google_id_token', return_value=GOOGLE_CLAIMS)
def test_google_login_creates_user_and_sets_cookies(mock_verify, api_client):
    response = api_client.post('/auth/google', json={'id_token': 'fake-id-token'})

    assert response.status_code == 200
    assert response.data['user']['email'] == 'student@example.com'
    assert response.data['user']['role'] == Role.STUDENT

    assert User.objects.filter(email='student@example.com').exists()
    assert 'access_token' in response.cookies
    assert 'refresh_token' in response.cookies
    assert 'csrf_token' in response.cookies


@patch('accounts.services.verify_google_id_token', return_value=GOOGLE_CLAIMS)
def test_me_with_cookie(mock_verify, api_client):
    login = api_client.post('/auth/google', json={'id_token': 'fake-id-token'})
    access_token = _cookie_value(login, 'access_token')

    response = api_client.get('/auth/me', COOKIES={'access_token': access_token})

    assert response.status_code == 200
    assert response.data['user']['email'] == 'student@example.com'


@patch('accounts.services.verify_google_id_token', return_value=GOOGLE_CLAIMS)
def test_me_with_bearer_header(mock_verify, api_client):
    login = api_client.post('/auth/google', json={'id_token': 'fake-id-token'})
    access_token = _cookie_value(login, 'access_token')

    response = api_client.get(
        '/auth/me', headers={'Authorization': f'Bearer {access_token}'}
    )

    assert response.status_code == 200
    assert response.data['user']['email'] == 'student@example.com'


@patch('accounts.services.verify_google_id_token', return_value=GOOGLE_CLAIMS)
def test_refresh_rotates_token_and_rejects_reuse(mock_verify, api_client):
    login = api_client.post('/auth/google', json={'id_token': 'fake-id-token'})
    refresh_token = _cookie_value(login, 'refresh_token')
    csrf_token = _cookie_value(login, 'csrf_token')

    assert RefreshToken.objects.count() == 1
    original = RefreshToken.objects.get()

    response = api_client.post(
        '/auth/refresh',
        COOKIES={'refresh_token': refresh_token, 'csrf_token': csrf_token},
        headers={'X-CSRF-Token': csrf_token},
    )
    assert response.status_code == 200

    original.refresh_from_db()
    assert original.is_revoked
    assert RefreshToken.objects.count() == 2

    reuse_response = api_client.post(
        '/auth/refresh',
        COOKIES={'refresh_token': refresh_token, 'csrf_token': csrf_token},
        headers={'X-CSRF-Token': csrf_token},
    )
    assert reuse_response.status_code == 401


@patch('accounts.services.verify_google_id_token', return_value=GOOGLE_CLAIMS)
def test_refresh_without_csrf_header_rejected(mock_verify, api_client):
    login = api_client.post('/auth/google', json={'id_token': 'fake-id-token'})
    refresh_token = _cookie_value(login, 'refresh_token')
    csrf_token = _cookie_value(login, 'csrf_token')

    response = api_client.post(
        '/auth/refresh', COOKIES={'refresh_token': refresh_token, 'csrf_token': csrf_token}
    )
    assert response.status_code == 403


@patch('accounts.services.verify_google_id_token', return_value=GOOGLE_CLAIMS)
def test_logout_revokes_and_clears_cookies(mock_verify, api_client):
    login = api_client.post('/auth/google', json={'id_token': 'fake-id-token'})
    access_token = _cookie_value(login, 'access_token')
    refresh_token = _cookie_value(login, 'refresh_token')
    csrf_token = _cookie_value(login, 'csrf_token')

    response = api_client.post(
        '/auth/logout',
        COOKIES={
            'access_token': access_token,
            'refresh_token': refresh_token,
            'csrf_token': csrf_token,
        },
        headers={'X-CSRF-Token': csrf_token},
    )
    assert response.status_code == 204

    # Logout revokes the refresh token (blocking any future refresh) and
    # instructs the browser to clear cookies, but access_token is a
    # stateless JWT — it remains valid for its own short lifetime even
    # after logout, per docs/architecture/05-auth-flow.md. A real client
    # can no longer authenticate post-logout because the cookie is gone,
    # not because the token itself was blacklisted.
    db_token = RefreshToken.objects.get()
    assert db_token.is_revoked

    refresh_after_logout = api_client.post(
        '/auth/refresh',
        COOKIES={'refresh_token': refresh_token, 'csrf_token': csrf_token},
        headers={'X-CSRF-Token': csrf_token},
    )
    assert refresh_after_logout.status_code == 401

    me_without_cookie = api_client.get('/auth/me')
    assert me_without_cookie.status_code == 401


def test_me_interface_mode_defaults_to_default_for_students(api_client, auth_header):
    user = User.objects.create_user(email='student@example.com', role=Role.STUDENT)
    StudentProfile.objects.create(user=user)

    response = api_client.get('/auth/me', headers=auth_header(user))

    assert response.status_code == 200
    assert response.data['user']['interface_mode'] == InterfaceMode.DEFAULT


def test_me_interface_mode_is_null_for_non_students(api_client, auth_header):
    user = User.objects.create_user(email='tutor@example.com', role=Role.TUTOR)

    response = api_client.get('/auth/me', headers=auth_header(user))

    assert response.status_code == 200
    assert response.data['user']['interface_mode'] is None


def test_update_interface_mode_persists_and_returns_updated_user(api_client, auth_header):
    user = User.objects.create_user(email='student@example.com', role=Role.STUDENT)
    student = StudentProfile.objects.create(user=user)

    response = api_client.patch(
        '/auth/me/interface-mode',
        json={'interface_mode': InterfaceMode.PRESCHOOL},
        headers=auth_header(user),
    )

    assert response.status_code == 200
    assert response.data['user']['interface_mode'] == InterfaceMode.PRESCHOOL
    student.refresh_from_db()
    assert student.interface_mode == InterfaceMode.PRESCHOOL


def test_update_interface_mode_rejects_invalid_value(api_client, auth_header):
    user = User.objects.create_user(email='student@example.com', role=Role.STUDENT)
    StudentProfile.objects.create(user=user)

    response = api_client.patch(
        '/auth/me/interface-mode',
        json={'interface_mode': 'space-adventure'},
        headers=auth_header(user),
    )

    assert response.status_code == 400


def test_update_interface_mode_requires_student_profile(api_client, auth_header):
    user = User.objects.create_user(email='tutor@example.com', role=Role.TUTOR)

    response = api_client.patch(
        '/auth/me/interface-mode',
        json={'interface_mode': InterfaceMode.PRESCHOOL},
        headers=auth_header(user),
    )

    assert response.status_code == 403


def test_list_avatars_returns_only_active_ones(api_client, auth_header):
    # Note: the seed migration (0005_seed_avatars) already ships a handful
    # of active avatars, so this only asserts on the two rows it adds.
    user = User.objects.create_user(email='student@example.com', role=Role.STUDENT)
    StudentProfile.objects.create(user=user)
    active = Avatar.objects.create(key='test-active-avatar', name='Active')
    Avatar.objects.create(key='test-inactive-avatar', name='Inactive', is_active=False)

    response = api_client.get('/auth/avatars', headers=auth_header(user))

    assert response.status_code == 200
    keys = [a['key'] for a in response.data]
    assert 'test-active-avatar' in keys
    assert 'test-inactive-avatar' not in keys
    assert next(a for a in response.data if a['key'] == 'test-active-avatar')['id'] == active.id


def test_me_equipped_avatar_is_null_until_chosen(api_client, auth_header):
    user = User.objects.create_user(email='student@example.com', role=Role.STUDENT)
    StudentProfile.objects.create(user=user)

    response = api_client.get('/auth/me', headers=auth_header(user))

    assert response.status_code == 200
    assert response.data['user']['equipped_avatar'] is None


def test_update_avatar_persists_and_returns_it(api_client, auth_header):
    user = User.objects.create_user(email='student@example.com', role=Role.STUDENT)
    student = StudentProfile.objects.create(user=user)
    avatar = Avatar.objects.create(key='test-fox', name='Fox')

    response = api_client.patch(
        '/auth/me/avatar', json={'avatar_id': avatar.id}, headers=auth_header(user),
    )

    assert response.status_code == 200
    assert response.data['user']['equipped_avatar']['key'] == 'test-fox'
    student.refresh_from_db()
    assert student.equipped_avatar_id == avatar.id


def test_update_avatar_unequips_on_null_avatar_id(api_client, auth_header):
    user = User.objects.create_user(email='student@example.com', role=Role.STUDENT)
    avatar = Avatar.objects.create(key='test-fox-3', name='Fox')
    student = StudentProfile.objects.create(user=user, equipped_avatar=avatar)

    response = api_client.patch(
        '/auth/me/avatar', json={'avatar_id': None}, headers=auth_header(user),
    )

    assert response.status_code == 200
    assert response.data['user']['equipped_avatar'] is None
    student.refresh_from_db()
    assert student.equipped_avatar_id is None


def test_update_avatar_rejects_inactive_avatar(api_client, auth_header):
    user = User.objects.create_user(email='student@example.com', role=Role.STUDENT)
    StudentProfile.objects.create(user=user)
    avatar = Avatar.objects.create(key='retired', name='Retired', is_active=False)

    response = api_client.patch(
        '/auth/me/avatar', json={'avatar_id': avatar.id}, headers=auth_header(user),
    )

    assert response.status_code == 404


def test_update_avatar_requires_student_profile(api_client, auth_header):
    user = User.objects.create_user(email='tutor@example.com', role=Role.TUTOR)
    avatar = Avatar.objects.create(key='test-fox-2', name='Fox')

    response = api_client.patch(
        '/auth/me/avatar', json={'avatar_id': avatar.id}, headers=auth_header(user),
    )

    assert response.status_code == 403


@patch('accounts.services.verify_google_id_token', return_value=GOOGLE_CLAIMS)
def test_logout_via_bearer_exempt_from_csrf(mock_verify, api_client):
    login = api_client.post('/auth/google', json={'id_token': 'fake-id-token'})
    access_token = _cookie_value(login, 'access_token')
    refresh_token = _cookie_value(login, 'refresh_token')

    response = api_client.post(
        '/auth/logout',
        COOKIES={'refresh_token': refresh_token},
        headers={'Authorization': f'Bearer {access_token}'},
    )
    assert response.status_code == 204


def _make_student_with_avatar(diamonds=0):
    user = User.objects.create_user(email='shopper@example.com', role=Role.STUDENT)
    avatar = Avatar.objects.create(key='test-shop-avatar', name='Shop Avatar')
    student = StudentProfile.objects.create(
        user=user, equipped_avatar=avatar, diamond_balance_cache=diamonds
    )
    return user, student, avatar


def test_purchase_avatar_item_deducts_diamonds_and_unlocks(api_client, auth_header):
    user, student, avatar = _make_student_with_avatar(diamonds=50)
    item = AvatarItem.objects.create(avatar=avatar, slot='clothing', key='jacket', name='Jacket', price=30)

    response = api_client.post(f'/auth/me/avatar-items/{item.id}/purchase', headers=auth_header(user))

    assert response.status_code == 200
    assert response.data['user']['diamond_balance'] == 20
    student.refresh_from_db()
    assert student.unlocked_items.filter(pk=item.pk).exists()


def test_purchase_avatar_item_rejects_insufficient_balance(api_client, auth_header):
    user, student, avatar = _make_student_with_avatar(diamonds=10)
    item = AvatarItem.objects.create(avatar=avatar, slot='clothing', key='jacket', name='Jacket', price=30)

    response = api_client.post(f'/auth/me/avatar-items/{item.id}/purchase', headers=auth_header(user))

    assert response.status_code == 402
    student.refresh_from_db()
    assert student.diamond_balance_cache == 10
    assert not student.unlocked_items.filter(pk=item.pk).exists()


def test_purchase_avatar_item_rejects_already_unlocked(api_client, auth_header):
    user, student, avatar = _make_student_with_avatar(diamonds=100)
    item = AvatarItem.objects.create(avatar=avatar, slot='clothing', key='jacket', name='Jacket', price=30)
    student.unlocked_items.add(item)

    response = api_client.post(f'/auth/me/avatar-items/{item.id}/purchase', headers=auth_header(user))

    assert response.status_code == 409


def test_free_item_is_always_unlocked_without_purchase(api_client, auth_header):
    user, student, avatar = _make_student_with_avatar(diamonds=0)
    item = AvatarItem.objects.create(avatar=avatar, slot='headwear', key='cap', name='Cap', price=0)

    response = api_client.patch(
        '/auth/me/avatar-items', json={'headwear_item_ids': [item.id]}, headers=auth_header(user),
    )

    assert response.status_code == 200
    assert [i['key'] for i in response.data['user']['equipped_headwear_items']] == ['cap']


def test_equip_priced_item_requires_purchase_first(api_client, auth_header):
    user, student, avatar = _make_student_with_avatar(diamonds=100)
    item = AvatarItem.objects.create(avatar=avatar, slot='headwear', key='top-hat', name='Top Hat', price=30)

    response = api_client.patch(
        '/auth/me/avatar-items', json={'headwear_item_ids': [item.id]}, headers=auth_header(user),
    )
    assert response.status_code == 403

    purchase = api_client.post(f'/auth/me/avatar-items/{item.id}/purchase', headers=auth_header(user))
    assert purchase.status_code == 200

    equip = api_client.patch(
        '/auth/me/avatar-items', json={'headwear_item_ids': [item.id]}, headers=auth_header(user),
    )
    assert equip.status_code == 200
    assert [i['key'] for i in equip.data['user']['equipped_headwear_items']] == ['top-hat']


def test_unlocked_item_survives_switching_avatar_and_back(api_client, auth_header):
    """The exact scenario from docs/core/avatar.md section 2.2: a purchased
    item must stay available even after equipping a different companion and
    then switching back to the original one."""
    user, student, avatar = _make_student_with_avatar(diamonds=100)
    other_avatar = Avatar.objects.create(key='test-other-avatar', name='Other Avatar')
    item = AvatarItem.objects.create(avatar=avatar, slot='clothing', key='jacket', name='Jacket', price=30)

    api_client.post(f'/auth/me/avatar-items/{item.id}/purchase', headers=auth_header(user))
    api_client.patch('/auth/me/avatar-items', json={'clothing_item_ids': [item.id]}, headers=auth_header(user))

    # Switch away — the wardrobe clears (it belongs to the old avatar)...
    switch_away = api_client.patch(
        '/auth/me/avatar', json={'avatar_id': other_avatar.id}, headers=auth_header(user),
    )
    assert switch_away.status_code == 200
    assert switch_away.data['user']['equipped_clothing_items'] == []

    # ...and switch back: the item is still unlocked and equippable again,
    # without paying for it a second time.
    switch_back = api_client.patch(
        '/auth/me/avatar', json={'avatar_id': avatar.id}, headers=auth_header(user),
    )
    assert switch_back.status_code == 200

    re_equip = api_client.patch(
        '/auth/me/avatar-items', json={'clothing_item_ids': [item.id]}, headers=auth_header(user),
    )
    assert re_equip.status_code == 200
    assert [i['key'] for i in re_equip.data['user']['equipped_clothing_items']] == ['jacket']

    student.refresh_from_db()
    assert student.diamond_balance_cache == 70


def test_multiple_headwear_and_accessories_equip_together_sorted_by_layer_order(api_client, auth_header):
    user, student, avatar = _make_student_with_avatar(diamonds=0)
    beanie = AvatarItem.objects.create(
        avatar=avatar, slot='headwear', key='beanie', name='Beanie', layer_order=0
    )
    flower_crown = AvatarItem.objects.create(
        avatar=avatar, slot='headwear', key='flower-crown', name='Flower Crown', layer_order=1
    )
    glasses = AvatarItem.objects.create(
        avatar=avatar, slot='accessory', key='glasses', name='Glasses', layer_order=0
    )
    backpack = AvatarItem.objects.create(
        avatar=avatar, slot='accessory', key='backpack', name='Backpack', layer_order=1
    )

    response = api_client.patch(
        '/auth/me/avatar-items',
        json={
            'headwear_item_ids': [flower_crown.id, beanie.id],
            'accessory_item_ids': [backpack.id, glasses.id],
        },
        headers=auth_header(user),
    )

    assert response.status_code == 200
    assert [i['key'] for i in response.data['user']['equipped_headwear_items']] == ['beanie', 'flower-crown']
    assert [i['key'] for i in response.data['user']['equipped_accessory_items']] == ['glasses', 'backpack']


def test_reward_balloon_pop_awards_one_diamond(api_client, auth_header):
    user, student, _avatar = _make_student_with_avatar(diamonds=5)

    response = api_client.post('/auth/me/balloon-pop-reward', headers=auth_header(user))

    assert response.status_code == 200
    assert response.data['user']['diamond_balance'] == 6
    student.refresh_from_db()
    assert student.diamond_balance_cache == 6


def test_reward_balloon_pop_can_be_awarded_repeatedly(api_client, auth_header):
    """No server-side tracking of balloons popped (see accounts.services.
    award_balloon_pop_diamond) — every call adds another Diamond, trusting
    the frontend to only call this once per DIAMOND_MILESTONE reached."""
    user, student, _avatar = _make_student_with_avatar(diamonds=0)

    api_client.post('/auth/me/balloon-pop-reward', headers=auth_header(user))
    response = api_client.post('/auth/me/balloon-pop-reward', headers=auth_header(user))

    assert response.status_code == 200
    assert response.data['user']['diamond_balance'] == 2
    student.refresh_from_db()
    assert student.diamond_balance_cache == 2


def test_reward_balloon_quiz_awards_one_diamond(api_client, auth_header):
    user, student, _avatar = _make_student_with_avatar(diamonds=5)

    response = api_client.post('/auth/me/balloon-quiz-reward', headers=auth_header(user))

    assert response.status_code == 200
    assert response.data['user']['diamond_balance'] == 6
    student.refresh_from_db()
    assert student.diamond_balance_cache == 6


def test_reward_reading_game_awards_one_diamond(api_client, auth_header):
    user, student, _avatar = _make_student_with_avatar(diamonds=5)

    response = api_client.post('/auth/me/reading-game-reward', headers=auth_header(user))

    assert response.status_code == 200
    assert response.data['user']['diamond_balance'] == 6
    student.refresh_from_db()
    assert student.diamond_balance_cache == 6


def test_reward_reading_game_can_be_awarded_repeatedly(api_client, auth_header):
    """No server-side tracking of levels cleared (see accounts.services.
    award_reading_game_diamond) — every call adds another Diamond, trusting
    the frontend to only call this once per consonant level cleared."""
    user, student, _avatar = _make_student_with_avatar(diamonds=0)

    api_client.post('/auth/me/reading-game-reward', headers=auth_header(user))
    response = api_client.post('/auth/me/reading-game-reward', headers=auth_header(user))

    assert response.status_code == 200
    assert response.data['user']['diamond_balance'] == 2
    student.refresh_from_db()
    assert student.diamond_balance_cache == 2
