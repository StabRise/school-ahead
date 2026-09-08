import pytest

from accounts.models import Role, StudentProfile, User
from house.models import FurnitureItem, FurniturePurchase, PlacedFurnitureItem

pytestmark = pytest.mark.django_db


def _make_student(diamonds=0):
    user = User.objects.create_user(email='shopper@example.com', role=Role.STUDENT)
    student = StudentProfile.objects.create(user=user, diamond_balance_cache=diamonds)
    return user, student


def _make_item(price=25):
    return FurnitureItem.objects.create(
        key='sofa', name='Sofa', model_file='sofa.obj', thumbnail_image='sofa.png', price=price
    )


def test_purchase_deducts_diamonds_without_placing_item(api_client, auth_header):
    user, student = _make_student(diamonds=50)
    item = _make_item(price=25)

    response = api_client.post(f'/house/furniture/{item.id}/purchase', headers=auth_header(user))

    assert response.status_code == 200
    assert response.data['is_owned'] is True
    assert response.data['placement'] is None
    student.refresh_from_db()
    assert student.diamond_balance_cache == 25
    assert FurniturePurchase.objects.filter(student_profile=student, item=item).exists()
    assert not PlacedFurnitureItem.objects.filter(student_profile=student, item=item).exists()


def test_place_item_after_purchase(api_client, auth_header):
    user, _student = _make_student(diamonds=50)
    item = _make_item(price=25)
    api_client.post(f'/house/furniture/{item.id}/purchase', headers=auth_header(user))

    response = api_client.post(f'/house/furniture/{item.id}/place', headers=auth_header(user))

    assert response.status_code == 200
    assert response.data['placement']['position'] == [0.0, 0.0, 0.0]


def test_place_item_rejects_unowned_item(api_client, auth_header):
    user, _student = _make_student(diamonds=100)
    item = _make_item(price=25)

    response = api_client.post(f'/house/furniture/{item.id}/place', headers=auth_header(user))

    assert response.status_code == 403


def test_purchase_rejects_insufficient_balance(api_client, auth_header):
    user, student = _make_student(diamonds=10)
    item = _make_item(price=25)

    response = api_client.post(f'/house/furniture/{item.id}/purchase', headers=auth_header(user))

    assert response.status_code == 402
    student.refresh_from_db()
    assert student.diamond_balance_cache == 10
    assert not FurniturePurchase.objects.filter(student_profile=student, item=item).exists()


def test_purchase_rejects_already_owned(api_client, auth_header):
    user, student = _make_student(diamonds=100)
    item = _make_item(price=25)
    FurniturePurchase.objects.create(student_profile=student, item=item)

    response = api_client.post(f'/house/furniture/{item.id}/purchase', headers=auth_header(user))

    assert response.status_code == 409


def test_free_item_is_always_owned(api_client, auth_header):
    user, _student = _make_student(diamonds=0)
    _make_item(price=0)

    response = api_client.get('/house/furniture', headers=auth_header(user))

    assert response.status_code == 200
    assert response.data[0]['is_owned'] is True
    assert response.data[0]['surface'] == 'floor'


def test_placement_round_trips(api_client, auth_header):
    user, _student = _make_student(diamonds=100)
    item = _make_item(price=25)
    api_client.post(f'/house/furniture/{item.id}/purchase', headers=auth_header(user))

    response = api_client.patch(
        f'/house/furniture/{item.id}/placement',
        json={'position': [1.0, 0.0, -2.0], 'rotation': [0.0, 1.57, 0.0], 'scale': 1.2},
        headers=auth_header(user),
    )
    assert response.status_code == 200
    assert response.data['placement']['position'] == [1.0, 0.0, -2.0]
    assert response.data['placement']['scale'] == 1.2

    listing = api_client.get('/house/furniture', headers=auth_header(user))
    assert listing.data[0]['placement']['position'] == [1.0, 0.0, -2.0]


def test_placement_rejects_unowned_item(api_client, auth_header):
    user, _student = _make_student(diamonds=100)
    item = _make_item(price=25)

    response = api_client.patch(
        f'/house/furniture/{item.id}/placement',
        json={'position': [1.0, 0.0, 0.0]},
        headers=auth_header(user),
    )

    assert response.status_code == 403


def test_clear_placement_keeps_ownership(api_client, auth_header):
    user, student = _make_student(diamonds=100)
    item = _make_item(price=25)
    api_client.post(f'/house/furniture/{item.id}/purchase', headers=auth_header(user))
    api_client.post(f'/house/furniture/{item.id}/place', headers=auth_header(user))

    response = api_client.delete(f'/house/furniture/{item.id}/placement', headers=auth_header(user))

    assert response.status_code == 200
    assert response.data['placement'] is None
    assert response.data['is_owned'] is True
    assert FurniturePurchase.objects.filter(student_profile=student, item=item).exists()


def test_get_room_style_defaults(api_client, auth_header):
    user, _student = _make_student()

    response = api_client.get('/house/room-style', headers=auth_header(user))

    assert response.status_code == 200
    assert response.data == {'wall_color': '#f4efe4', 'floor_color': '#e7e0d3'}


def test_update_room_style_round_trips(api_client, auth_header):
    user, _student = _make_student()

    response = api_client.patch(
        '/house/room-style', json={'wall_color': '#112233'}, headers=auth_header(user)
    )

    assert response.status_code == 200
    assert response.data == {'wall_color': '#112233', 'floor_color': '#e7e0d3'}
    listing = api_client.get('/house/room-style', headers=auth_header(user))
    assert listing.data['wall_color'] == '#112233'

    response = api_client.patch(
        '/house/room-style', json={'floor_color': '#445566'}, headers=auth_header(user)
    )
    assert response.status_code == 200
    assert response.data == {'wall_color': '#112233', 'floor_color': '#445566'}


def test_update_room_style_rejects_invalid_color(api_client, auth_header):
    user, _student = _make_student()

    response = api_client.patch(
        '/house/room-style', json={'wall_color': 'not-a-color'}, headers=auth_header(user)
    )

    assert response.status_code == 422
