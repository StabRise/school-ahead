from django.core.validators import FileExtensionValidator
from django.db import models

from accounts.models import StudentProfile
from common.storage import (
    furniture_model_upload_to,
    furniture_texture_upload_to,
    furniture_thumbnail_upload_to,
)


class FurnitureItem(models.Model):
    """A piece of furniture a student can buy with Diamonds and place in
    their (single, implicit — see PlacedFurnitureItem) 3D room, rendered by
    the frontend's @school-ahead/house-3d package (three.js via
    @react-three/fiber). Its own app rather than folded into accounts: this
    is a separate shop/catalog domain from the avatar wardrobe
    (accounts.AvatarItem), sharing only the Diamond currency
    (StudentProfile.diamond_balance_cache).

    model_file is the actual 3D asset, restricted to .obj/.stl since
    that's what the frontend's loader knows how to resolve. texture_file is
    optional and applied as a plain image texture on a basic material —
    deliberately independent of any .obj sidecar .mtl file, since an
    uploaded .obj commonly references a .mtl that was never actually
    uploaded alongside it, and MTLLoader has no graceful "just skip it"
    mode."""

    key = models.SlugField(max_length=50, unique=True)
    name = models.CharField(max_length=100)
    model_file = models.FileField(
        upload_to=furniture_model_upload_to,
        validators=[FileExtensionValidator(allowed_extensions=['obj', 'stl'])],
    )
    texture_file = models.FileField(upload_to=furniture_texture_upload_to, blank=True, null=True)
    # 2D icon for the shop grid — a live 3D preview per catalog tile is
    # needless complexity when a plain product photo/render does the job.
    thumbnail_image = models.FileField(upload_to=furniture_thumbnail_upload_to)
    price = models.PositiveIntegerField(default=0)
    # Default transform applied the moment an item is bought (see
    # house.services.purchase_item) — the student can then drag/rotate it
    # anywhere in the 3D scene via a TransformControls gizmo, which persists
    # through PlacedFurnitureItem below. Full free 3D placement: arbitrary
    # position and rotation on all three axes.
    default_position_x = models.FloatField(default=0.0)
    default_position_y = models.FloatField(default=0.0)
    default_position_z = models.FloatField(default=0.0)
    default_rotation_x = models.FloatField(default=0.0)
    default_rotation_y = models.FloatField(default=0.0)
    default_rotation_z = models.FloatField(default=0.0)
    default_scale = models.FloatField(default=1.0)
    order_index = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['order_index', 'id']

    def __str__(self):
        return self.name


class FurniturePurchase(models.Model):
    """Ownership record — every FurnitureItem a student has ever bought. A
    dedicated ledger table (not an accounts.StudentProfile M2M like
    AvatarItem.unlocked_items) so the house app owns its own tables
    end to end and accounts/models.py never has to change for this
    feature. Free items (price == 0) don't need a row here — see
    house.services.is_item_owned, same free-item rule as
    accounts.services.is_item_unlocked."""

    student_profile = models.ForeignKey(StudentProfile, on_delete=models.CASCADE, related_name='furniture_purchases')
    item = models.ForeignKey(FurnitureItem, on_delete=models.CASCADE, related_name='purchases')
    purchased_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('student_profile', 'item')]

    def __str__(self):
        return f'{self.student_profile} -> {self.item.key}'


class PlacedFurnitureItem(models.Model):
    """Where one owned FurnitureItem currently sits in the student's room.
    A row's existence means "placed"; buying an item creates one at the
    catalog's default_position_*/default_rotation_*/default_scale (see
    house.services.purchase_item); dragging/rotating it in the 3D scene via
    the TransformControls gizmo updates it (PATCH .../placement); a "put
    away" action deletes it (DELETE .../placement) — same owned-vs-placed
    split as accounts.StudentProfile.unlocked_items vs.
    EquippedItemPlacement."""

    student_profile = models.ForeignKey(StudentProfile, on_delete=models.CASCADE, related_name='placed_furniture')
    item = models.ForeignKey(FurnitureItem, on_delete=models.CASCADE, related_name='placements')
    position_x = models.FloatField()
    position_y = models.FloatField()
    position_z = models.FloatField()
    rotation_x = models.FloatField(default=0.0)
    rotation_y = models.FloatField(default=0.0)
    rotation_z = models.FloatField(default=0.0)
    scale = models.FloatField(default=1.0)

    class Meta:
        unique_together = [('student_profile', 'item')]

    def __str__(self):
        return f'{self.student_profile} placed {self.item.key}'
