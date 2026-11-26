import json
import re

from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from django.urls import reverse
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_http_methods

from .models import GameSave

MAX_BODY = 30000
KEY_RE = re.compile(r"^[a-z0-9]{1,12}$")


def _can_save(user):
    # гостей в игре больше нет: либо вошёл в аккаунт (сервер), либо играет локально в браузере
    return user.is_authenticated


@ensure_csrf_cookie  # игра шлёт POST из JS, ей нужна csrf-кука
def snow_game_view(request):
    auth = _can_save(request.user)
    cfg = {
        "auth": auth,
        # клиент по нему определяет, чей прогресс лежит в localStorage этого браузера
        "uid": request.user.id if auth else None,
        "username": request.user.get_username() if auth else "",
        "saveUrl": reverse("snow_game_save"),
        "boardUrl": reverse("snow_game_board"),
        "loginUrl": reverse("account_login") + "?next=" + reverse("snow_game"),
        "signupUrl": reverse("account_signup") + "?next=" + reverse("snow_game"),
        "logoutUrl": reverse("account_logout"),
        # страница привязки Google показывается, только если Google вообще настроен
        "accountUrl": reverse("socialaccount_connections") if settings.GOOGLE_ENABLED else "",
    }
    return render(request, "snow_game/index.html", {"cfg": cfg, "finstat_url": settings.FINSTAT_URL})


@never_cache
def ping(request):
    """
    «Разбудить» сервис: Финстат дёргает этот адрес при заходе пользователя, чтобы к нажатию
    «Играть» бесплатный Render уже проснулся. Намеренно без обращения к БД и без сессии.
    """
    return HttpResponse(status=204)


def _num(v, hi=1e15):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return 0.0
    if f != f or f < 0:  # NaN или минус
        return 0.0
    return min(f, hi)


def _num_map(d, hi):
    if not isinstance(d, dict):
        return {}
    out = {}
    for k, v in list(d.items())[:80]:
        if isinstance(k, str) and KEY_RE.match(k):
            out[k] = _num(v, hi)
    return out


def clean_state(data):
    """Клиент присылает своё состояние — берём только известные поля и зажимаем числа."""
    if not isinstance(data, dict):
        raise ValueError("data")
    out = {"v": 3}
    for k in ("cash", "wood", "meat", "gold", "fish", "banana", "hp", "earned"):
        out[k] = _num(data.get(k))
    out["lv"] = {k: int(v) for k, v in _num_map(data.get("lv"), 100).items()}
    out["prog"] = _num_map(data.get("prog"), 1e15)
    out["stats"] = _num_map(data.get("stats"), 1e15)
    stall = data.get("stall") if isinstance(data.get("stall"), dict) else {}
    out["stall"] = {}
    for sid in ("wood", "meat", "gold", "fish", "jwood", "banana"):
        s = stall.get(sid) if isinstance(stall.get(sid), dict) else {}
        out["stall"][sid] = {"stock": _num(s.get("stock")), "cash": _num(s.get("cash"))}
    cut = data.get("cut") if isinstance(data.get("cut"), list) else []
    out["cut"] = sorted({int(n) for n in cut[:600] if isinstance(n, (int, float)) and not isinstance(n, bool) and 0 <= n < 2000})
    out["nick"] = str(data.get("nick") or "").strip()[:16]
    out["quality"] = data.get("quality") if data.get("quality") in ("high", "low") else "high"
    out["tipClosed"] = bool(data.get("tipClosed"))
    return out


@require_http_methods(["GET", "POST"])
def api_save(request):
    if not _can_save(request.user):
        return JsonResponse({"error": "auth"}, status=401)
    # всё жёстко привязано к request.user — чужое сохранение достать нельзя
    save = GameSave.objects.filter(user=request.user).first()
    if request.method == "GET":
        return JsonResponse({"exists": bool(save), "data": save.data if save else None, "epoch": save.reset_epoch if save else 0})

    if len(request.body) > MAX_BODY:
        return JsonResponse({"error": "too_big"}, status=413)
    try:
        payload = json.loads(request.body)
        data = clean_state(payload.get("data"))
    except (ValueError, AttributeError):
        return JsonResponse({"error": "bad_data"}, status=400)

    earned = int(data["earned"])
    # админ сбросил прогресс, а устройство об этом не знает — отдаём ему сброшенное, а не принимаем старое
    if save and not payload.get("reset") and _num(payload.get("epoch"), 1e9) < save.reset_epoch:
        return JsonResponse({"conflict": True, "reset": True, "data": save.data, "epoch": save.reset_epoch}, status=409)
    # устаревшее устройство не должно затирать более далёкий прогресс (кроме явного сброса)
    if save and not payload.get("reset") and earned < save.earned:
        return JsonResponse({"conflict": True, "data": save.data, "epoch": save.reset_epoch}, status=409)

    obj, _ = GameSave.objects.update_or_create(
        user=request.user,
        defaults={"data": data, "earned": earned, "axe_level": min(int(data["lv"].get("axe", 0)), 29), "nick": data["nick"]},
    )
    return JsonResponse({"ok": True, "earned": earned, "epoch": obj.reset_epoch})


@require_http_methods(["GET"])
def api_board(request):
    if not _can_save(request.user):
        return JsonResponse({"error": "auth"}, status=401)
    qs = GameSave.objects.filter(earned__gt=0, hidden=False).order_by("-earned", "updated_at")
    rows = []
    for i, s in enumerate(qs[:20], 1):
        rows.append({
            "rank": i,
            "id": s.pk,
            # логин не светим — только ник из игры
            "name": s.nick or f"Игрок #{s.user_id}",
            "earned": s.earned, "axe": s.axe_level, "me": s.user_id == request.user.id,
        })
    mine = GameSave.objects.filter(user=request.user).first()
    me = None
    if mine and mine.earned > 0 and not mine.hidden:
        me = {"rank": GameSave.objects.filter(earned__gt=mine.earned, hidden=False).count() + 1, "earned": mine.earned}
    return JsonResponse({"rows": rows, "me": me})


def _visible_saves():
    """Кто попадает в рейтинг: тот же фильтр, что у таблицы лидеров (не скрыт, есть очки)."""
    return GameSave.objects.filter(earned__gt=0, hidden=False)


@require_http_methods(["GET"])
def api_player(request, pk):
    """Статистика игрока из таблицы лидеров. Отдаём только то, что показывает экран «Статистика»."""
    if not _can_save(request.user):
        return JsonResponse({"error": "auth"}, status=401)
    # тот же фильтр, что у рейтинга: скрытого модератором открыть нельзя, даже зная id
    s = _visible_saves().filter(pk=pk).first()
    if not s:
        return JsonResponse({"error": "not_found"}, status=404)
    d = s.data if isinstance(s.data, dict) else {}
    # stall, prog, quality и прочее экрану статистики не нужны — не раздаём лишнего
    pub = {k: d.get(k, 0) for k in ("cash", "wood", "meat", "gold", "hp", "earned")}
    pub["lv"] = d.get("lv", {})
    pub["stats"] = d.get("stats", {})
    return JsonResponse({
        "id": s.pk,
        "name": s.nick or f"Игрок #{s.user_id}",
        "me": s.user_id == request.user.id,
        "data": pub,
    })
