from ninja import Schema


class GoogleLoginIn(Schema):
    id_token: str


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


class MeOut(Schema):
    user: UserOut


class GoogleLoginOut(Schema):
    user: UserOut


class UpdateInterfaceModeIn(Schema):
    interface_mode: str


class UpdateAvatarIn(Schema):
    avatar_id: int
