from ninja import Schema


class GoogleLoginIn(Schema):
    id_token: str


class AvatarItemOut(Schema):
    """A wardrobe piece (clothing/headwear/accessory) for one Avatar — see
    docs/core/avatar.md section 2.2. Same "always built explicitly" rule as
    AvatarOut below applies here."""

    id: int
    slot: str
    key: str
    name: str
    image: str | None
    # Fine-tuning set from the tutor avatar editor — see AvatarItem.scale/
    # offset_x/offset_y. Applied by the frontend as a CSS transform on top of
    # this item's layer so every renderer (preview, wardrobe, ...) stays in
    # sync without re-authoring the SVG. For an equipped item, already
    # reflects the requesting student's own move/rotate/resize override
    # (EquippedItemPlacement) when one exists — see
    # accounts.api._equipped_items_out.
    scale: float = 1.0
    offset_x: float = 0.0
    offset_y: float = 0.0
    # A student's own rotate override of this equipped item — see scale/
    # offset_x/offset_y above. 0 (never rotated) for catalog items and for
    # any equipped item the student hasn't rotated; no catalog-side
    # counterpart to fall back to (art is always authored upright).
    rotation: float = 0.0
    # Stacking order among simultaneously-equipped items in the same slot —
    # see AvatarItem.layer_order.
    layer_order: int = 0
    # Diamond shop — see docs/core/avatar.md section 2.2. price=0 is free.
    # is_unlocked is relative to the requesting user (accounts.services.
    # is_item_unlocked): always true for price=0 items, and for anyone
    # without a StudentProfile (nothing to gate for non-students).
    price: int = 0
    is_unlocked: bool = True


class AvatarOut(Schema):
    """A selectable companion character — see docs/core/avatar.md. Always
    built explicitly via accounts.api._avatar_out (never returned straight
    from the ORM), since nesting it — with a resolve_* — inside a
    hand-built UserOut/MeOut confuses ninja into re-resolving an
    already-resolved instance."""

    id: int
    key: str
    name: str
    image: str | None
    # Fine-tuning set from the tutor avatar editor — see Avatar.scale.
    scale: float = 1.0
    # This avatar's wardrobe catalog (active items only), for the frontend
    # to build the customization pickers from.
    items: list[AvatarItemOut] = []


class UserOut(Schema):
    id: int
    email: str
    first_name: str
    last_name: str
    role: str
    locale: str
    avatar_url: str
    # Only set for role=student — see docs/interfaces/preschool.md.
    interface_mode: str | None = None
    # Only set for role=student — read-along "Перекласти" settings, see
    # frontend/components/profile/translation-settings.tsx.
    translation_scope: str | None = None
    translate_on_select: bool | None = None
    # Only set for role=student, and only once one is chosen — see
    # docs/core/avatar.md.
    equipped_avatar: AvatarOut | None = None
    # Only set for role=student, and only once picked — see
    # docs/core/avatar.md section 2.2. Each slot is a list (several pieces
    # worn together, e.g. a t-shirt + pants + jacket, or two stacked hats),
    # pre-sorted by AvatarItem.layer_order for the frontend to render
    # straight through.
    equipped_clothing_items: list[AvatarItemOut] = []
    equipped_headwear_items: list[AvatarItemOut] = []
    equipped_accessory_items: list[AvatarItemOut] = []
    # Only set for role=student — see docs/core/progress.md section 2.
    diamond_balance: int | None = None


class MeOut(Schema):
    user: UserOut


class GoogleLoginOut(Schema):
    user: UserOut


class UpdateInterfaceModeIn(Schema):
    interface_mode: str


class UpdateTranslationSettingsIn(Schema):
    translation_scope: str
    translate_on_select: bool


class UpdateAvatarIn(Schema):
    # null unequips the current avatar entirely — see update_avatar in api.py.
    avatar_id: int | None = None


class UpdateAvatarItemsIn(Schema):
    """Full replacement of the wardrobe — the frontend always sends its
    current picks for every slot, not just the one that changed, so an empty
    list unambiguously means "nothing equipped in this slot" rather than
    "leave it unchanged". Each slot may hold several ids at once (e.g. a
    t-shirt + pants + jacket, or two stacked hats), worn together and
    stacked by AvatarItem.layer_order."""

    clothing_item_ids: list[int] = []
    headwear_item_ids: list[int] = []
    accessory_item_ids: list[int] = []


class UpdateAvatarTransformIn(Schema):
    """Tutor avatar editor — see docs/core/avatar.md."""

    scale: float


class UpdateAvatarItemTransformIn(Schema):
    """Tutor avatar editor — see docs/core/avatar.md."""

    scale: float
    offset_x: float
    offset_y: float
    layer_order: int
    price: int


class UpdateAvatarItemPlacementIn(Schema):
    """A student moving/rotating/resizing one of their own equipped
    wardrobe items directly on their avatar preview — see
    EquippedItemPlacement and accounts.api.update_avatar_item_placement.
    offset_x/offset_y/scale are absolute replacements for AvatarItem.
    offset_x/offset_y/scale (same conventions), not deltas/multipliers."""

    offset_x: float
    offset_y: float
    rotation: float = 0.0
    scale: float = 1.0
