import uuid

from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models

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


class StudentProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='student_profile')
    school_class = models.ForeignKey(
        'academics.Class', on_delete=models.SET_NULL, null=True, blank=True, related_name='students'
    )
    enrolled_at = models.DateField(null=True, blank=True)
    diamond_balance_cache = models.PositiveIntegerField(default=0)

    def __str__(self):
        return f'StudentProfile({self.user.email})'


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
