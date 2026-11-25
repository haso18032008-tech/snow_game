from django.conf import settings
from django.db import models
from django.utils import timezone


class GameSave(models.Model):
    """
    Серверное сохранение игры — по одному на игрока. Нужно, чтобы прогресс переезжал между
    устройствами и чтобы работала таблица лидеров. Без аккаунта игра идёт только в localStorage.
    """
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="snow_save")
    data = models.JSONField(default=dict)
    # очки таблицы лидеров = «всего заработано денег с продаж»: только растёт, поэтому по нему же
    # решаем, какое из двух сохранений (локальное/серверное) новее
    earned = models.BigIntegerField(default=0, db_index=True)
    axe_level = models.PositiveSmallIntegerField(default=0)
    nick = models.CharField(max_length=16, blank=True)
    # скрыт из таблицы лидеров (ручная модерация в админке); сохранение при этом продолжает работать
    hidden = models.BooleanField("скрыт из рейтинга", default=False)
    # «поколение» сохранения: админ, сбрасывая прогресс, увеличивает число. Клиент помнит, какое поколение
    # он видел, и устройство со старым не может вернуть сброшенный прогресс обратно (иначе локальная копия
    # в браузере при ближайшей синхронизации воскресила бы всё, что админ обнулил)
    reset_epoch = models.PositiveIntegerField(default=0)
    # created_at заведён заранее, под будущую панель статистики (новые игроки по дням);
    # «последняя активность» — это updated_at
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "сохранение игры"
        verbose_name_plural = "сохранения игры"

    def __str__(self):
        return f"{self.user_id}: {self.earned}"
