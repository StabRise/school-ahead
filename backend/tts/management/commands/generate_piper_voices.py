from datetime import date
from pathlib import Path

import requests
from django.core.management.base import BaseCommand

# Sourced straight from upstream rather than @diffusionstudio/vits-web's
# bundled snapshot (the JS library the frontend uses to run these models in
# the browser) — that snapshot lags rhasspy's manifest. See
# frontend/lib/piper-voices.generated.ts and generate-piper-voices.mjs,
# which do the same thing for the frontend's copy of this list.
VOICES_URL = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/voices.json'
OUTPUT_PATH = Path(__file__).resolve().parent.parent.parent / 'piper_voices.py'


class Command(BaseCommand):
    help = 'Regenerates tts/piper_voices.py from the rhasspy/piper-voices voice manifest.'

    def handle(self, *args, **options):
        response = requests.get(VOICES_URL, timeout=30)
        response.raise_for_status()
        voice_ids = sorted(response.json().keys())

        lines = [
            '# GENERATED FILE — do not edit by hand.',
            '# Regenerate with: uv run manage.py generate_piper_voices',
            '# (tts/management/commands/generate_piper_voices.py, sourced from',
            f'# {VOICES_URL})',
            f'# Generated: {date.today().isoformat()}',
            '',
            '# choices=... for TtsVoiceSetting.voice_id — every voice id published',
            '# upstream at rhasspy/piper-voices as of the generation date above.',
            '# Frontend has the matching list at frontend/lib/piper-voices.generated.ts.',
            'PIPER_VOICE_CHOICES = [',
            *(f"    ('{voice_id}', '{voice_id}')," for voice_id in voice_ids),
            ']',
            '',
        ]
        OUTPUT_PATH.write_text('\n'.join(lines))
        self.stdout.write(self.style.SUCCESS(f'Wrote {len(voice_ids)} voices to {OUTPUT_PATH}'))
