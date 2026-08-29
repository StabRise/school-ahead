from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import (
    Avatar,
    AvatarItem,
    ParentProfile,
    ParentStudentLink,
    RefreshToken,
    SocialAccount,
    StudentProfile,
    TutorProfile,
    User,
)


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    ordering = ['email']
    list_display = ['email', 'first_name', 'last_name', 'role', 'is_staff', 'is_active']
    list_filter = ['role', 'is_staff', 'is_active']
    search_fields = ['email', 'first_name', 'last_name']
    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Personal info', {'fields': ('first_name', 'last_name', 'role', 'locale', 'avatar_url')}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Important dates', {'fields': ('last_login', 'date_joined')}),
    )
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'password1', 'password2', 'role'),
        }),
    )
    readonly_fields = ['date_joined']


@admin.register(StudentProfile)
class StudentProfileAdmin(admin.ModelAdmin):
    """Admin configuration for StudentProfile model."""

    list_display = (
        "user", "school_class", "enrolled_at", "diamond_balance_cache", "interface_mode", "equipped_avatar",
        "clothing_items_display", "equipped_headwear", "equipped_accessory",
    )
    list_filter = ("school_class", "enrolled_at", "interface_mode", "equipped_avatar")
    search_fields = ("user__email", "user__first_name", "user__last_name")
    autocomplete_fields = ("user", "school_class", "equipped_avatar", "equipped_headwear", "equipped_accessory")
    filter_horizontal = ("equipped_clothing_items", "unlocked_items")

    @admin.display(description="Equipped clothing")
    def clothing_items_display(self, obj):
        return ", ".join(item.name for item in obj.equipped_clothing_items.all())


@admin.register(Avatar)
class AvatarAdmin(admin.ModelAdmin):
    """Admin configuration for the selectable companion-character catalog.
    See docs/core/avatar.md."""

    list_display = ("name", "key", "order_index", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name", "key")
    ordering = ("order_index", "id")


@admin.register(AvatarItem)
class AvatarItemAdmin(admin.ModelAdmin):
    """Admin configuration for wardrobe pieces (clothing/headwear/accessory)
    layered on top of an Avatar. See docs/core/avatar.md."""

    list_display = ("name", "key", "avatar", "slot", "layer_order", "price", "order_index", "is_active")
    list_filter = ("slot", "is_active", "avatar")
    search_fields = ("name", "key")
    autocomplete_fields = ("avatar",)
    ordering = ("avatar", "slot", "order_index", "id")


@admin.register(TutorProfile)
class TutorProfileAdmin(admin.ModelAdmin):
    """Admin configuration for TutorProfile model."""

    list_display = ("user", "is_active")
    list_filter = ("is_active",)
    search_fields = ("user__email", "user__first_name", "user__last_name", "bio")
    autocomplete_fields = ("user",)


@admin.register(ParentProfile)
class ParentProfileAdmin(admin.ModelAdmin):
    """Admin configuration for ParentProfile model."""

    list_display = ("user",)
    search_fields = ("user__email", "user__first_name", "user__last_name")
    autocomplete_fields = ("user",)


@admin.register(ParentStudentLink)
class ParentStudentLinkAdmin(admin.ModelAdmin):
    """Admin configuration for linking parents to students."""

    list_display = ("parent", "student", "relationship", "is_primary_contact")
    list_filter = ("relationship", "is_primary_contact")
    search_fields = (
        "parent__user__email",
        "student__user__email",
    )


@admin.register(SocialAccount)
class SocialAccountAdmin(admin.ModelAdmin):
    """Admin configuration for OAuth/Social accounts."""

    list_display = ("user", "provider", "provider_uid", "created_at")
    list_filter = ("provider",)
    search_fields = ("user__email", "provider_uid")
    readonly_fields = ("created_at", "raw_data")


@admin.register(RefreshToken)
class RefreshTokenAdmin(admin.ModelAdmin):
    """Admin configuration for tracking and managing JWT refresh tokens."""

    list_display = ("id", "user", "issued_at", "expires_at", "revoked_at", "ip_address")
    list_filter = ("issued_at", "expires_at")
    search_fields = ("id", "user__email", "ip_address", "user_agent")
    readonly_fields = ("id", "issued_at", "user_agent", "ip_address", "replaced_by")
