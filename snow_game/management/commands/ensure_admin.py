from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
import os


class Command(BaseCommand):
    help = (
        "Гарантирует, что аккаунт из GAME_ADMIN_USERNAME — админ (is_staff + is_superuser). "
        "Запускается в build.sh на каждом деплое, поэтому права не потеряются, даже если базу пересоздадут. "
        "Если такого аккаунта нет и задан GAME_ADMIN_PASSWORD — создаёт его."
    )

    def add_arguments(self, parser):
        parser.add_argument("--username", default=os.environ.get("GAME_ADMIN_USERNAME", ""))

    def handle(self, *args, **opts):
        # на бесплатном Render нет Shell, поэтому права выдаём не руками, а при сборке
        username = opts["username"].strip()
        if not username:
            self.stdout.write("GAME_ADMIN_USERNAME не задан — пропускаю.")
            return
        User = get_user_model()
        user = User.objects.filter(username=username).first()
        if user is None:
            password = os.environ.get("GAME_ADMIN_PASSWORD", "")
            if not password:
                self.stdout.write(f"Аккаунта «{username}» нет, а GAME_ADMIN_PASSWORD не задан — создавать нечего. "
                                  "Зарегистрируйся в игре под этим логином и задеплой ещё раз.")
                return
            user = User.objects.create_user(username=username, password=password)
            self.stdout.write(f"Создан аккаунт «{username}».")
        if not (user.is_staff and user.is_superuser):
            user.is_staff = user.is_superuser = True
            user.save(update_fields=["is_staff", "is_superuser"])
            self.stdout.write(f"«{username}» теперь админ.")
        else:
            self.stdout.write(f"«{username}» уже админ.")
