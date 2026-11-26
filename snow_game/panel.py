"""
Панель администратора игры (/panel/): сводка, список всех игроков и полное управление статистикой каждого.
Доступна только суперпользователю; всем остальным отвечает 404, чтобы адрес даже не выдавал себя.
Все изменения — только POST (+CSRF) и пишутся в историю действий админки Django (LogEntry).
"""
import datetime as dt
from functools import wraps

from django.contrib import messages
from django.contrib.admin.models import CHANGE, LogEntry
from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.core.paginator import Paginator
from django.db.models import Count, F, Q, Sum
from django.db.models.functions import TruncDate
from django.http import Http404
from django.shortcuts import redirect, render
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from .models import GameSave
from .views import clean_state

User = get_user_model()

# Подписи к ключам сохранения. Источник — config.js/state.js; новые ключи, которых тут нет, панель всё равно
# показывает (с подписью = ключу), так что забытое обновление словаря ничего не ломает.
RESOURCES = {
    "cash": "Деньги", "wood": "Дерево (несёт)", "meat": "Мясо (несёт)", "gold": "Золото (несёт)",
    "fish": "Рыба (несёт)", "banana": "Бананы (несёт)", "hp": "Здоровье сейчас", "earned": "Заработано всего (очки рейтинга)",
}
LEVELS = {
    "axe": ("Топор", 29),
    "hp": ("Здоровье", 20),
    "speed": ("Скорость", 15),
    "regen": ("Регенерация", 15),
    "hire": ("Рабочий", 12),
    "collect": ("Сборщик мяса", 8),
    "cradius": ("Обзор сборщиков", 10),
    "cspeed": ("Скорость сборщиков", 10),
    "ccarry": ("Вместимость сборщиков", 10),
    "miner": ("Золотоискатель", 6),
    "fbase": ("Рыбацкая база", 1),
    "flen": ("Длина пирса", 3),
    "rod": ("Удочка", 15),
    "fisher": ("Рыбак", 4),
    "ship": ("Корабль", 1),
    "hdmg": ("Урон гарпуна", 25),
    "hrate": ("Скорость гарпуна", 15),
    "sspeed": ("Скорость корабля", 15),
    "jbase": ("Джунгли-база", 1),
    "gun": ("Дробовик", 1),
    "gdmg": ("Урон дробовика", 25),
    "grate": ("Скорость дробовика", 15),
    "gcount": ("Число дробовиков", 5),
    "jhire": ("Охотник с мачете", 10),
    "jup": ("База в джунглях", 4),
    "jhdmg": ("Урон мачете", 20),
    "rail": ("Железная дорога", 3),
    "railf": ("Станция у моря", 1),
    "railj": ("Станция в джунглях", 1),
    "wspeed": ("Темп работы", 20),
    "wyield": ("Дерево/раб.", 15),
    "magnet": ("Магнит", 15),
    "ore": ("Руда", 15),
    "base": ("База", 4),
    "tdmg": ("Урон башен", 25),
    "trate": ("Скорость башен", 20),
    "cust": ("Покупатели", 20),
    "price": ("Цены", 25),
    "demand": ("Заказы", 15),
    "queue": ("Очередь", 8),
    "goldstall": ("Лавка золота", 1),
    "heal": ("Костёр", 10),
    "trange": ("Дальность башен", 15),
}
STATS = {
    "time": "Время в игре, сек", "trees": "Деревьев срублено (игрок)", "wtrees": "Деревьев срублено (рабочие)", "ores": "Золотой руды добыто",
    "kills": "Побеждено мобов", "boss": "Боссов", "verite": "Верите поймано", "deaths": "Смертей", "eaten": "Съедено",
    "spent": "Потрачено на улучшения", "customers": "Обслужено покупателей", "cmeat": "Мяса собрано сборщиками",
    "mgold": "Золота добыто золотоискателями", "soldwood": "Продано дерева", "soldmeat": "Продано мяса", "soldgold": "Продано золота",
    "giants": "Гигантов срублено", "fish": "Рыбы поймано", "soldfish": "Продано рыбы", "cfish": "Рыбы (cfish)", "hfish": "Рыбы (hfish)",
    "monk": "Обезьян побеждено", "curio": "Любопытстити", "grust": "Грустити", "palms": "Пальм срублено", "banana": "Бананов собрано",
    "soldjwood": "Продано пальмового дерева", "soldbanana": "Продано бананов", "rides": "Поездок по железной дороге", "hmonk": "Обезьян убито охотниками",
}
STALLS = {"wood": "Лавка дерева", "meat": "Лавка мяса", "gold": "Лавка золота", "fish": "Лавка рыбы", "jwood": "Джунгли: дерево", "banana": "Джунгли: бананы"}
SORTS = {
    "earned": "earned", "axe": "axe_level", "created": "created_at", "updated": "updated_at",
    "login": "user__username", "nick": "nick", "id": "user_id",
}


def level_info(key):
    """(подпись, максимум) для ключа улучшения; башни tur0..tur11 и неизвестные ключи — по умолчанию."""
    if key in LEVELS:
        return LEVELS[key]
    if key.startswith("tur") and key[3:].isdigit():
        return f"Башня {int(key[3:]) + 1}", 1
    return key, 100


def superuser_only(view):
    @wraps(view)
    def inner(request, *a, **kw):
        u = request.user
        if not (u.is_authenticated and u.is_active and u.is_superuser):
            raise Http404()
        return view(request, *a, **kw)
    return inner


def fmt(n):
    try:
        return f"{int(n):,}".replace(",", " ")
    except (TypeError, ValueError):
        return "0"


def fmt_time(sec):
    sec = int(sec or 0)
    h, m = divmod(sec // 60, 60)
    return f"{h} ч {m} мин" if h else f"{m} мин"


def _data(save):
    return save.data if isinstance(save.data, dict) else {}


def _log(request, save, text):
    # создаём запись напрямую: log_action() переименовали/убрали в новых версиях Django, а так работает во всех
    LogEntry.objects.create(
        user_id=request.user.pk, content_type_id=ContentType.objects.get_for_model(GameSave).pk,
        object_id=str(save.pk), object_repr=save.user.get_username()[:200], action_flag=CHANGE, change_message=text[:500],
    )


def _save_from(save, data):
    """Записать новое состояние. reset_epoch растёт всегда: устройства игрока подхватят серверную версию,
    иначе браузер со старой копией при ближайшей синхронизации вернул бы всё как было."""
    data = clean_state(data)
    save.data = data
    save.earned = int(data["earned"])
    save.axe_level = min(int(data["lv"].get("axe", 0)), 29)
    save.nick = data["nick"]
    save.reset_epoch = F("reset_epoch") + 1
    save.save()
    save.refresh_from_db()


# ---------- сводка ----------

def _series(qs, field, days):
    today = timezone.localdate()
    start = today - dt.timedelta(days=days - 1)
    rows = {r["d"]: r["n"] for r in qs.filter(**{f"{field}__date__gte": start}).annotate(d=TruncDate(field)).values("d").annotate(n=Count("pk")).values("d", "n")}
    out = [{"d": start + dt.timedelta(days=i), "n": rows.get(start + dt.timedelta(days=i), 0)} for i in range(days)]
    mx = max([r["n"] for r in out] + [1])
    for r in out:
        r["h"] = round(100 * r["n"] / mx)
        r["label"] = r["d"].strftime("%d.%m")
    return out


@superuser_only
def dashboard(request):
    now = timezone.now()
    saves = GameSave.objects.all()
    total = saves.count()
    agg = saves.aggregate(s=Sum("earned"))
    res_sum = {k: 0 for k in RESOURCES}
    stat_sum = {}
    lv_owners, lv_total = {}, {}
    for (data,) in saves.values_list("data").iterator(chunk_size=500):
        if not isinstance(data, dict):
            continue
        for k in RESOURCES:
            res_sum[k] += float(data.get(k) or 0)
        for k, v in (data.get("stats") or {}).items():
            stat_sum[k] = stat_sum.get(k, 0) + float(v or 0)
        for k, v in (data.get("lv") or {}).items():
            if v:
                lv_owners[k] = lv_owners.get(k, 0) + 1
                lv_total[k] = lv_total.get(k, 0) + int(v)
    lvl_rows = []
    for k in list(LEVELS) + sorted(set(lv_owners) - set(LEVELS)):
        n = lv_owners.get(k, 0)
        if k.startswith("tur") and k[3:].isdigit() and k != "tur0":
            continue  # башни сводим в одну строку ниже
        name, mx = level_info(k)
        lvl_rows.append({"key": k, "name": name, "max": mx, "owners": n, "pct": round(100 * n / total) if total else 0,
                         "avg": round(lv_total.get(k, 0) / n, 1) if n else 0})
    towers = sum(v for k, v in lv_owners.items() if k.startswith("tur") and k[3:].isdigit())
    axe_dist = {r["axe_level"]: r["n"] for r in saves.values("axe_level").annotate(n=Count("pk")).values("axe_level", "n")}
    axe_max = max(list(axe_dist.values()) + [1])
    axe_rows = [{"lvl": i + 1, "n": axe_dist.get(i, 0), "h": round(100 * axe_dist.get(i, 0) / axe_max)} for i in range(30)]
    top = [{"s": s, "earned": fmt(s.earned), "login": s.user.get_username()} for s in saves.select_related("user").order_by("-earned")[:10]]
    ct = ContentType.objects.get_for_model(GameSave)
    logs = LogEntry.objects.filter(content_type=ct).select_related("user").order_by("-action_time")[:12]
    ctx = {
        "tab": "dash",
        "cards": [
            ("Игроков (сохранений)", fmt(total)), ("Аккаунтов всего", fmt(User.objects.count())),
            ("Активны за 24 ч", fmt(saves.filter(updated_at__gte=now - dt.timedelta(days=1)).count())),
            ("Активны за 7 дней", fmt(saves.filter(updated_at__gte=now - dt.timedelta(days=7)).count())),
            ("Новых за 24 ч", fmt(saves.filter(created_at__gte=now - dt.timedelta(days=1)).count())),
            ("Новых за 7 дней", fmt(saves.filter(created_at__gte=now - dt.timedelta(days=7)).count())),
            ("Заблокировано", fmt(User.objects.filter(is_active=False).count())),
            ("Скрыто из рейтинга", fmt(saves.filter(hidden=True).count())),
            ("Заработано всеми, $", fmt(agg["s"] or 0)),
            ("Среднее на игрока, $", fmt((agg["s"] or 0) / total) if total else "0"),
            ("Суммарное время в игре", fmt_time(stat_sum.get("time", 0))),
            ("Смертей всего", fmt(stat_sum.get("deaths", 0))),
        ],
        "new_series": _series(saves, "created_at", 30),
        "act_series": _series(saves, "updated_at", 30),
        "axe_rows": axe_rows,
        "top": top,
        "res_rows": [(RESOURCES[k], fmt(v)) for k, v in res_sum.items()],
        "stat_rows": [(STATS.get(k, k), fmt_time(v) if k == "time" else fmt(v)) for k, v in sorted(stat_sum.items(), key=lambda kv: list(STATS).index(kv[0]) if kv[0] in STATS else 999)],
        "lvl_rows": lvl_rows, "towers": towers,
        "logs": logs,
    }
    return render(request, "snow_game/panel/dashboard.html", ctx)


# ---------- список игроков ----------

BULK = {"hide", "unhide", "ban", "unban", "reset"}


def _apply(request, save, action):
    """Одно действие над игроком. Возвращает текст для истории или None, если действие недопустимо."""
    u = save.user
    if action == "hide":
        GameSave.objects.filter(pk=save.pk).update(hidden=True)
        return "скрыт из рейтинга"
    if action == "unhide":
        GameSave.objects.filter(pk=save.pk).update(hidden=False)
        return "возвращён в рейтинг"
    if action == "ban":
        if u.is_superuser or u.pk == request.user.pk:
            return None
        u.is_active = False
        u.save(update_fields=["is_active"])
        return "аккаунт заблокирован"
    if action == "unban":
        u.is_active = True
        u.save(update_fields=["is_active"])
        return "аккаунт разблокирован"
    if action == "reset":
        save.data, save.earned, save.axe_level, save.nick = {}, 0, 0, ""
        save.reset_epoch = F("reset_epoch") + 1
        save.save()
        return "прогресс сброшен"
    return None


@superuser_only
@require_http_methods(["GET", "POST"])
def players(request):
    if request.method == "POST":
        action = request.POST.get("action")
        ids = [int(i) for i in request.POST.getlist("ids") if i.isdigit()]
        if action in BULK and ids:
            done = 0
            for s in GameSave.objects.filter(pk__in=ids).select_related("user"):
                text = _apply(request, s, action)
                if text:
                    _log(request, s, "Панель: " + text)
                    done += 1
            messages.success(request, f"Готово: {done} из {len(ids)}.")
        else:
            messages.error(request, "Выбери игроков и действие.")
        return redirect(request.get_full_path())

    q = (request.GET.get("q") or "").strip()
    status = request.GET.get("status") or "all"
    sort = request.GET.get("sort") if request.GET.get("sort") in SORTS else "earned"
    desc = request.GET.get("dir") != "asc"
    qs = GameSave.objects.select_related("user")
    if q:
        qs = qs.filter(Q(user__username__icontains=q) | Q(nick__icontains=q) | (Q(pk=int(q)) if q.isdigit() else Q(pk__in=[])))
    now = timezone.now()
    flt = {
        "hidden": Q(hidden=True), "banned": Q(user__is_active=False), "active": Q(updated_at__gte=now - dt.timedelta(days=1)),
        "new": Q(created_at__gte=now - dt.timedelta(days=7)), "idle": Q(updated_at__lt=now - dt.timedelta(days=30)), "zero": Q(earned=0),
    }
    if status in flt:
        qs = qs.filter(flt[status])
    qs = qs.order_by(("-" if desc else "") + SORTS[sort], "pk")
    page = Paginator(qs, 50).get_page(request.GET.get("page"))
    rows = []
    for s in page:
        d, st = _data(s), (_data(s).get("stats") or {})
        rows.append({
            "s": s, "login": s.user.get_username(), "earned": fmt(s.earned), "axe": s.axe_level + 1, "active": s.user.is_active,
            "time": fmt_time(st.get("time", 0)), "kills": fmt(st.get("kills", 0)), "deaths": fmt(st.get("deaths", 0)),
            "cash": fmt(d.get("cash", 0)), "staff": s.user.is_superuser,
        })
    qd = request.GET.copy()
    qd.pop("page", None)
    return render(request, "snow_game/panel/players.html", {
        "tab": "players", "rows": rows, "page": page, "q": q, "status": status, "sort": sort, "dir": "desc" if desc else "asc",
        "total": qs.count(), "keep": qd.urlencode(),
        "statuses": [("all", "Все"), ("active", "Активны за 24 ч"), ("new", "Новые за 7 дней"), ("idle", "Не заходили 30+ дней"),
                     ("zero", "Без очков"), ("hidden", "Скрытые"), ("banned", "Заблокированные")],
        "sorts": [("earned", "Заработано"), ("axe", "Топор"), ("created", "Регистрация"), ("updated", "Активность"), ("login", "Логин"), ("nick", "Ник"), ("id", "ID")],
    })


# ---------- карточка игрока ----------

def _num_in(post, name, default, lo=0.0, hi=1e15):
    try:
        v = float(post.get(name, default))
    except (TypeError, ValueError):
        return default
    if v != v:
        return default
    return min(max(v, lo), hi)


@superuser_only
@require_http_methods(["GET", "POST"])
def player(request, pk):
    save = GameSave.objects.select_related("user").filter(pk=pk).first()
    if not save:
        raise Http404()
    u = save.user
    url = reverse("snow_panel_player", args=[pk])
    if request.method == "POST":
        action = request.POST.get("action")
        if action in BULK:
            text = _apply(request, save, action)
            if text:
                _log(request, save, "Панель: " + text)
                messages.success(request, text.capitalize() + ".")
            else:
                messages.error(request, "Это действие недоступно для данного аккаунта (админа и себя блокировать нельзя).")
        elif action == "password":
            pw = request.POST.get("password", "")
            if u.is_superuser and u.pk != request.user.pk:
                messages.error(request, "Пароль другого администратора здесь не меняется.")
            elif len(pw) < 6:
                messages.error(request, "Пароль — минимум 6 символов.")
            else:
                u.set_password(pw)
                u.save(update_fields=["password"])
                _log(request, save, "Панель: задан новый пароль")
                messages.success(request, "Новый пароль задан. Передай его игроку лично; старые входы перестанут действовать.")
        elif action == "save":
            d = clean_state(_data(save))
            P = request.POST
            for k in RESOURCES:
                d[k] = _num_in(P, "res_" + k, d.get(k, 0))
            for k in list(d["lv"]) + [k for k in LEVELS if k not in d["lv"]]:
                if "lv_" + k in P:
                    d["lv"][k] = int(_num_in(P, "lv_" + k, d["lv"].get(k, 0), 0, level_info(k)[1]))
            for k in set(d["stats"]) | set(STATS):
                if "st_" + k in P:
                    d["stats"][k] = _num_in(P, "st_" + k, d["stats"].get(k, 0))
            for sid in STALLS:
                s = d["stall"].setdefault(sid, {"stock": 0, "cash": 0})
                s["stock"] = _num_in(P, f"sl_{sid}_stock", s.get("stock", 0))
                s["cash"] = _num_in(P, f"sl_{sid}_cash", s.get("cash", 0))
            d["lv"] = {k: v for k, v in d["lv"].items() if v}
            d["nick"] = (P.get("nick") or "").strip()[:16]
            _save_from(save, d)
            GameSave.objects.filter(pk=save.pk).update(hidden=bool(P.get("hidden")))
            _log(request, save, "Панель: изменены данные игрока")
            messages.success(request, "Сохранено. Устройства игрока подхватят новые данные при следующей синхронизации (несохранённый прогресс за последние секунды у него пропадёт).")
        return redirect(url)

    d = _data(save)
    lv, st, stall = d.get("lv") or {}, d.get("stats") or {}, d.get("stall") or {}
    lv_keys = list(LEVELS) + sorted(k for k in lv if k not in LEVELS)
    ctx = {
        "tab": "players", "s": save, "u": u, "login": u.get_username(), "empty": not d,
        "res": [(k, RESOURCES[k], d.get(k, 0)) for k in RESOURCES],
        "lvs": [(k, *level_info(k), lv.get(k, 0)) for k in lv_keys],
        "stats": [(k, STATS.get(k, k), st.get(k, 0)) for k in list(STATS) + sorted(k for k in st if k not in STATS)],
        "stalls": [(sid, name, (stall.get(sid) or {}).get("stock", 0), (stall.get(sid) or {}).get("cash", 0)) for sid, name in STALLS.items()],
        "earned": fmt(save.earned), "time": fmt_time(st.get("time", 0)),
        "last_login": u.last_login, "can_ban": not u.is_superuser and u.pk != request.user.pk,
        "logs": LogEntry.objects.filter(content_type=ContentType.objects.get_for_model(GameSave), object_id=str(save.pk)).select_related("user").order_by("-action_time")[:10],
    }
    return render(request, "snow_game/panel/player.html", ctx)
