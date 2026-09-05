from ninja import Schema


class FurniturePlacementOut(Schema):
    """Where a student's own owned FurnitureItem currently sits — see
    models.PlacedFurnitureItem."""

    position: list[float]
    rotation: list[float]
    scale: float


class FurnitureItemOut(Schema):
    """A catalog item, from the requesting student's point of view — see
    models.FurnitureItem. Always built explicitly in house.api (never
    returned straight from the ORM), since model_file/texture_file/
    thumbnail_image need absolute URLs and is_owned/placement are
    per-student. list[float] position/rotation triplets (rather than
    separate x/y/z wire fields) keep the frontend's THREE.Vector3/Euler
    mapping trivial (`new THREE.Vector3(...position)`), while the DB stays
    flat float columns for simple admin editing."""

    id: int
    key: str
    name: str
    model_file: str
    model_format: str  # "obj" | "stl" — see house.api._model_format
    texture_file: str | None
    thumbnail_image: str
    price: int
    is_owned: bool
    default_position: list[float]
    default_rotation: list[float]
    default_scale: float
    # None when owned but not currently placed ("put away").
    placement: FurniturePlacementOut | None = None


class UpdateFurniturePlacementIn(Schema):
    """A student dragging/rotating one of their own owned furniture items
    via the frontend's TransformControls gizmo — see
    house.api.update_furniture_placement."""

    position: list[float]
    rotation: list[float] = [0.0, 0.0, 0.0]
    scale: float = 1.0
