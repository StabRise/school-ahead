from django.db import transaction
from django.db.models import F

from accounts.models import StudentProfile

from .models import FurnitureItem, FurniturePurchase, PlacedFurnitureItem


class ItemAlreadyOwned(Exception):
    pass


class InsufficientDiamonds(Exception):
    pass


def is_item_owned(student: StudentProfile, item: FurnitureItem) -> bool:
    """Free items are owned by everyone; priced ones need a purchase
    record. See accounts.services.is_item_unlocked for the identical rule
    applied to AvatarItem."""
    return item.price == 0 or FurniturePurchase.objects.filter(student_profile=student, item=item).exists()


@transaction.atomic
def purchase_item(student: StudentProfile, item: FurnitureItem) -> None:
    """Buys `item` for `student` and immediately places it in their room at
    the catalog's default transform — see FurnitureItem/
    PlacedFurnitureItem. There's no separate "equip" step for furniture
    (unlike accounts.AvatarItem): buying a piece puts it straight into the
    room, and the student can then move it or put it away.

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
    student.refresh_from_db(fields=['diamond_balance_cache'])


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
