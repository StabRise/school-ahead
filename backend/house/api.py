from django.http import HttpRequest
from ninja import Router
from ninja.errors import HttpError

from common.auth import CookieOrBearerJWTAuth
from common.csrf import require_csrf
from common.permissions import get_own_student_profile

from . import services
from .models import FurnitureItem, PlacedFurnitureItem
from .schemas import FurnitureItemOut, FurniturePlacementOut, FurnitureTextureOut, UpdateFurniturePlacementIn

router = Router(tags=['house'], auth=CookieOrBearerJWTAuth())


def _absolute_file_url(file_field, request: HttpRequest) -> str | None:
    """See achievements/api.py's identical helper — file URLs are
    host-relative and the frontend is a separate origin (no BFF)."""
    if not file_field:
        return None
    return request.build_absolute_uri(file_field.url)


def _furniture_out(
    item: FurnitureItem, request: HttpRequest, owned_ids: set[int],
    placement: PlacedFurnitureItem | None,
) -> FurnitureItemOut:
    return FurnitureItemOut(
        id=item.id,
        key=item.key,
        name=item.name,
        model_file=_absolute_file_url(item.model_file, request),
        model_format=services.model_format(item),
        material_file=_absolute_file_url(item.material_file, request),
        textures=[
            FurnitureTextureOut(id=t.id, url=_absolute_file_url(t.file, request), filename=t.original_filename)
            for t in item.textures.all()
        ],
        thumbnail_image=_absolute_file_url(item.thumbnail_image, request),
        price=item.price,
        is_owned=item.price == 0 or item.id in owned_ids,
        surface=item.surface,
        kind=item.kind,
        default_position=[item.default_position_x, item.default_position_y, item.default_position_z],
        default_rotation=[item.default_rotation_x, item.default_rotation_y, item.default_rotation_z],
        default_scale=item.default_scale,
        placement=FurniturePlacementOut(
            position=[placement.position_x, placement.position_y, placement.position_z],
            rotation=[placement.rotation_x, placement.rotation_y, placement.rotation_z],
            scale=placement.scale,
        ) if placement else None,
    )


@router.get('/furniture', response=list[FurnitureItemOut], operation_id='list_furniture_catalog')
def list_furniture_catalog(request: HttpRequest):
    """The shop + room state in one call: every active FurnitureItem, with
    whether this student owns it and, if owned and currently placed, where."""
    student = get_own_student_profile(request)
    owned_ids = set(
        FurnitureItem.objects.filter(purchases__student_profile=student).values_list('id', flat=True)
    )
    placements = {p.item_id: p for p in PlacedFurnitureItem.objects.filter(student_profile=student)}
    items = FurnitureItem.objects.filter(is_active=True).prefetch_related('textures')
    return [_furniture_out(item, request, owned_ids, placements.get(item.id)) for item in items]


@router.post('/furniture/{item_id}/purchase', response=FurnitureItemOut, operation_id='purchase_furniture_item')
def purchase_furniture_item(request: HttpRequest, item_id: int):
    """Buys a furniture item with Diamonds — ownership only, it does not
    place the item in the room (see house.services.purchase_item; the
    student places it afterwards via the Add button/
    place_furniture_item). 409 if already owned, 402 if the student's
    diamond_balance_cache can't cover the price."""
    require_csrf(request)
    student = get_own_student_profile(request)
    item = FurnitureItem.objects.filter(id=item_id, is_active=True).first()
    if item is None:
        raise HttpError(404, 'Furniture item not found')
    try:
        services.purchase_item(student, item)
    except services.ItemAlreadyOwned as exc:
        raise HttpError(409, 'Item already owned') from exc
    except services.InsufficientDiamonds as exc:
        raise HttpError(402, 'Not enough Diamonds') from exc
    return _furniture_out(item, request, {item.id}, None)


def _get_own_owned_item(student, item_id: int) -> FurnitureItem:
    """404s unless `item_id` is an active catalog item; 403s unless
    `student` owns it — shared by the placement endpoints below, so a
    student can only move/put away furniture they've actually bought."""
    item = FurnitureItem.objects.filter(id=item_id, is_active=True).first()
    if item is None:
        raise HttpError(404, 'Furniture item not found')
    if not services.is_item_owned(student, item):
        raise HttpError(403, 'Item is not owned — purchase it first')
    return item


@router.post('/furniture/{item_id}/place', response=FurnitureItemOut, operation_id='place_furniture_item')
def place_furniture_item(request: HttpRequest, item_id: int):
    """Adds an already-owned, currently put-away item back into the room at
    its catalog default transform — the "Add" button counterpart to
    clear_furniture_placement's "Remove". See house.services.place_item."""
    require_csrf(request)
    student = get_own_student_profile(request)
    item = _get_own_owned_item(student, item_id)
    services.place_item(student, item)
    placement = PlacedFurnitureItem.objects.get(student_profile=student, item=item)
    return _furniture_out(item, request, {item.id}, placement)


@router.patch('/furniture/{item_id}/placement', response=FurnitureItemOut, operation_id='update_furniture_placement')
def update_furniture_placement(request: HttpRequest, item_id: int, payload: UpdateFurniturePlacementIn):
    """A student dragging/rotating one of their own owned furniture items
    via the frontend's TransformControls gizmo — see PlacedFurnitureItem."""
    require_csrf(request)
    student = get_own_student_profile(request)
    item = _get_own_owned_item(student, item_id)
    services.save_placement(
        student, item,
        *payload.position, *payload.rotation, payload.scale,
    )
    placement = PlacedFurnitureItem.objects.get(student_profile=student, item=item)
    return _furniture_out(item, request, {item.id}, placement)


@router.delete('/furniture/{item_id}/placement', response=FurnitureItemOut, operation_id='clear_furniture_placement')
def clear_furniture_placement(request: HttpRequest, item_id: int):
    """"Puts away" an owned item — see house.services.clear_placement."""
    require_csrf(request)
    student = get_own_student_profile(request)
    item = _get_own_owned_item(student, item_id)
    services.clear_placement(student, item)
    return _furniture_out(item, request, {item.id}, None)
