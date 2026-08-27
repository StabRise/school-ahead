import pytest

from achievements import services
from achievements.models import ProgressBadge

pytestmark = pytest.mark.django_db


def test_get_badge_for_percent_matches_seeded_tiers():
    assert services.get_badge_for_percent(0).name == 'Новачок'
    assert services.get_badge_for_percent(20).name == 'Новачок'
    assert services.get_badge_for_percent(21).name == 'Шукач пригод'
    assert services.get_badge_for_percent(50).name == 'Дослідник'
    assert services.get_badge_for_percent(70).name == 'Знавець'
    assert services.get_badge_for_percent(100).name == 'Експерт'


def test_get_badge_for_percent_falls_back_to_lowest_level_on_gap():
    ProgressBadge.objects.all().delete()
    low = ProgressBadge.objects.create(name='Low', level=1, min_percent=0, max_percent=10)
    ProgressBadge.objects.create(name='High', level=2, min_percent=90, max_percent=100)

    assert services.get_badge_for_percent(50) == low


def test_get_badge_for_percent_none_when_no_badges_exist():
    ProgressBadge.objects.all().delete()
    assert services.get_badge_for_percent(50) is None
