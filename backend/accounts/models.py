import uuid

from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models

from common.storage import avatar_image_upload_to, avatar_item_image_upload_to

from .managers import UserManager


class Role(models.TextChoices):
    STUDENT = 'student', 'Student'
    TUTOR = 'tutor', 'Tutor'
    PARENT = 'parent', 'Parent'
    ADMIN = 'admin', 'Admin'


class User(AbstractBaseUser, PermissionsMixin):
    """Custom AUTH_USER_MODEL. See docs/architecture/02-data-model.md."""

    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150, blank=True)
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.STUDENT)
    locale = models.CharField(max_length=10, default='uk')
    avatar_url = models.URLField(blank=True)

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

    date_joined = models.DateTimeField(auto_now_add=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []

    class Meta:
        ordering = ['email']

    def __str__(self):
        return self.email

    @property
    def full_name(self):
        return f'{self.first_name} {self.last_name}'.strip()


class InterfaceMode(models.TextChoices):
    DEFAULT = 'default', 'Default'
    PRESCHOOL = 'preschool', 'Preschool'


class Avatar(models.Model):
    """A selectable companion character's base body — see docs/core/avatar.md.
    Rendered as the bottom SVG layer, with a student's equipped `AvatarItem`s
    stacked on top (clothing -> headwear -> accessory) in the same canvas
    coordinate system. That doc also specs a shop (Diamond prices) and a
    home-decoration system; neither is built yet. `key`/`is_active` exist now
    so those can layer on later (e.g. an `AvatarUnlock` per-student table)
    without reshaping this catalog. For now every active Avatar is available
    to every student, unlocked or not."""

    key = models.SlugField(max_length=50, unique=True)
    name = models.CharField(max_length=100)
    image = models.FileField(upload_to=avatar_image_upload_to)
    order_index = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['order_index', 'id']

    def __str__(self):
        return self.name


class AvatarItemSlot(models.TextChoices):
    CLOTHING = 'clothing', 'Clothing'
    HEADWEAR = 'headwear', 'Headwear'
    ACCESSORY = 'accessory', 'Accessory'


class AvatarItem(models.Model):
    """A wardrobe piece for one Avatar — see docs/core/avatar.md section 2.2.
    Drawn as an SVG in the same canvas coordinate system as its `avatar`, so
    the frontend composites the equipped stack as plain absolutely-positioned
    layers with no per-item offsets to track. Only one item per slot can be
    equipped at a time (StudentProfile.equipped_clothing/headwear/accessory)."""

    avatar = models.ForeignKey(Avatar, on_delete=models.CASCADE, related_name='items')
    slot = models.CharField(max_length=10, choices=AvatarItemSlot.choices)
    key = models.SlugField(max_length=50)
    name = models.CharField(max_length=100)
    image = models.FileField(upload_to=avatar_item_image_upload_to)
    order_index = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['slot', 'order_index', 'id']
        unique_together = [('avatar', 'key')]

    def __str__(self):
        return f'{self.avatar.key}:{self.key}'


class StudentProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='student_profile')
    school_class = models.ForeignKey(
        'academics.Class', on_delete=models.SET_NULL, null=True, blank=True, related_name='students'
    )
    enrolled_at = models.DateField(null=True, blank=True)
    diamond_balance_cache = models.PositiveIntegerField(default=0)
    # Toggled from a settings switch (docs/interfaces/preschool.md) — persisted
    # here so it follows the student across sessions and devices.
    interface_mode = models.CharField(
        max_length=10, choices=InterfaceMode.choices, default=InterfaceMode.DEFAULT
    )
    # The character companion chosen on the Student Profile page — see
    # docs/core/avatar.md section 2.1. Nullable: existing/new students start
    # with none picked and the frontend falls back to a default look.
    equipped_avatar = models.ForeignKey(
        Avatar, on_delete=models.SET_NULL, null=True, blank=True, related_name='equipped_by'
    )
    # Wardrobe slots layered on top of `equipped_avatar` — see
    # docs/core/avatar.md section 2.2. Each nullable/blank: a slot can be
    # left empty, and each is expected to hold an AvatarItem whose `slot`
    # and `avatar` match `equipped_avatar` (enforced in accounts/api.py, not
    # at the DB level).
    equipped_clothing = models.ForeignKey(
        AvatarItem, on_delete=models.SET_NULL, null=True, blank=True, related_name='equipped_as_clothing'
    )
    equipped_headwear = models.ForeignKey(
        AvatarItem, on_delete=models.SET_NULL, null=True, blank=True, related_name='equipped_as_headwear'
    )
    equipped_accessory = models.ForeignKey(
        AvatarItem, on_delete=models.SET_NULL, null=True, blank=True, related_name='equipped_as_accessory'
    )

    def __str__(self):
        # Same full_name-or-email fallback used everywhere a student's name
        # is displayed (tutoring/lessons APIs) — keeps the admin's student
        # filter dropdown (lessons.StudentLessonAdmin) and other FK widgets
        # readable instead of showing "StudentProfile(email)".
        return self.user.full_name or self.user.email


class TutorProfile(models.Model):
    """Held by role=tutor users, and auto-provisioned for role=admin users too
    (see docs/architecture/02-data-model.md decision 7 — not implemented in this
    pass since it depends on the `academics`/`tutoring` apps)."""

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='tutor_profile')
    bio = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f'TutorProfile({self.user.email})'


class ParentProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='parent_profile')

    def __str__(self):
        return f'ParentProfile({self.user.email})'


class ParentStudentLink(models.Model):
    class Relationship(models.TextChoices):
        MOTHER = 'mother', 'Mother'
        FATHER = 'father', 'Father'
        GUARDIAN = 'guardian', 'Guardian'
        OTHER = 'other', 'Other'

    parent = models.ForeignKey(ParentProfile, on_delete=models.CASCADE, related_name='student_links')
    student = models.ForeignKey(StudentProfile, on_delete=models.CASCADE, related_name='parent_links')
    relationship = models.CharField(max_length=10, choices=Relationship.choices)
    is_primary_contact = models.BooleanField(default=False)

    class Meta:
        unique_together = [('parent', 'student')]

    def __str__(self):
        return f'{self.parent} -> {self.student}'


class SocialAccount(models.Model):
    class Provider(models.TextChoices):
        GOOGLE = 'google', 'Google'

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='social_accounts')
    provider = models.CharField(max_length=20, choices=Provider.choices, default=Provider.GOOGLE)
    provider_uid = models.CharField(max_length=255, unique=True)
    raw_data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('provider', 'provider_uid')]

    def __str__(self):
        return f'{self.provider}:{self.provider_uid}'


class RefreshToken(models.Model):
    """Tracks issued refresh tokens for rotation/revocation. The row's UUID `id`
    is embedded as the `jti` claim of the JWT handed to the client — see
    accounts/services.py. See docs/architecture/05-auth-flow.md."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='refresh_tokens')
    issued_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    replaced_by = models.OneToOneField(
        'self', on_delete=models.SET_NULL, null=True, blank=True, related_name='replaces'
    )

    def __str__(self):
        return str(self.id)

    @property
    def is_revoked(self):
        return self.revoked_at is not None
