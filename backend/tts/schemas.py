from ninja import Schema


class TtsVoiceSettingOut(Schema):
    language: str
    profile: str
    voice_id: str
