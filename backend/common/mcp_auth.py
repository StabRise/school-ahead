from django.core.exceptions import PermissionDenied
from ninja_apikey.security import check_apikey
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed


class NinjaAPIKeyAuthentication(BaseAuthentication):
    """DRF auth for django-mcp-server, reusing ninja_apikey's X-API-Key header and
    APIKey model so keys issued via Django admin work for both Ninja and MCP."""

    def authenticate(self, request):
        api_key = request.META.get('HTTP_X_API_KEY')
        if not api_key:
            return None
        user = check_apikey(api_key)
        if not user:
            raise AuthenticationFailed('Invalid or expired API key')
        return (user, None)


def _is_staff_or_tutor(user) -> bool:
    return bool(user and user.is_authenticated and (user.is_staff or hasattr(user, 'tutor_profile')))


def ensure_mcp_staff_or_tutor(request) -> None:
    if not _is_staff_or_tutor(getattr(request, 'user', None)):
        raise PermissionDenied('Staff or tutor access required')


class StaffOrTutorScopedQueryToolset:
    """Mixin for ModelQueryToolset subclasses that restricts querying to
    staff/tutor users. Not a ModelQueryToolset subclass itself, so
    ModelQueryToolsetMeta never registers it as its own collection — mix it
    in before ModelQueryToolset."""

    def get_queryset(self):
        ensure_mcp_staff_or_tutor(self.request)
        return super().get_queryset()
