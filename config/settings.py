"""
Настройки «Снежной фермы» — отдельного проекта, не связанного с Финстатом.

Как и в Финстате, один файл на локаль и прод: локально ничего задавать не нужно
(SQLite, DEBUG=True), а всё «боевое» включается переменными окружения.
"""

import os
from pathlib import Path

import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent


def env_list(name):
    return [x.strip() for x in os.environ.get(name, "").split(",") if x.strip()]


# --- Секреты и режим ---------------------------------------------------
# Дефолт нужен только локально. На Render обязательно задать DJANGO_SECRET_KEY:
# ключ от Финстата сюда переиспользовать нельзя — у проектов теперь разные сессии.
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "django-insecure-snow-game-local-only")
DEBUG = os.environ.get("DJANGO_DEBUG", "True") == "True"

# Хосты: домен игры (например snow-game.com) → DJANGO_ALLOWED_HOSTS через запятую;
# адрес вида *.onrender.com Render подставляет сам в RENDER_EXTERNAL_HOSTNAME.
_hosts = env_list("DJANGO_ALLOWED_HOSTS")
if os.environ.get("RENDER_EXTERNAL_HOSTNAME"):
    _hosts.append(os.environ["RENDER_EXTERNAL_HOSTNAME"])

# CSRF-источники считаем ДО того, как в DEBUG подставим "*", иначе получится "https://*"
CSRF_TRUSTED_ORIGINS = [f"https://{h}" for h in _hosts]
ALLOWED_HOSTS = ["localhost", "127.0.0.1"] + _hosts
if DEBUG:
    # с телефона по Wi-Fi (192.168.x.x) — только в разработке
    ALLOWED_HOSTS = ["*"]

# Render завершает HTTPS на своём прокси; без этого SECURE_SSL_REDIRECT зациклится
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    # неделя, а не максимум — чтобы при ошибке в домене не отрезать себя от сайта
    SECURE_HSTS_SECONDS = 60 * 60 * 24 * 7


# --- Приложения ----------------------------------------------------------
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",

    # регистрация/вход: логин+пароль и Google в одной модели аккаунта
    "allauth",
    "allauth.account",
    "allauth.socialaccount",
    "allauth.socialaccount.providers.google",

    "snow_game",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "allauth.account.middleware.AccountMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],  # тут лежит наш стиль страниц входа
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"


# --- Аккаунты ------------------------------------------------------------
AUTHENTICATION_BACKENDS = [
    "django.contrib.auth.backends.ModelBackend",
    "allauth.account.auth_backends.AuthenticationBackend",
]
# Вход и регистрация по логину и паролю, без email: для игры это лишнее трение.
# Следствие: «забыл пароль» по почте недоступен — восстановить доступ можно только
# через привязанный Google или через админа.
ACCOUNT_LOGIN_METHODS = {"username"}
ACCOUNT_SIGNUP_FIELDS = ["username*", "password1*", "password2*"]
ACCOUNT_EMAIL_VERIFICATION = "none"
LOGIN_URL = "account_login"
LOGIN_REDIRECT_URL = "/"
LOGOUT_REDIRECT_URL = "/"

# Google — дополнительный способ. Включается, только если заданы обе переменные,
# иначе кнопки «Войти через Google» в интерфейсе просто нет.
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
GOOGLE_ENABLED = bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)
SOCIALACCOUNT_PROVIDERS = {}
if GOOGLE_ENABLED:
    SOCIALACCOUNT_PROVIDERS["google"] = {
        "APP": {"client_id": GOOGLE_CLIENT_ID, "secret": GOOGLE_CLIENT_SECRET, "key": ""},
        "SCOPE": ["profile", "email"],
    }
SOCIALACCOUNT_LOGIN_ON_GET = True  # без лишней страницы-подтверждения перед уходом в Google
# Автоматически НЕ сливаем Google-вход с аккаунтом по совпадению почты: у парольных
# аккаунтов почты нет, а привязку игрок делает осознанно в настройках.
SOCIALACCOUNT_EMAIL_AUTHENTICATION = False

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 6}},
]


# --- База данных ---------------------------------------------------------
# Без DATABASE_URL — SQLite-файл (локально). На Render подставляется Postgres.
# У игры СВОЯ база: не указывать здесь DATABASE_URL Финстата.
DATABASES = {
    "default": dj_database_url.config(
        default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
        conn_max_age=600,
    )
}

LANGUAGE_CODE = "ru"
TIME_ZONE = "Europe/Minsk"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
