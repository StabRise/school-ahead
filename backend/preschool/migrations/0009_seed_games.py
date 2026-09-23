from django.db import migrations

# The picker as it was hardcoded in frontend's game-choice.tsx
# (GAME_CATEGORIES + GAME_CATALOG titles). Icons are left empty: the
# frontend falls back to each game's built-in static cover / SVG, matched
# by url.
CATEGORIES = [
    ('Картки', [
        ('Кульки', '/games/balloons'),
        ('Картки для навчання', '/games/cards'),
    ]),
    ('Читання', [
        ('Склади', '/games/syllables'),
        ('Казки', '/games/stories'),
        ('Жабки-Стрибунці', '/games/jumping-frogs'),
        ('Картки', '/games/syllables2'),
    ]),
    ('Математика', [
        ('Математика', '/games/math'),
        ('Чарівний коктейль', '/games/cocktail'),
        ('Машинки', '/games/cars'),
    ]),
    ('Інше', [
        ('Потяг', '/games/trains'),
    ]),
]


def forwards(apps, schema_editor):
    GameCategory = apps.get_model('preschool', 'GameCategory')
    Game = apps.get_model('preschool', 'Game')
    if GameCategory.objects.exists():
        return
    for category_order, (name, games) in enumerate(CATEGORIES):
        category = GameCategory.objects.create(name=name, order=category_order)
        for game_order, (title, url) in enumerate(games):
            Game.objects.create(title=title, url=url, category=category, order=game_order)


def backwards(apps, schema_editor):
    apps.get_model('preschool', 'Game').objects.all().delete()
    apps.get_model('preschool', 'GameCategory').objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ('preschool', '0008_game'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
