# Снежная ферма

## Локальный запуск

```
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

## Переменные окружения (Render → Environment)

| Переменная | Зачем |
|---|---|
| `DJANGO_SECRET_KEY` | обязательна в проде, **новая**, не от Финстата |
| `DJANGO_DEBUG` | `False` в проде |
| `DATABASE_URL` | строка подключения к **отдельной** Postgres игры |
| `DJANGO_ALLOWED_HOSTS` | свой домен, например `snow-game.com,www.snow-game.com` (адрес `*.onrender.com` Render добавляет сам) |
| `GAME_ADMIN_USERNAME` | логин админа; `build.sh` выдаёт ему `is_staff` + `is_superuser` на каждом деплое |
| `GAME_ADMIN_PASSWORD` | нужен только если такого аккаунта ещё нет (создастся при сборке); после первого деплоя можно удалить |
| `FINSTAT_URL` | адрес Финстата (`https://...`) для раздела «Наши проекты» в настройках игры; пусто — раздела нет |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | включают вход через Google; без них кнопки нет |

## Деплой на Render

1. New → Web Service → репозиторий игры. Build Command: `./build.sh`. Start Command: `gunicorn config.wsgi`.
2. Задать переменные из таблицы. Базу взять отдельную от Финстата.
3. Settings → Custom Domains → добавить домен, прописать DNS у регистратора, нажать Verify.
4. В Финстате задать `SNOW_GAME_URL=https://<домен>/`.

Google: Google Cloud Console → APIs & Services → Credentials → OAuth client (Web).
Authorized redirect URI: `https://<домен>/accounts/google/login/callback/`.

## Перенос игроков из Финстата

1. Войти в Финстат суперпользователем и открыть `/admin-tools/export-snow-players/` — скачается `players.json`
   (внутри хеши паролей: не коммитить, не пересылать).
2. Локально, из папки этого проекта, с «внешней» строкой подключения новой базы:
   `DATABASE_URL="<External Database URL>" python manage.py migrate`
   `DATABASE_URL="<External Database URL>" python manage.py import_players players.json`
3. Команда безопасна к повторному запуску: прогресс, ушедший вперёд уже в новой базе, не откатывается.

## Админ

`ensure_admin` выдаёт права по `GAME_ADMIN_USERNAME`. Управление игроками: `/admin/` → «Сохранения игры»
(скрыть из рейтинга, сбросить прогресс).
