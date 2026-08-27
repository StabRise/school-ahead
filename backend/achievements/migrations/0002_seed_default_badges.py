from django.db import migrations

# Default tiers — name/icon/level are meant to be tweaked from the admin
# afterwards (see achievements.models.ProgressBadge); percent boundaries are
# adjusted slightly from the originally requested ranges (which overlapped
# at 40/60/85) to be contiguous and non-overlapping, and to include 0%.
DEFAULT_BADGES = (
    {'name': 'Новачок', 'icon': '🐣', 'level': 1, 'min_percent': 0, 'max_percent': 20},
    {'name': 'Шукач пригод', 'icon': '🧭', 'level': 2, 'min_percent': 21, 'max_percent': 40},
    {'name': 'Дослідник', 'icon': '🔍', 'level': 3, 'min_percent': 41, 'max_percent': 60},
    {'name': 'Знавець', 'icon': '🎓', 'level': 4, 'min_percent': 61, 'max_percent': 85},
    {'name': 'Експерт', 'icon': '🏆', 'level': 5, 'min_percent': 86, 'max_percent': 100},
)


def seed_badges(apps, schema_editor):
    ProgressBadge = apps.get_model('achievements', 'ProgressBadge')
    for badge in DEFAULT_BADGES:
        ProgressBadge.objects.update_or_create(level=badge['level'], defaults=badge)


def remove_default_badges(apps, schema_editor):
    ProgressBadge = apps.get_model('achievements', 'ProgressBadge')
    ProgressBadge.objects.filter(level__in=[badge['level'] for badge in DEFAULT_BADGES]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('achievements', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed_badges, remove_default_badges),
    ]
