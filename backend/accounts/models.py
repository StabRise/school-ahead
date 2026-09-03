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
    SIMPLE = 'simple', 'Simple'
    PRESCHOOL = 'preschool', 'Preschool'


class TranslationScope(models.TextChoices):
    """How much text the read-along "Перекласти" feature translates per
    selection — see frontend/components/read-along-content.tsx. OFF turns
    the whole translation feature off (no button, no popup)."""

    OFF = 'off', 'Off'
    WORD = 'word', 'Word'
    SENTENCE = 'sentence', 'Sentence'


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
    # Uniform size multiplier for the body layer, tuned from the tutor avatar
    # editor (docs/core/avatar.md) so a body can be nudged to visually match
    # its wardrobe items without re-authoring the SVG.
    scale = models.FloatField(default=1.0)

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
    layers with no per-item offsets to track. Every slot is many-to-many
    (StudentProfile.equipped_{slot}_items) — several pieces can be worn at
    once in each of clothing/headwear/accessory, stacked by `layer_order`:
    underwear/socks under a t-shirt/pants, under a sweater, under a jacket,
    under a backpack; two hats/pins stacked the same way; glasses under a
    scarf; etc."""

    avatar = models.ForeignKey(Avatar, on_delete=models.CASCADE, related_name='items')
    slot = models.CharField(max_length=10, choices=AvatarItemSlot.choices)
    key = models.SlugField(max_length=50)
    name = models.CharField(max_length=100)
    image = models.FileField(upload_to=avatar_item_image_upload_to)
    order_index = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    # Per-item fine-tuning set from the tutor avatar editor (docs/core/avatar.md)
    # so an item can be scaled/nudged to line up with its avatar's body without
    # re-authoring the SVG. offset_x/offset_y are percentages of the avatar
    # canvas (so they stay correct at any render size); scale is a multiplier
    # applied on top of the item's native size. Both origin at (0, 0)/1.0,
    # i.e. "drawn exactly as authored" — see AvatarPreview on the frontend.
    scale = models.FloatField(default=1.0)
    offset_x = models.FloatField(default=0.0)
    offset_y = models.FloatField(default=0.0)
    # Stacking order among simultaneously-equipped items in the same slot —
    # lower draws first (closer to the body/skin), higher draws on top.
    layer_order = models.PositiveSmallIntegerField(default=0)
    # Diamond shop price — see docs/core/avatar.md section 2.2. 0 means free:
    # every student can equip it without buying (see StudentProfile.
    # unlocked_items for the purchase record of priced items).
    price = models.PositiveIntegerField(default=0)

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
    # Denormalized "% of the student's whole class curriculum completed" —
    # every Lesson across every Subject in `school_class`, not just this
    # student's assigned ones. Refreshed on every lesson completion (see
    # lessons.services._update_completion_percent_cache) rather than
    # computed on read, same tradeoff as diamond_balance_cache: cheap to
    # display (e.g. the tutor dashboard's "Мої учні" list) at the cost of
    # staying correct only through that one code path.
    completed_lessons_percent_cache = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    # Toggled from a settings switch (docs/interfaces/preschool.md) — persisted
    # here so it follows the student across sessions and devices.
    interface_mode = models.CharField(
        max_length=10, choices=InterfaceMode.choices, default=InterfaceMode.DEFAULT
    )
    # Settings for the read-along "Перекласти" feature — see
    # frontend/components/profile/translation-settings.tsx. Persisted here
    # (rather than kept client-side) so they follow the student across
    # sessions/devices, same as interface_mode above.
    translation_scope = models.CharField(
        max_length=10, choices=TranslationScope.choices, default=TranslationScope.WORD
    )
    translate_on_select = models.BooleanField(default=False)
    # The character companion chosen on the Student Profile page — see
    # docs/core/avatar.md section 2.1. Nullable: existing/new students start
    # with none picked and the frontend falls back to a default look.
    equipped_avatar = models.ForeignKey(
        Avatar, on_delete=models.SET_NULL, null=True, blank=True, related_name='equipped_by'
    )
    # Wardrobe layered on top of `equipped_avatar` — see docs/core/avatar.md
    # section 2.2. Each slot is many-to-many (several pieces can be worn at
    # once — a t-shirt + pants + jacket, two hats stacked, glasses + a mask),
    # stacked by AvatarItem.layer_order — see that model. All expected to
    # hold AvatarItems whose `slot`/`avatar` match `equipped_avatar`
    # (enforced in accounts/api.py, not at the DB level). Empty is a valid
    # "nothing equipped in this slot" state.
    equipped_clothing_items = models.ManyToManyField(
        AvatarItem, blank=True, related_name='equipped_as_clothing_by'
    )
    equipped_headwear_items = models.ManyToManyField(
        AvatarItem, blank=True, related_name='equipped_as_headwear_by'
    )
    equipped_accessory_items = models.ManyToManyField(
        AvatarItem, blank=True, related_name='equipped_as_accessory_by'
    )
    # Every priced AvatarItem this student has ever bought — see
    # docs/core/avatar.md section 2.2 and accounts.services.purchase_avatar_item.
    # Deliberately independent of equipped_avatar/equipped_*: switching to a
    # different companion and back must not lose access to items already
    # paid for, so this is never touched by the equip endpoints, only by a
    # purchase. Free items (AvatarItem.price == 0) don't need an entry here.
    unlocked_items = models.ManyToManyField(AvatarItem, blank=True, related_name='unlocked_by')

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
