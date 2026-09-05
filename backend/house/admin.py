from django.contrib import admin

from .models import FurnitureItem, FurniturePurchase, FurnitureTexture, PlacedFurnitureItem


class FurnitureTextureInline(admin.TabularInline):
    model = FurnitureTexture
    extra = 0


@admin.register(FurnitureItem)
class FurnitureItemAdmin(admin.ModelAdmin):
    """Where a tutor/admin adds new furniture — uploads the .obj/.stl,
    any number of texture images (referenced from an optional .mtl by
    original filename — see models.FurnitureTexture) or a plain flat one, a
    shop thumbnail, and sets its Diamond price. See models.FurnitureItem."""

    list_display = ('name', 'key', 'price', 'surface', 'kind', 'order_index', 'is_active')
    list_filter = ('is_active', 'surface', 'kind')
    search_fields = ('name', 'key')
    ordering = ('order_index', 'id')
    inlines = [FurnitureTextureInline]
    fields = (
        'key', 'name', 'is_active', 'order_index', 'price', 'surface', 'kind',
        'model_file', 'material_file', 'thumbnail_image',
        'default_position_x', 'default_position_y', 'default_position_z',
        'default_rotation_x', 'default_rotation_y', 'default_rotation_z',
        'default_scale',
    )


@admin.register(FurniturePurchase)
class FurniturePurchaseAdmin(admin.ModelAdmin):
    """Audit view of who bought what."""

    list_display = ('student_profile', 'item', 'purchased_at')
    list_filter = ('purchased_at',)
    search_fields = ('student_profile__user__email', 'item__key')
    autocomplete_fields = ('student_profile', 'item')


@admin.register(PlacedFurnitureItem)
class PlacedFurnitureItemAdmin(admin.ModelAdmin):
    """Audit view of where every student's furniture currently sits."""

    list_display = ('student_profile', 'item', 'position_x', 'position_y', 'position_z')
    search_fields = ('student_profile__user__email', 'item__key')
    autocomplete_fields = ('student_profile', 'item')
