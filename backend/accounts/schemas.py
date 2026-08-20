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


class MeOut(Schema):
    user: UserOut


class GoogleLoginOut(Schema):
    user: UserOut
