// Серверное сохранение и таблица лидеров. Для гостей и без интернета игра работает как раньше (localStorage).
(function () {
  'use strict';
  const SG = window.SG;
  const el = document.getElementById('sg-user');
  let cfg = { auth: false };
  try { if (el && el.textContent) cfg = JSON.parse(el.textContent); } catch (e) { /* без конфигурации играем как гость */ }
  const C = (SG.cloud = { cfg, status: cfg.auth ? 'sync' : 'guest', last: '', note: '' });

  // Чей прогресс лежит в localStorage. Без этого любой аккаунт, зашедший в этом браузере, получал чужой прогресс:
  // на сервере у него нет сохранения, игра оставляла локальное, а следующий push записывал его на нового пользователя.
  // Выполняется сразу при загрузке файла, то есть до SG.load() в main.js.
  const KEY = 'snowfarm3', OWNER = 'snowfarm3_owner', SLOT = 'snowfarm3_slot_';
  const EPK = cfg.auth && cfg.uid ? 'snowfarm3_epoch_' + cfg.uid : null;
  if (cfg.auth && cfg.uid) {
    try {
      const uid = String(cfg.uid), owner = localStorage.getItem(OWNER);
      // Метки владельца нет (сохранение с прошлых версий) — считаем прогресс принадлежащим вошедшему:
      // иначе пропал бы прогресс единственного игрока, который просто впервые зашёл в аккаунт.
      if (owner && owner !== uid) {
        const cur = localStorage.getItem(KEY);
        // Прогресс прежнего аккаунта откладываем в «ячейку», а не выбрасываем: он вернётся при его входе
        if (cur) localStorage.setItem(SLOT + owner, cur);
        const mine = localStorage.getItem(SLOT + uid);
        if (mine) { localStorage.setItem(KEY, mine); localStorage.removeItem(SLOT + uid); }
        else {
          let quality = 'high';
          try { quality = JSON.parse(cur).quality === 'low' ? 'low' : 'high'; } catch (e) { /* без настроек качества */ }
          localStorage.setItem(KEY, JSON.stringify(Object.assign(SG.newState(), { quality })));
        }
      }
      localStorage.setItem(OWNER, uid);
    } catch (e) { /* приватный режим: localStorage недоступен, и делить нечего */ }
  }
  // Какое «поколение» сохранения видело это устройство (растёт, когда админ сбрасывает прогресс)
  const getEpoch = () => { try { return EPK ? +localStorage.getItem(EPK) || 0 : 0; } catch (e) { return 0; } };
  const setEpoch = n => { try { if (EPK && n > getEpoch()) localStorage.setItem(EPK, String(n)); } catch (e) { /* не страшно */ } };

  const csrf = () => { const m = document.cookie.match(/csrftoken=([^;]+)/); return m ? decodeURIComponent(m[1]) : ''; };
  const post = body => fetch(cfg.saveUrl, {
    method: 'POST', credentials: 'same-origin', keepalive: true,
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf() }, body: JSON.stringify(body)
  });
  const snapshot = () => { if (SG.G && SG.G.p) SG.S.hp = SG.G.p.hp; return JSON.stringify(SG.S); };

  // Перед стартом игры: если на сервере прогресс дальше локального — берём серверный
  C.pull = async function () {
    if (!cfg.auth) return;
    try {
      const r = await fetch(cfg.saveUrl, { credentials: 'same-origin' });
      if (r.status === 401 || r.status === 403) { C.status = 'guest'; return; }
      const j = await r.json();
      if ((j.epoch || 0) > getEpoch()) {
        // админ сбросил прогресс: локальный (он старше сброса) выбрасываем, даже если он «больше» серверного
        SG.adopt(j.exists && j.data ? j.data : {}); setEpoch(j.epoch); C.note = 'Прогресс сброшен администратором';
      } else if (j.exists && j.data && (j.data.earned || 0) > (SG.S.earned || 0)) {
        SG.adopt(j.data); C.note = 'Загружен прогресс с сервера';
      }
      C.status = 'ok';
    } catch (e) { C.status = 'offline'; }
  };

  C.push = async function (force) {
    if (!cfg.auth || C.status === 'guest') return;
    const body = snapshot();
    if (!force && body === C.last) return;
    try {
      const r = await post({ data: JSON.parse(body), epoch: getEpoch() });
      if (r.status === 409) { // на сервере прогресс дальше (играли с другого устройства) или админ сбросил прогресс
        const j = await r.json(); setEpoch(j.epoch || 0); SG.adopt(j.data); location.reload(); return;
      }
      if (r.ok) { C.last = body; C.status = 'ok'; const j = await r.json(); setEpoch(j.epoch || 0); }
      else C.status = r.status === 401 || r.status === 403 ? 'guest' : 'offline';
    } catch (e) { C.status = 'offline'; }
  };

  // Сброс прогресса: сервер тоже обнуляем, иначе при следующем входе вернётся старое
  C.reset = async function () {
    if (!cfg.auth || C.status === 'guest') return;
    try { const r = await post({ data: SG.S, reset: true, epoch: getEpoch() }); if (r.ok) setEpoch((await r.json()).epoch || 0); } catch (e) { /* не страшно: сбросится при следующей синхронизации */ }
  };

  C.board = async function () {
    const r = await fetch(cfg.boardUrl, { credentials: 'same-origin' });
    if (!r.ok) throw new Error(r.status);
    return r.json();
  };

  // Статистика одного игрока из таблицы лидеров (id — из строки рейтинга)
  C.player = async function (id) {
    const r = await fetch(cfg.boardUrl + encodeURIComponent(id) + '/', { credentials: 'same-origin' });
    if (!r.ok) throw new Error(r.status);
    return r.json();
  };

  C.statusText = function () {
    if (!cfg.auth) return null;
    return { ok: '☁️ Прогресс сохраняется на сервере', sync: '☁️ Подключаемся…', offline: '⚠️ Нет связи с сервером — прогресс пока только на этом устройстве', guest: '' }[C.status];
  };
})();
