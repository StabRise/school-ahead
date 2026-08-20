"""
URL configuration for core project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.1/topics/http/urls/
"""
from django.contrib import admin
from django.urls import path
from ninja import NinjaAPI

from academics.api import router as academics_router
from accounts.api import router as accounts_router
from lessons.api import router as lessons_router
from scheduling.api import router as scheduling_router
from tutoring.api import router as tutoring_router

api = NinjaAPI(title='school-ahead API')
api.add_router('/auth', accounts_router)
api.add_router('/academics', academics_router)
api.add_router('/student-lessons', lessons_router)
api.add_router('/tutor', tutoring_router)
api.add_router('/schedule', scheduling_router)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', api.urls),
]
