// Интерфейс поверх канваса: HUD, джойстик, подсказки, настройки со статистикой, таблица лидеров, экран смерти.
(function () {
  'use strict';
  const SG = window.SG;
  const UI = (SG.UI = {});
  const $ = id => document.getElementById(id);
  let joy = null;
  const keys = {};
  const last = {};

  // Текст с иконками: «+3 {log}» → «+3 [картинка дерева]»
  function richInto(el, text) {
    el.textContent = '';
    String(text).split(/\{(\w+)\}/).forEach((part, i) => {
      if (i % 2) el.appendChild(SG.iconImg(part)); else if (part) el.appendChild(document.createTextNode(part));
    });
  }
  const fmtTime = sec => {
    sec = Math.floor(sec); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60);
    return h ? h + ' ч ' + m + ' мин' : m + ' мин ' + (sec % 60) + ' с';
  };

  UI.init = function () {
    const S = SG.S;
    SG.applyIcons();
    SG.audio.bindUI();
    const cv = $('c'), stick = $('stick'), knob = $('knob');
    cv.addEventListener('pointerdown', e => {
      UI.railBegin(); // стоишь на взведённой станции — это нажатие открывает выбор направления
      joy = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
      stick.style.display = 'block'; stick.style.left = e.clientX + 'px'; stick.style.top = e.clientY + 'px'; knob.style.transform = 'translate(-50%,-50%)';
    });
    cv.addEventListener('pointermove', e => {
      if (!joy || e.pointerId !== joy.id) return;
      let dx = e.clientX - joy.x, dy = e.clientY - joy.y; const l = Math.hypot(dx, dy), M = 55;
      if (l > M) { dx = dx / l * M; dy = dy / l * M; } // джойстик остаётся там, где нажали, ручка упирается в край
      joy.dx = dx / M; joy.dy = dy / M;
      knob.style.transform = 'translate(calc(-50% + ' + dx + 'px),calc(-50% + ' + dy + 'px))';
    });
    const end = () => { joy = null; stick.style.display = 'none'; if (UI.rail) UI.railRelease(); }; // отпустил: поехал, если область выбрана, иначе отмена
    addEventListener('pointerup', end); addEventListener('pointercancel', end);
    addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      // Esc — то же, что «Назад»/крестик: закрывает верхнее окно. Обрабатываем до проверки поля ввода,
      // иначе из окна настроек нельзя выйти, пока курсор стоит в поле ника.
      if (e.key === 'Escape') {
        if (!e.repeat && UI.back()) { e.preventDefault(); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }
        return;
      }
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
      if (DIRK.indexOf(k) >= 0 && !keys[k] && !anyDir() && !joy) UI.railBegin(); // первое нажатие стрелки на станции
      keys[k] = 1; if (k === 'e') SG.G.eat();
    });
    addEventListener('keyup', e => { keys[e.key.toLowerCase()] = 0; if (UI.rail && !anyDir() && !joy) UI.railRelease(); });

    $('eat').onclick = () => SG.G.eat();
    $('railcancel').onclick = () => UI.railEnd(true);
    $('resp').onclick = () => { SG.G.respawn(); $('dead').style.display = 'none'; };

    // подсказка с крестиком
    if (S.tipClosed) $('tip').style.display = 'none';
    const closeTip = () => { $('tip').style.display = 'none'; SG.S.tipClosed = true; SG.save(); };
    $('tipx').onclick = closeTip;

    // ---------- настройки + статистика ----------
    const modal = $('modal'), nick = $('nick');
    nick.value = S.nick;
    const tab = name => {
      $('pane-set').style.display = name === 'set' ? 'flex' : 'none';
      $('pane-stat').style.display = name === 'stat' ? 'flex' : 'none';
      $('tabset').classList.toggle('on', name === 'set'); $('tabstat').classList.toggle('on', name === 'stat');
      if (name === 'stat') renderStats();
    };
    // Ссылки в строке аккаунта собираем DOM-ом, как и раньше: текст не интерпретируется как HTML
    const link = (href, text) => { const l = document.createElement('a'); l.href = href; l.textContent = text; l.style.color = '#9dd2ff'; return l; };
    const renderAcct = () => {
      const a = $('acct'), C = SG.cloud, t = C.statusText();
      a.textContent = '';
      if (C.cfg.auth) {
        a.appendChild(document.createTextNode((C.cfg.username ? C.cfg.username + ' · ' : '') + (t || '')));
        a.appendChild(document.createElement('br'));
        if (C.cfg.accountUrl) { a.appendChild(link(C.cfg.accountUrl, 'Привязать Google')); a.appendChild(document.createTextNode(' · ')); }
        a.appendChild(link(C.cfg.logoutUrl, 'Выйти'));
        return;
      }
      a.appendChild(document.createTextNode('Прогресс хранится только в этом браузере. '));
      a.appendChild(link(C.cfg.loginUrl, 'Войти'));
      a.appendChild(document.createTextNode(' или '));
      a.appendChild(link(C.cfg.signupUrl, 'зарегистрироваться'));
      a.appendChild(document.createTextNode(' — и он сохранится на сервере, плюс откроется таблица лидеров.'));
    };
    $('gear').onclick = () => { nick.value = SG.S.nick; renderAcct(); tab('set'); modal.style.display = 'flex'; };
    $('closeset').onclick = () => (modal.style.display = 'none');
    modal.addEventListener('pointerdown', e => { if (e.target === modal) modal.style.display = 'none'; });
    $('tabset').onclick = () => tab('set'); $('tabstat').onclick = () => tab('stat');
    $('savenick').onclick = () => { SG.S.nick = nick.value.trim().slice(0, 16); SG.save(); SG.cloud.push(true); modal.style.display = 'none'; };
    const setQ = q => {
      SG.S.quality = q; SG.R.setQuality(q);
      $('qhigh').classList.toggle('on', q === 'high'); $('qlow').classList.toggle('on', q === 'low'); SG.save();
    };
    $('qhigh').onclick = () => setQ('high'); $('qlow').onclick = () => setQ('low');
    $('qhigh').classList.toggle('on', S.quality === 'high'); $('qlow').classList.toggle('on', S.quality === 'low');
    $('reset').onclick = () => {
      if (confirm('Удалить весь прогресс игры (и на сервере тоже)? Ник и настройки сохранятся.')) {
        SG.resetSave();
        SG.S = SG.normalize(JSON.parse(localStorage.getItem('snowfarm3'))); // сервер обнуляем свежим состоянием
        SG.cloud.reset().then(() => location.reload(), () => location.reload());
      }
    };

    // Статистика: все данные игры одним списком (обновляется раз в секунду, пока окно открыто).
    // Строки собираются из любого состояния, не только своего: тот же экран показывает игрока из таблицы лидеров.
    function statRows(S, D, hp) {
      const st = S.stats;
      let built = 0; for (let i = 0; i < SG.TURRETS.length; i++) if (S.lv['tur' + i]) built++;
      return [
        ['Заработано всего (очки рейтинга)', SG.fmt(S.earned) + ' $'], ['Денег сейчас', SG.fmt(S.cash) + ' $'], ['Потрачено на улучшения', SG.fmt(st.spent) + ' $'],
        ['Время в игре', fmtTime(st.time)], null,
        ['Топор', SG.TIERS[D.tier].n + ' (ур. ' + (D.axeLvl + 1) + ')'], ['Урон топора', SG.fmt(D.axeDmg)], ['Число топоров', D.axeCount], ['Радиус', D.axeR.toFixed(1) + ' м'], null,
        ['Здоровье', Math.ceil(hp) + ' / ' + D.maxHp], ['Скорость', D.speed.toFixed(1)], ['Регенерация', D.regen.toFixed(1) + ' HP/с'],
        ['С собой', SG.fmt(S.wood) + ' дерева, ' + SG.fmt(S.meat) + ' мяса, ' + SG.fmt(S.gold) + ' слитков'], null,
        ['Рабочие', D.workers], ['Сборщики мяса', D.collectors], ['Обзор / скорость / вместимость', D.cRange + ' м / ×' + D.cSpeed.toFixed(2) + ' / ' + D.cCarry], ['Мяса собрано сборщиками', SG.fmt(st.cmeat)], ['Золотоискатели', D.miners], ['Золота добыто искателями', SG.fmt(st.mgold)], ['Рыбаки', D.fishers + ' (пирс: ' + (D.fishBase ? 1 + D.fishLen : 0) + ' мест)'], ['Поймано рыбы / продано', SG.fmt(st.fish) + ' / ' + SG.fmt(st.soldfish)], ['Поймано самим (удочка) / большой рыбы (гарпун)', SG.fmt(st.cfish) + ' / ' + SG.fmt(st.hfish)], ['Срублено гигантов', SG.fmt(st.giants)], ['Темп работы', '×' + D.wSpeed.toFixed(1)], ['Дерева с дерева (рабочие)', D.wYield], null,
        ['Размер базы', 2 * SG.baseHalf(D.baseL) + ' × ' + (SG.baseHalf(D.baseL) + 14)], ['Башен построено', built + ' / ' + SG.TURRETS.length], ['Урон башен', SG.fmt(D.tDmg)], ['Дальность башен', D.tRange.toFixed(0) + ' м'], null,
        ['Продано дров', SG.fmt(st.soldwood)], ['Продано мяса', SG.fmt(st.soldmeat)], ['Продано золота', SG.fmt(st.soldgold)], ['Покупателей обслужено', SG.fmt(st.customers)], ['Множитель цен', '×' + D.priceMul.toFixed(1)], null,
        ['Срублено деревьев (ты / рабочие)', SG.fmt(st.trees) + ' / ' + SG.fmt(st.wtrees)], ['Добыто золотой руды', SG.fmt(st.ores)], ['Побеждено мобов', SG.fmt(st.kills)], ['Из них боссов', SG.fmt(st.boss)], ['«' + SG.VERITE_NAME + '» повержено', SG.fmt(st.verite)],
        ['Дробовик', D.gunOwned ? D.gunCount + ' шт., урон ' + SG.fmt(D.gunDmg) + ', дальность ' + D.gunRange.toFixed(0) + ' м' : 'нет'], ['Джунгли-база', D.jungleBase ? 'ур. ' + D.jbaseL + ' • охотников до ' + D.hunterCap : 'нет'],
        ['Обезьян побеждено / пальм срублено', SG.fmt(st.monk) + ' / ' + SG.fmt(st.palms)], ['Бананов собрано', SG.fmt(st.banana)], ['Продано пальмового дерева / бананов', SG.fmt(st.soldjwood) + ' / ' + SG.fmt(st.soldbanana)],
        ['«' + SG.CURIO_NAME + '» повержено', SG.fmt(st.curio)], ['«' + SG.SAD_NAME + '» повержено', SG.fmt(st.grust)],
        ['Охотники с мачете', D.hunters + ' шт., урон ' + SG.fmt(D.mDmg) + ' • убито ' + SG.fmt(st.hmonk)],
        ['Железная дорога', SG.RAIL.names[D.railLvl] + (D.railLvl ? ' • поездок ' + SG.fmt(st.rides) : '')], null,
        ['Смертей', SG.fmt(st.deaths)], ['Съедено мяса', SG.fmt(st.eaten)]
      ];
    }
    function fillStats(el, rows) {
      el.textContent = '';
      for (const r of rows) {
        if (!r) { const hr = document.createElement('div'); hr.className = 'sep'; el.appendChild(hr); continue; }
        const d = document.createElement('div'); d.className = 'stat';
        const a = document.createElement('span'); a.textContent = r[0]; const b = document.createElement('b'); b.textContent = r[1];
        d.appendChild(a); d.appendChild(b); el.appendChild(d);
      }
    }
    function renderStats() { fillStats($('statbody'), statRows(SG.S, SG.D, SG.G.p.hp)); }
    setInterval(() => { if (modal.style.display === 'flex' && $('pane-stat').style.display === 'flex') renderStats(); }, 1000);

    // ---------- таблица лидеров ----------
    const lb = $('lbmodal'), body = $('lbbody'), lbBack = $('lbback'), lbTitle = $('lbtitle'), lbNote = $('lbnote');
    const say = txt => { body.textContent = txt; };
    let lbView = 'list', lbData = null, lbReq = 0; // lbReq: ответ на устаревший клик (игрок уже ушёл назад) выбрасываем
    const lbOpen = () => lb.style.display === 'flex';

    function renderBoard(j) {
      lbView = 'list'; lbReq++;
      lbTitle.textContent = 'Таблица лидеров'; lbBack.style.display = 'none'; lbNote.style.display = '';
      body.textContent = '';
      if (!j.rows.length) { say('Пока никого нет — заработай первые деньги!'); return; }
      for (const r of j.rows) {
        const d = document.createElement('div'); d.className = 'lbrow pick' + (r.me ? ' me' : '');
        [String(r.rank), r.name, SG.fmt(r.earned) + ' $', 'топор ' + (r.axe + 1)].forEach((t, i) => {
          const s = document.createElement('span'); s.textContent = t; s.className = 'c' + i; d.appendChild(s);
        });
        d.onclick = () => showPlayer(r);
        body.appendChild(d);
      }
      if (j.me && !j.rows.some(r => r.me)) {
        const d = document.createElement('div'); d.className = 'lbrow me'; d.textContent = 'Ты: место ' + j.me.rank + ' • ' + SG.fmt(j.me.earned) + ' $'; body.appendChild(d);
      }
    }

    // Статистика игрока: тот же набор строк, что в настройках, но по чужому сохранению
    async function showPlayer(r) {
      const req = ++lbReq;
      lbView = 'player';
      lbTitle.textContent = r.name; lbBack.style.display = ''; lbNote.style.display = 'none';
      say('Загрузка…');
      try {
        const j = await SG.cloud.player(r.id);
        if (req !== lbReq) return;
        const S = SG.normalize(j.data), D = SG.derive(S.lv);
        lbTitle.textContent = '#' + r.rank + ' ' + j.name;
        fillStats(body, statRows(S, D, S.hp));
        lb.querySelector('#lbpanel').scrollTop = 0;
      } catch (e) { if (req === lbReq) say('Не удалось загрузить статистику игрока. Попробуй позже.'); }
    }

    $('trophy').onclick = async () => {
      lb.style.display = 'flex';
      lbView = 'list'; lbReq++; lbBack.style.display = 'none'; lbNote.style.display = ''; lbTitle.textContent = 'Таблица лидеров';
      if (!SG.cloud.cfg.auth) {
        lbNote.style.display = 'none';
        body.textContent = '';
        body.appendChild(document.createTextNode('Таблица лидеров доступна после входа в аккаунт. '));
        const l = document.createElement('a'); l.href = SG.cloud.cfg.loginUrl; l.textContent = 'Войти'; l.style.color = '#9dd2ff'; body.appendChild(l);
        return;
      }
      say('Загрузка…');
      const req = lbReq;
      await SG.cloud.push(true); // чтобы свежие очки уже были в таблице
      try {
        const j = await SG.cloud.board();
        if (req !== lbReq || !lbOpen()) return; // пока грузилось, окно закрыли или открыли игрока
        lbData = j; renderBoard(j);
      } catch (e) { if (req === lbReq) say('Не удалось загрузить таблицу. Попробуй позже.'); }
    };
    lbBack.onclick = () => { if (lbData) renderBoard(lbData); else $('trophy').onclick(); };
    $('closelb').onclick = () => (lb.style.display = 'none');
    lb.addEventListener('pointerdown', e => { if (e.target === lb) lb.style.display = 'none'; });

    // Esc: закрывает верхнее окно или делает шаг назад. Возвращает true, если что-то закрыл.
    UI.back = () => {
      if (UI.rail) { UI.railEnd(true); return true; }
      if (lbOpen()) { if (lbView === 'player') lbBack.onclick(); else lb.style.display = 'none'; return true; }
      if (modal.style.display === 'flex') { modal.style.display = 'none'; return true; }
      if ($('tip').style.display !== 'none' && !SG.S.tipClosed) { closeTip(); return true; } // крестик подсказки
      return false;
    };

    // ---------- хуки из игры ----------
    SG.hooks.pop = (x, z, text, color) => {
      const p = SG.R.project(x, 2.6, z);
      const d = document.createElement('div');
      d.className = 'pop'; richInto(d, text); d.style.left = p.x + 'px'; d.style.top = p.y + 'px'; d.style.color = color || '#fff';
      document.body.appendChild(d); setTimeout(() => d.remove(), 1100);
    };
    let bannerT = 0;
    SG.hooks.banner = text => {
      const b = $('banner'); b.textContent = text; b.style.display = 'block';
      clearTimeout(bannerT); bannerT = setTimeout(() => (b.style.display = 'none'), 5000);
    };
    SG.hooks.shake = () => { SG.R.shakeT = 0.3; };
    SG.hooks.dead = () => { joy = null; $('dead').style.display = 'flex'; };
    SG.hooks.changed = () => { SG.R.rebuildBase(); };
    // метро: экран темнеет, пока едем под землёй
    SG.hooks.ride = (lvl, on) => { $('fade').style.opacity = on && lvl >= 3 ? '1' : '0'; };
    if (SG.cloud.note) SG.hooks.banner('Загружен прогресс с сервера');
  };

  const DIRK = ['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright'];
  const anyDir = () => DIRK.some(k => keys[k]);
  const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

  // ---------- выбор, куда ехать ----------
  // Станция «взведена», пока ты на ней стоишь. Отпустил джойстик и нажал снова — вокруг героя появляются области
  // (по направлению на нужное место). Повёл в область — поехал. Отпустил или нажал «Отмена» — отменил, и станция
  // «разряжается» до тех пор, пока не сойдёшь с неё и не встанешь снова.
  UI.rail = null;
  UI.railBegin = function () {
    const G = SG.G, p = G.p;
    if (UI.rail || !G.onStation || !G.stArmed || p.dead || p.ride) return;
    const r = Math.SQRT1_2, st = G.onStation;
    const opts = G.railTargets().map(t => {
      const dx = t.x - st.x, dz = t.z - st.z; // направление на экране: вправо (dx - dz), вниз (dx + dz)
      const el = document.createElement('div'); el.className = 'rdest';
      el.appendChild(SG.iconImg(t.icon)); const nm = document.createElement('span'); nm.textContent = t.name; el.appendChild(nm);
      $('railsel').appendChild(el);
      return { st: t, ang: Math.atan2((dx + dz) * r, (dx - dz) * r), el };
    });
    if (opts.length === 2) { // две области рядом на экране разводим, чтобы в них можно было целиться
      const d = angDiff(opts[0].ang, opts[1].ang), min = 1.4;
      if (Math.abs(d) < min) { const k = (min - Math.abs(d)) / 2, sg = Math.sign(d) || 1; opts[0].ang -= sg * k; opts[1].ang += sg * k; }
    }
    if (!opts.length) return;
    const hint = document.createElement('div'); hint.className = 'rhint'; $('railsel').appendChild(hint);
    UI.rail = { opts, pick: null, hint };
    $('railsel').style.display = 'block'; $('railcancel').style.display = 'block';
  };
  UI.railEnd = function (cancel) {
    if (!UI.rail) return;
    UI.rail = null;
    $('railsel').textContent = ''; $('railsel').style.display = 'none'; $('railcancel').style.display = 'none';
    if (cancel) SG.G.stArmed = false;
  };
  // Отпустил джойстик: если была выбрана область — едем, иначе это отмена
  UI.railRelease = function () {
    const R = UI.rail;
    if (!R) return;
    if (R.pick && SG.G.startRide(R.pick.st.id)) UI.railEnd(false); else UI.railEnd(true);
  };
  function railTick(jx, jy) {
    const R = UI.rail, p = SG.G.p;
    if (p.dead || p.ride || !SG.G.onStation) { UI.railEnd(false); return; }
    const c = SG.R.project(p.x, 1.0, p.z), l = Math.hypot(jx, jy);
    const pick = l > 0.35 ? R.opts.reduce((b, o) => (Math.abs(angDiff(Math.atan2(jy, jx), o.ang)) < Math.abs(angDiff(Math.atan2(jy, jx), b.ang)) ? o : b)) : null;
    const ok = pick && Math.abs(angDiff(Math.atan2(jy, jx), pick.ang)) < 0.75;
    for (const o of R.opts) {
      const x = Math.max(60, Math.min(innerWidth - 60, c.x + Math.cos(o.ang) * 105)), y = Math.max(60, Math.min(innerHeight - 60, c.y + Math.sin(o.ang) * 105));
      o.el.style.left = x + 'px'; o.el.style.top = y + 'px';
      o.el.classList.toggle('on', ok && o === pick);
    }
    // Едем только после того, как отпустишь джойстик: пока держишь, выбор можно менять (в центр — «никуда»)
    R.pick = ok ? pick : null;
    const txt = R.pick ? 'Отпусти — поедешь: ' + R.pick.st.name : 'Веди в нужную область и отпусти — поедешь. В центр или «Отмена» — остаться';
    if (R.hint.textContent !== txt) R.hint.textContent = txt;
    R.hint.style.left = Math.max(150, Math.min(innerWidth - 150, c.x)) + 'px'; R.hint.style.top = Math.max(40, c.y - 150) + 'px';
  }

  // Вектор движения в мировых координатах. Камера смотрит в сторону (-1,-1), поэтому «вверх» на экране = (-x,-z).
  UI.input = function () {
    let jx = 0, jy = 0;
    if (joy) { jx = joy.dx; jy = joy.dy; }
    if (keys.a || keys.arrowleft) jx -= 1; if (keys.d || keys.arrowright) jx += 1;
    if (keys.w || keys.arrowup) jy -= 1; if (keys.s || keys.arrowdown) jy += 1;
    if (UI.rail) { railTick(jx, jy); return { mx: 0, mz: 0 }; } // пока выбираешь станцию, герой стоит
    const r = Math.SQRT1_2;
    return { mx: (jx + jy) * r, mz: (jy - jx) * r };
  };

  function set(id, v, cls) {
    const el = $(id);
    if (last[id] !== v) { el.textContent = v; last[id] = v; }
    if (cls !== undefined && last[id + 'c'] !== cls) { el.className = cls; last[id + 'c'] = cls; }
  }
  function seticon(id, name) {
    const el = $(id);
    if (last[id] !== name) { el.src = SG.iconURL(name); last[id] = name; }
  }
  UI.hud = function () {
    const S = SG.S, D = SG.D, p = SG.G.p;
    set('cash', SG.fmt(S.cash));
    set('wood', SG.fmt(S.wood), 'num');
    const bn = $('bananarow'), bshow = S.banana > 0 || D.jungleBase;
    if (last.bn !== bshow) { bn.style.display = bshow ? 'flex' : 'none'; last.bn = bshow; }
    set('banana', SG.fmt(S.banana), 'num');
    const fm = SG.G.fishMode; // на пирсе и на корабле вместо мяса показываем рыбу
    set('meat', SG.fmt(fm ? S.fish : S.meat), 'num');
    seticon('meatic', fm ? 'fish' : 'meat');
    set('gold', SG.fmt(S.gold), 'num');
    $('hpfill').style.width = (100 * p.hp / D.maxHp) + '%';
    set('hpnum', Math.ceil(p.hp) + '/' + D.maxHp);
    // слева сверху вместо топора: удочка на пирсе, гарпун на корабле
    set('axename', fm === 'ship' ? 'Гарпун • ур. ' + (SG.lv('hdmg') + 1) : fm === 'rod' ? 'Удочка • ур. ' + SG.lv('rod') : SG.TIERS[D.tier].n + ' топор • ур. ' + (D.axeLvl + 1));
    seticon('axeic', fm === 'ship' ? 'harpoon' : fm === 'rod' ? 'rod' : 'axe');
    set('nickname', S.nick || 'Выживший');
    $('eat').disabled = (S.meat <= 0 && S.banana <= 0) || p.hp >= D.maxHp || p.dead;
    // подсказка: что делает плитка, на которой стоишь
    const pad = SG.G.onPad, info = $('info');
    const G = SG.G, hint = G.onStation && G.stArmed && !UI.rail && !p.dead && !p.ride ? 'отпусти джойстик и нажми снова — выберешь, куда ехать' : '';
    if (!pad || p.dead) {
      if (hint) { const th = '{rail} Станция: ' + hint; if (last.info !== th) { richInto(info, th); info.style.display = 'block'; last.info = th; } return; }
      if (last.info !== '') { info.style.display = 'none'; last.info = ''; }
      return;
    }
    const d = pad.def, L = S.lv[pad.id] || 0;
    let t;
    if (pad.kind === 'turret') t = '{bow} Башня: сама стреляет по мобам • ' + SG.fmt(G.padCost(pad)) + ' $ + ' + SG.fmt(G.padWood(pad)) + ' {log}';
    else if (G.padMaxed(pad)) t = '{' + d.icon + '} ' + d.name + ': максимум (' + d.val(L) + ')';
    else {
      t = '{' + d.icon + '} ' + d.name + ': ' + (L ? d.val(L) : 'нет') + ' → ' + d.val(L + 1) + ' • ур. ' + L + '/' + d.max;
      if (pad.id === 'base') t += ' • +2 места под башни • нужно ' + SG.fmt(G.padWood(pad)) + ' {log}';
      if (pad.id === 'goldstall') t = '{gold} Лавка золота: открыть продажу золота';
      if (pad.id === 'ship') t = '{ship} Корабль: заходи в воду у пирса и охоться на большую рыбу гарпуном';
      if (pad.id === 'jbase') t = '{palm} Джунгли-база: построить за северной стеной • ' + SG.fmt(G.padWood(pad)) + ' {log}';
      if (pad.id === 'gun') t = '{gun} Дробовик: кружит вокруг героя и сам стреляет по мобам';
      if (pad.id === 'railf' || pad.id === 'railj') t = '{rail} Станция: построить, чтобы ездить сюда и отсюда';
      if (pad.id === 'fbase') t = '{fish} Рыбацкая база: построить на берегу • ' + SG.fmt(G.padWood(pad)) + ' {log}';
    }
    if (pad.id === 'rail' && hint) t += ' • ' + hint;
    if (last.info !== t) { richInto(info, t); info.style.display = 'block'; last.info = t; }
  };
})();
