from django.http import HttpRequest
from ninja import Router

from common.auth import CookieOrBearerJWTAuth

from .models import TtsVoiceSetting
from .schemas import TtsVoiceSettingOut

router = Router(tags=['tts'], auth=CookieOrBearerJWTAuth())


@router.get('/voices', response=list[TtsVoiceSettingOut], operation_id='list_tts_voices')
def list_tts_voices(request: HttpRequest):
    """Every configured (language, profile) -> Piper voice_id pair (see
    tts/models.py's TtsVoiceSetting) — frontend/lib/piper-tts.ts uses this
    to override its hardcoded default voice maps."""
    return list(TtsVoiceSetting.objects.all())
