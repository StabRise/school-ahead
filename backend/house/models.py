from django.core.validators import FileExtensionValidator
from django.db import models

from accounts.models import StudentProfile
from common.storage import (
    furniture_material_upload_to,
    furniture_model_upload_to,
    furniture_texture_upload_to,
    furniture_thumbnail_upload_to,
)


class FurnitureSurface(models.TextChoices):
    """Which surface of the room a FurnitureItem sticks to — set once per
    catalog item by the tutor furniture editor, not per-placement. Drives
    the frontend's snap-to-surface behavior (house-3d's lib/surface.ts):
    FLOOR items stay grounded at y=0, CEILING items stay flush against the
    ceiling, WALL items snap flush against whichever of the room's three
    walls they're dragged nearest to."""

    FLOOR = 'floor', 'Floor'
    WALL = 'wall', 'Wall'
    CEILING = 'ceiling', 'Ceiling'


class FurnitureKind(models.TextChoices):
    """WITH_HOLE items (windows, doors, ...) get an opening cut into
    whichever surface they're stuck to, sized to match the object itself —
    see house-3d's lib/hole-geometry.ts — instead of just sitting in front
    of a solid wall/floor/ceiling. They're also auto-leveled (roll/pitch
    forced to 0, only their facing/spin rotation stays free) so that
    opening is a clean, axis-aligned rectangle — see lib/surface.ts's
    `snapToSurface`."""

    NORMAL = 'normal', 'Normal'
    WITH_HOLE = 'with_hole', 'With hole'


class FurnitureItem(models.Model):
    """A piece of furniture a student can buy with Diamonds and place in
    their (single, implicit — see PlacedFurnitureItem) 3D room, rendered by
    the frontend's @school-ahead/house-3d package (three.js via
    @react-three/fiber). Its own app rather than folded into accounts: this
    is a separate shop/catalog domain from the avatar wardrobe
    (accounts.AvatarItem), sharing only the Diamond currency
    (StudentProfile.diamond_balance_cache).

    model_file is the actual 3D asset, restricted to .obj/.stl since
    that's what the frontend's loader knows how to resolve. material_file
    is the .obj's optional sidecar .mtl, explicitly uploaded here (never
    inferred from model_file, since an uploaded .obj commonly references a
    .mtl that was never actually uploaded alongside it, and MTLLoader has
    no graceful "just skip it" mode). Its `textures` (see FurnitureTexture)
    are the images that .mtl's `map_Kd`/etc directives reference by
    filename — the frontend resolves those references against `textures`
    by original_filename, since upload storage always renames the file on
    disk (house-3d's lib/mtl-resource-map.ts). When there's no
    material_file, the frontend instead applies the first uploaded texture
    (if any) as a plain image texture on a flat material, for a bare .obj
    with no real materials of its own — see house-3d's furniture-mesh.tsx."""

    key = models.SlugField(max_length=50, unique=True)
    name = models.CharField(max_length=100)
    model_file = models.FileField(
        upload_to=furniture_model_upload_to,
        validators=[FileExtensionValidator(allowed_extensions=['obj', 'stl'])],
    )
    material_file = models.FileField(
        upload_to=furniture_material_upload_to,
        blank=True,
        null=True,
        validators=[FileExtensionValidator(allowed_extensions=['mtl'])],
    )
    # 2D icon for the shop grid — a live 3D preview per catalog tile is
    # needless complexity when a plain product photo/render does the job.
    thumbnail_image = models.FileField(upload_to=furniture_thumbnail_upload_to)
    price = models.PositiveIntegerField(default=0)
    surface = models.CharField(max_length=10, choices=FurnitureSurface.choices, default=FurnitureSurface.FLOOR)
    kind = models.CharField(max_length=10, choices=FurnitureKind.choices, default=FurnitureKind.NORMAL)
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


class FurnitureTexture(models.Model):
    """One uploaded texture image for a FurnitureItem — see
    FurnitureItem.material_file/textures. A .mtl file references its
    textures by their original filename (e.g. `map_Kd diffuse.png`), which
    upload storage always discards in favor of a random one (see
    common.storage._unique_path's `_unique_path`) — original_filename keeps
    that original name around so the frontend can resolve a .mtl's texture
    reference back to the right uploaded file regardless of storage path
    (house-3d's lib/mtl-resource-map.ts). Multiple per item, since a real
    asset's .mtl commonly references several separate textures (diffuse,
    normal, specular, ...); for an item with no material_file, the first
    one (by id) is used instead as a plain flat texture — see
    house.api._furniture_out."""

    item = models.ForeignKey(FurnitureItem, on_delete=models.CASCADE, related_name='textures')
    file = models.FileField(upload_to=furniture_texture_upload_to)
    original_filename = models.CharField(max_length=255)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f'{self.item.key}: {self.original_filename}'


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
