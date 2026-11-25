import json

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.core.management.color import no_style
from django.db import connection, transaction
from django.utils.dateparse import parse_datetime

from snow_game.models import GameSave


class Command(BaseCommand):
    help = (
        "Переносит игроков из Финстата. Файл делает защищённый адрес /admin-tools/export-snow-players/ "
        "в Финстате (только для суперпользователя). Идентификаторы и хеши паролей сохраняются, "
        "поэтому пароли работают как раньше, а локальный прогресс в браузерах не сбрасывается."
    )

    def add_arguments(self, parser):
        parser.add_argument("path")

    @transaction.atomic
    def handle(self, *args, **opts):
        User = get_user_model()
        try:
            with open(opts["path"], encoding="utf-8") as f:
                payload = json.load(f)
        except (OSError, ValueError) as e:
            raise CommandError(f"Не удалось прочитать файл: {e}")
        if payload.get("version") != 1:
            raise CommandError("Неизвестная версия файла экспорта.")

        users = skipped = saves = 0
        for u in payload["users"]:
            clash = User.objects.filter(username=u["username"]).exclude(pk=u["id"]).first()
            if clash:
                # тот же логин уже занят другим id — молча затирать нельзя, иначе прогресс уйдёт не тому человеку
                self.stderr.write(f"Пропущен «{u['username']}»: логин занят аккаунтом id={clash.pk}.")
                skipped += 1
                continue
            # id сохраняем: клиент сверяет uid с меткой владельца в localStorage (cloud.js)
            User.objects.update_or_create(pk=u["id"], defaults={
                "username": u["username"], "password": u["password"],
                "is_staff": u["is_staff"], "is_superuser": u["is_superuser"],
                "date_joined": parse_datetime(u["date_joined"]),
            })
            users += 1

        for s in payload["saves"]:
            if not User.objects.filter(pk=s["user_id"]).exists():
                continue
            cur = GameSave.objects.filter(user_id=s["user_id"]).first()
            # повторный запуск не должен откатывать прогресс, ушедший вперёд уже здесь
            if cur and cur.earned > s["earned"]:
                continue
            GameSave.objects.update_or_create(user_id=s["user_id"], defaults={
                "data": s["data"], "earned": s["earned"], "axe_level": s["axe_level"],
                "nick": s["nick"], "hidden": s["hidden"], "reset_epoch": s["reset_epoch"],
            })
            saves += 1

        # после вставки с явными id счётчик автонумерации Postgres отстаёт — следующая регистрация упала бы на дубле
        for sql in connection.ops.sequence_reset_sql(no_style(), [User]):
            with connection.cursor() as c:
                c.execute(sql)
        self.stdout.write(self.style.SUCCESS(f"Готово: аккаунтов {users}, сохранений {saves}, пропущено {skipped}."))
