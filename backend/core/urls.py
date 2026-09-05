"""
URL configuration for core project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.1/topics/http/urls/
"""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from ninja import NinjaAPI

from academics.api import router as academics_router
from accounts.api import router as accounts_router
from achievements.api import router as achievements_router
from dictionary.api import router as dictionary_router
from house.api import router as house_router
from lessons.api import router as lessons_router
from scheduling.api import router as scheduling_router
from tts.api import router as tts_router
from tutoring.api import router as tutoring_router

api = NinjaAPI(title='school-ahead API')
api.add_router('/auth', accounts_router)
api.add_router('/academics', academics_router)
api.add_router('/student-lessons', lessons_router)
api.add_router('/tutor', tutoring_router)
api.add_router('/schedule', scheduling_router)
api.add_router('/achievements', achievements_router)
api.add_router('/tts', tts_router)
api.add_router('/dictionary', dictionary_router)
api.add_router('/house', house_router)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', api.urls),
    path('api/', include('mcp_server.urls')),  # -> /api/mcp
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
