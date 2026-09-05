from pathlib import Path

from django.conf import settings
from django.core.files import File
from django.core.management.base import BaseCommand

from house.models import FurnitureItem

FIXTURES_DIR = Path(settings.BASE_DIR) / 'house' / 'fixtures' / 'koltuk'


class Command(BaseCommand):
    help = 'Seeds the Koltuk sofa as the first FurnitureItem catalog entry.'

    def handle(self, *args, **options):
        item, created = FurnitureItem.objects.get_or_create(
            key='koltuk-sofa',
            defaults={'name': 'Koltuk Sofa', 'price': 25},
        )
        if not created and item.model_file:
            self.stdout.write('koltuk-sofa already seeded, skipping.')
            return

        with open(FIXTURES_DIR / 'Koltuk.obj', 'rb') as f:
            item.model_file.save('Koltuk.obj', File(f), save=False)
        with open(FIXTURES_DIR / 'Koltuk1.png', 'rb') as f:
            item.texture_file.save('Koltuk1.png', File(f), save=False)
        with open(FIXTURES_DIR / 'Koltuk1.png', 'rb') as f:
            item.thumbnail_image.save('Koltuk1_thumb.png', File(f), save=False)
        item.save()
        self.stdout.write(self.style.SUCCESS('Seeded koltuk-sofa.'))
