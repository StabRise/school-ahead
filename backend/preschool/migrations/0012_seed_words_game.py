from django.db import migrations

WORDS_GAME_URL = '/games/words'
WORDS_GAME_TITLE = 'Слова'
# The category 0009_seed_games created for the reading games.
READING_CATEGORY = 'Читання'


def forwards(apps, schema_editor):
    """Adds the "Слова" game to the /games picker, last in "Читання" —
    skipped when a Game already points at its url (e.g. added by hand in
    the admin)."""
    GameCategory = apps.get_model('preschool', 'GameCategory')
    Game = apps.get_model('preschool', 'Game')
    if Game.objects.filter(url=WORDS_GAME_URL).exists():
        return
    category = GameCategory.objects.filter(name=READING_CATEGORY).first()
    if category is None:
        last = GameCategory.objects.order_by('-order').first()
        category = GameCategory.objects.create(name=READING_CATEGORY, order=last.order + 1 if last else 0)
    last_game = Game.objects.filter(category=category).order_by('-order').first()
    Game.objects.create(
        title=WORDS_GAME_TITLE,
        url=WORDS_GAME_URL,
        category=category,
        order=last_game.order + 1 if last_game else 0,
    )


def backwards(apps, schema_editor):
    apps.get_model('preschool', 'Game').objects.filter(url=WORDS_GAME_URL).delete()


class Migration(migrations.Migration):
    dependencies = [
        ('preschool', '0011_story_language'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
