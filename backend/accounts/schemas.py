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
    # sync without re-authoring the SVG.
    scale: float = 1.0
    offset_x: float = 0.0
    offset_y: float = 0.0
    # Stacking order among simultaneously-equipped clothing items — see
    # AvatarItem.layer_order. Meaningless for headwear/accessory.
    layer_order: int = 0


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
    # Only set for role=student, and only once one is chosen — see
    # docs/core/avatar.md.
    equipped_avatar: AvatarOut | None = None
    # Only set for role=student, and only once picked — see
    # docs/core/avatar.md section 2.2. Clothing is a list (multiple pieces
    # worn together, e.g. a t-shirt + pants + jacket), pre-sorted by
    # AvatarItem.layer_order for the frontend to render straight through.
    equipped_clothing_items: list[AvatarItemOut] = []
    equipped_headwear: AvatarItemOut | None = None
    equipped_accessory: AvatarItemOut | None = None
    # Only set for role=student — see docs/core/progress.md section 2.
    diamond_balance: int | None = None


class MeOut(Schema):
    user: UserOut


class GoogleLoginOut(Schema):
    user: UserOut


class UpdateInterfaceModeIn(Schema):
    interface_mode: str


class UpdateAvatarIn(Schema):
    avatar_id: int


class UpdateAvatarItemsIn(Schema):
    """Full replacement of the wardrobe — the frontend always sends its
    current picks for every slot, not just the one that changed, so an empty
    list/`null` unambiguously means "nothing equipped here" rather than
    "leave it unchanged". clothing_item_ids may hold several ids at once
    (e.g. a t-shirt + pants + jacket, worn together and stacked by
    AvatarItem.layer_order); headwear/accessory still equip one at a time."""

    clothing_item_ids: list[int] = []
    headwear_item_id: int | None = None
    accessory_item_id: int | None = None


class UpdateAvatarTransformIn(Schema):
    """Tutor avatar editor — see docs/core/avatar.md."""

    scale: float


class UpdateAvatarItemTransformIn(Schema):
    """Tutor avatar editor — see docs/core/avatar.md."""

    scale: float
    offset_x: float
    offset_y: float
    layer_order: int
