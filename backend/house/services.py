import re

from django.db import transaction
from django.db.models import F

from accounts.models import StudentProfile

from .models import FurnitureItem, FurniturePurchase, PlacedFurnitureItem, RoomStyle

HEX_COLOR_RE = re.compile(r'^#[0-9a-fA-F]{6}$')


class ItemAlreadyOwned(Exception):
    pass


class InsufficientDiamonds(Exception):
    pass


class InvalidColor(Exception):
    pass


def model_format(item: FurnitureItem) -> str:
    """"obj" | "stl" — the frontend loader picks a THREE.js loader off this,
    since model_file itself doesn't carry a content-type. Shared by
    house.api (student-facing) and tutoring.api's furniture editor
    (tutor-facing)."""
    return 'stl' if item.model_file.name.lower().endswith('.stl') else 'obj'


def is_item_owned(student: StudentProfile, item: FurnitureItem) -> bool:
    """Free items are owned by everyone; priced ones need a purchase
    record. See accounts.services.is_item_unlocked for the identical rule
    applied to AvatarItem."""
    return item.price == 0 or FurniturePurchase.objects.filter(student_profile=student, item=item).exists()


@transaction.atomic
def purchase_item(student: StudentProfile, item: FurnitureItem) -> None:
    """Buys `item` for `student` — see FurnitureItem/FurniturePurchase.
    Ownership only: it does not place the item in the room. There's no
    separate "equip" step for furniture (unlike accounts.AvatarItem), but
    unlike a straight equip, the student explicitly adds it to the room
    afterwards via `place_item` (Add button in the shop) rather than it
    appearing there automatically.

    Same atomic conditional-UPDATE balance check as
    accounts.services.purchase_avatar_item: the balance check and
    deduction happen in one UPDATE (diamond_balance_cache__gte=item.price)
    so two concurrent purchase requests can't both succeed off a stale
    in-memory balance."""
    if is_item_owned(student, item):
        raise ItemAlreadyOwned()

    updated = StudentProfile.objects.filter(
        pk=student.pk, diamond_balance_cache__gte=item.price
    ).update(diamond_balance_cache=F('diamond_balance_cache') - item.price)
    if updated == 0:
        raise InsufficientDiamonds()

    FurniturePurchase.objects.create(student_profile=student, item=item)
    student.refresh_from_db(fields=['diamond_balance_cache'])


def place_item(student: StudentProfile, item: FurnitureItem) -> None:
    """Puts an already-owned item into the room at the catalog's default
    transform — the "Add" button counterpart to `clear_placement`'s
    "Remove". See house.api.place_furniture_item."""
    PlacedFurnitureItem.objects.update_or_create(
        student_profile=student,
        item=item,
        defaults={
            'position_x': item.default_position_x,
            'position_y': item.default_position_y,
            'position_z': item.default_position_z,
            'rotation_x': item.default_rotation_x,
            'rotation_y': item.default_rotation_y,
            'rotation_z': item.default_rotation_z,
            'scale': item.default_scale,
        },
    )


def save_placement(
    student: StudentProfile, item: FurnitureItem,
    position_x: float, position_y: float, position_z: float,
    rotation_x: float, rotation_y: float, rotation_z: float, scale: float,
) -> None:
    """Persists a student's drag/rotate of one of their own owned items in
    the 3D scene — see PlacedFurnitureItem and house.api.
    update_furniture_placement."""
    PlacedFurnitureItem.objects.update_or_create(
        student_profile=student,
        item=item,
        defaults={
            'position_x': position_x, 'position_y': position_y, 'position_z': position_z,
            'rotation_x': rotation_x, 'rotation_y': rotation_y, 'rotation_z': rotation_z,
            'scale': scale,
        },
    )


def clear_placement(student: StudentProfile, item: FurnitureItem) -> None:
    """"Puts away" an owned item — deletes its PlacedFurnitureItem row
    without touching FurniturePurchase, so it stays owned and can be
    placed again later."""
    PlacedFurnitureItem.objects.filter(student_profile=student, item=item).delete()


def get_room_style(student: StudentProfile) -> RoomStyle:
    """This student's saved wall/floor room colors — see models.RoomStyle.
    Creates the row with its default colors the first time anyone asks,
    rather than requiring one to already exist."""
    style, _created = RoomStyle.objects.get_or_create(student_profile=student)
    return style


def update_room_style(student: StudentProfile, wall_color: str | None, floor_color: str | None) -> RoomStyle:
    """Saves a student's wall and/or floor color pick — either argument
    left None leaves that color untouched. Raises InvalidColor unless a
    given color is a plain `#rrggbb` hex string, since it's rendered
    straight into a three.js material color with no further sanitization
    on the frontend."""
    style = get_room_style(student)
    if wall_color is not None:
        if not HEX_COLOR_RE.match(wall_color):
            raise InvalidColor()
        style.wall_color = wall_color
    if floor_color is not None:
        if not HEX_COLOR_RE.match(floor_color):
            raise InvalidColor()
        style.floor_color = floor_color
    style.save()
    return style
