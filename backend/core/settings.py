"""
Django settings for core project.

For more information on this file, see
https://docs.djangoproject.com/en/6.1/topics/settings/

For the full list of settings and their values, see
https://docs.djangoproject.com/en/6.1/ref/settings/
"""

from datetime import timedelta
from pathlib import Path

import environ
from corsheaders.defaults import default_headers

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env()
environ.Env.read_env(BASE_DIR.parent / '.env')


# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/6.1/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = env('DJANGO_SECRET_KEY', default='django-insecure-w+&kmf3wh_a$xkx8qpbq6a8jc&ct=^s6--xe6x@7xk*k-ts6@8')

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = env.bool('DJANGO_DEBUG', default=True)

ALLOWED_HOSTS = env.list('DJANGO_ALLOWED_HOSTS', default=['localhost', '127.0.0.1'])


# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'corsheaders',
    'ninja',
    'ninja_jwt',
    'ninja_jwt.token_blacklist',
    'ninja_apikey',
    'rest_framework',
    'mcp_server',
    'common',
    'accounts',
    'academics',
    'lessons',
    'tutoring',
    'scheduling',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'core.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'core.wsgi.application'


# Database
# https://docs.djangoproject.com/en/6.1/ref/settings/#databases

DATABASES = {
    'default': env.db(
        'DATABASE_URL',
        default='postgres://school_ahead:school_ahead@localhost:5432/school_ahead',
    )
}


# Auth

AUTH_USER_MODEL = 'accounts.User'

AUTHENTICATION_BACKENDS = [
    'django.contrib.auth.backends.ModelBackend',
]


# Password validation
# https://docs.djangoproject.com/en/6.1/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization
# https://docs.djangoproject.com/en/6.1/topics/i18n/

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'UTC'

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/6.1/howto/static-files/

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'


# Media (user uploads — lesson materials, student submissions, icons,
# avatars, quiz choice images). MEDIA_ROOT is only used by the local
# filesystem backend below; served via core/urls.py in DEBUG only. See
# common/storage.py for the upload_to functions that keep filenames unique.

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'


# File storage backend — 'filesystem' (default, MEDIA_ROOT above) or 's3'.
# Set DJANGO_STORAGE_BACKEND=s3 to store uploads in S3 (or an S3-compatible
# service — MinIO, DigitalOcean Spaces, Cloudflare R2, ... — via
# AWS_S3_ENDPOINT_URL) instead of on local disk. Only FileField/ImageField
# uploads move; STATIC_URL/staticfiles is untouched.
DJANGO_STORAGE_BACKEND = env('DJANGO_STORAGE_BACKEND', default='filesystem')

if DJANGO_STORAGE_BACKEND == 's3':
    _s3_storage_options = {
        'bucket_name': env('AWS_STORAGE_BUCKET_NAME'),
        'region_name': env('AWS_S3_REGION_NAME', default=''),
        # Point at an S3-compatible provider instead of AWS.
        'endpoint_url': env('AWS_S3_ENDPOINT_URL', default=''),
        # CDN / custom domain to serve files from instead of the bucket's
        # own endpoint (e.g. a CloudFront distribution).
        'custom_domain': env('AWS_S3_CUSTOM_DOMAIN', default=''),
        'access_key': env('AWS_ACCESS_KEY_ID', default=''),
        'secret_key': env('AWS_SECRET_ACCESS_KEY', default=''),
        'file_overwrite': False,
        'querystring_auth': env.bool('AWS_S3_QUERYSTRING_AUTH', default=False),
    }
    _default_storage = {
        'BACKEND': 'storages.backends.s3.S3Storage',
        # Blank optional values are dropped rather than passed through, so
        # boto3's own credential/region resolution (IAM role, ~/.aws/config,
        # AWS_*  env vars) applies instead of being overridden with "".
        'OPTIONS': {key: value for key, value in _s3_storage_options.items() if value != ''},
    }
else:
    _default_storage = {'BACKEND': 'django.core.files.storage.FileSystemStorage'}

STORAGES = {
    'default': _default_storage,
    # Manifest storage requires collectstatic to have been run, so it's only
    # used outside DEBUG (production/Docker) — local `runserver` keeps serving
    # static files directly without a build step.
    'staticfiles': {
        'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'
        if DEBUG
        else 'whitenoise.storage.CompressedManifestStaticFilesStorage'
    },
}


# Email
# https://docs.djangoproject.com/en/6.1/topics/email/#topic-email-configuration

MAILERS = {
    'default': {
        'BACKEND': 'django.core.mail.backends.console.EmailBackend',
    },
}


# CORS — required so the browser can call Django directly with credentials.
# See docs/architecture/05-auth-flow.md.

CORS_ALLOWED_ORIGINS = env.list('CORS_ALLOWED_ORIGINS', default=['http://localhost:3000'])
CORS_ALLOW_CREDENTIALS = True

# Django's *built-in* CSRF middleware — distinct from the custom JWT
# double-submit check below. Only exercised by session-authenticated,
# same-origin form posts (the admin login form), but still needs the
# admin's own origin trusted explicitly for HTTPS requests, or Django
# rejects them with "Origin checking failed" regardless of any valid
# session/cookie.
CSRF_TRUSTED_ORIGINS = env.list('CSRF_TRUSTED_ORIGINS', default=[])

# Behind a reverse proxy that terminates TLS and forwards over plain HTTP,
# request.is_secure() is False unless told to trust the proxy's
# X-Forwarded-Proto header — otherwise Django computes the request's origin
# as http://..., which never matches the browser's actual https:// Origin
# header, and CSRF_TRUSTED_ORIGINS above can't help either. Only enable this
# if the proxy always sets/overwrites this header itself (never pass through
# a client-supplied one) — see Django's SECURE_PROXY_SSL_HEADER docs.
if env.bool('DJANGO_BEHIND_TLS_PROXY', default=False):
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')


# Auth cookies — httpOnly, cross-site, shared parent domain.
# See docs/architecture/05-auth-flow.md's cookie attributes table.

AUTH_COOKIE_DOMAIN = env('AUTH_COOKIE_DOMAIN', default='localhost')
AUTH_COOKIE_SECURE = env.bool('AUTH_COOKIE_SECURE', default=False)
AUTH_COOKIE_SAMESITE = env('AUTH_COOKIE_SAMESITE', default='Lax')

ACCESS_TOKEN_COOKIE_NAME = 'access_token'
REFRESH_TOKEN_COOKIE_NAME = 'refresh_token'
CSRF_TOKEN_COOKIE_NAME = 'csrf_token'
CSRF_TOKEN_HEADER_NAME = 'X-CSRF-Token'

# django-cors-headers rejects any request header not in this list at the
# preflight stage, before the request ever reaches a view — the custom CSRF
# header needs to be added on top of the library's defaults.
CORS_ALLOW_HEADERS = [*default_headers, CSRF_TOKEN_HEADER_NAME.lower()]

ACCESS_TOKEN_LIFETIME = timedelta(minutes=15)
REFRESH_TOKEN_LIFETIME = timedelta(days=30)


# django-ninja-jwt
# https://eadwincode.github.io/django-ninja-jwt/

NINJA_JWT = {
    'ACCESS_TOKEN_LIFETIME': ACCESS_TOKEN_LIFETIME,
    'REFRESH_TOKEN_LIFETIME': REFRESH_TOKEN_LIFETIME,
    'SIGNING_KEY': SECRET_KEY,
    'ALGORITHM': 'HS256',
}


# Google sign-in
# See docs/architecture/05-auth-flow.md.

GOOGLE_CLIENT_ID = env('GOOGLE_CLIENT_ID', default='')


# django-ninja pagination — shared default/max page size for every
# @paginate list endpoint. See docs/architecture/04-api-design.md.

NINJA_PAGINATION_PER_PAGE = 20
NINJA_PAGINATION_MAX_LIMIT = 50


# django-mcp-server — exposes curriculum models (Subject, Topic, Lesson,
# LessonAttachment, QuizQuestion, QuizChoice) as MCP query tools, authenticated
# with the same ninja-api-key X-API-Key header used by the rest of the API.
# See common/mcp_auth.py, academics/mcp.py, lessons/mcp.py.

DJANGO_MCP_AUTHENTICATION_CLASSES = [
    'common.mcp_auth.NinjaAPIKeyAuthentication',
]
DJANGO_MCP_GLOBAL_SERVER_CONFIG = {
    'name': 'school-ahead',
    'stateless': True,
}
