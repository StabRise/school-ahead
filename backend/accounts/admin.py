from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import (
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


admin.site.register(StudentProfile)
admin.site.register(TutorProfile)
admin.site.register(ParentProfile)
admin.site.register(ParentStudentLink)
admin.site.register(SocialAccount)
admin.site.register(RefreshToken)
