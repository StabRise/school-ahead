from django.contrib import admin

from .models import ProgressBadge


@admin.register(ProgressBadge)
class ProgressBadgeAdmin(admin.ModelAdmin):
    list_display = ('name', 'icon', 'level', 'min_percent', 'max_percent')
    ordering = ('level',)
