from django.contrib import admin, messages
from django.db.models import F
from django.utils import timezone

from .models import GameSave


@admin.register(GameSave)
class GameSaveAdmin(admin.ModelAdmin):
    list_display = ("login", "nick", "earned_fmt", "axe_level", "hidden", "reset_epoch", "created_at", "updated_at")
    list_display_links = ("login",)
    list_editable = ("hidden",)
    list_filter = ("hidden", "axe_level")
    search_fields = ("user__username", "nick")
    ordering = ("-earned",)
    list_select_related = ("user",)
    actions = ("reset_progress", "hide", "unhide")
    # прогресс правим только сбросом: «вручную накрученные» числа ломают смысл рейтинга, а JSON не для глаз
    fields = ("user", "nick", "hidden", "earned", "axe_level", "reset_epoch", "created_at", "updated_at")
    readonly_fields = ("user", "earned", "axe_level", "reset_epoch", "created_at", "updated_at")

    @admin.display(description="Аккаунт", ordering="user__username")
    def login(self, obj):
        return obj.user.get_username()

    @admin.display(description="Заработано, $", ordering="earned")
    def earned_fmt(self, obj):
        return f"{obj.earned:,}".replace(",", " ")

    # удаление запрещено намеренно: у удалённой записи пропадает reset_epoch, и браузер игрока
    # молча создаст её заново со старым локальным прогрессом. Сброс эту проблему закрывает.
    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    @admin.action(description="Сбросить прогресс (на сервере и на устройствах игрока)", permissions=["change"])
    def reset_progress(self, request, queryset):
        n = queryset.update(data={}, earned=0, axe_level=0, nick="", reset_epoch=F("reset_epoch") + 1, updated_at=timezone.now())
        self.message_user(request, f"Сброшено сохранений: {n}. При следующем заходе игрока его браузер тоже начнёт с нуля.", messages.SUCCESS)

    @admin.action(description="Скрыть из таблицы лидеров", permissions=["change"])
    def hide(self, request, queryset):
        self.message_user(request, f"Скрыто: {queryset.update(hidden=True)}", messages.SUCCESS)

    @admin.action(description="Вернуть в таблицу лидеров", permissions=["change"])
    def unhide(self, request, queryset):
        self.message_user(request, f"Возвращено: {queryset.update(hidden=False)}", messages.SUCCESS)
