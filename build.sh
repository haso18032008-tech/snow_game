#!/usr/bin/env bash
# Build Command для Render: запускается при каждом деплое.
set -o errexit

pip install -r requirements.txt

python manage.py collectstatic --no-input
python manage.py migrate

# Возвращает/создаёт админа из переменных GAME_ADMIN_USERNAME (и GAME_ADMIN_PASSWORD
# для самого первого создания). Без переменных ничего не делает и сборку не ломает.
python manage.py ensure_admin
