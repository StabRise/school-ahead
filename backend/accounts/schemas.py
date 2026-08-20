from ninja import Schema


class GoogleLoginIn(Schema):
    id_token: str


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


class MeOut(Schema):
    user: UserOut


class GoogleLoginOut(Schema):
    user: UserOut


class UpdateInterfaceModeIn(Schema):
    interface_mode: str
