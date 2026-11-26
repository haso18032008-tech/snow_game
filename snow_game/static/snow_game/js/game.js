// Игровая логика (без графики): мир, враги, топоры, рабочие, лавки, башни, покупки.
// Координаты: x/z — плоскость земли, y — вверх. База — прямоугольник G.bounds.
(function () {
  'use strict';
  const SG = window.SG;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const rint = (a, b) => Math.floor(rnd(a, b + 1));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hyp = Math.hypot;

  const G = (SG.G = {});
  SG.hooks = { pop() {}, shake() {}, dead() {}, changed() {}, banner() {}, sfx() {}, ride() {} };

  // Характеристики врагов: 0 — белый медведь, 1 — шипастый, 2 — рогатый, 3 — ледяной король
  const KINDS = [
    { hp: 60, spd: 6, dmg: [9, 15], meat: [1, 3], scale: 1, aggro: 13, ring: [42, 62] },
    { hp: 260, spd: 6.8, dmg: [18, 26], meat: [3, 6], scale: 1.15, aggro: 14, ring: [62, 92] },
    { hp: 900, spd: 7.4, dmg: [35, 50], meat: [6, 12], scale: 1.35, aggro: 15, ring: [92, 118] },
    { hp: 6000, spd: 8, dmg: [80, 110], meat: [20, 35], scale: 1.9, aggro: 18, ring: [120, 150] },
    // Редкий моб «Верите»: не нападает, убегает от игрока, очень живучий, роняет золото
    { hp: 2500, spd: 7.8, dmg: [0, 0], meat: [0, 0], scale: 1.2, aggro: 0, ring: [55, 110] },
    // Джунгли (живут только на севере, за стеной): обезьяна, горилла-босс и редкий «Любопытстити».
    // С них падают бананы (loot — сколько штук). Все числа — здесь.
    { hp: 6000, spd: 9.5, dmg: [60, 90], meat: [0, 0], scale: 1, aggro: 20, jungle: true, loot: [1, 3] },
    { hp: 60000, spd: 8.5, dmg: [220, 300], meat: [0, 0], scale: 1.9, aggro: 22, jungle: true, loot: [12, 20] },
    { hp: 15000, spd: 8.5, dmg: [0, 0], meat: [0, 0], scale: 1.2, aggro: 0, jungle: true, loot: [50, 80] }
  ];
  const VERITE = 4, MONKEY = 5, GORILLA = 6, CURIO = 7;
  const JUNGLE_COUNTS = [32, 6];   // обезьян и горилл
  const PALM_HP = 20, PALM_COUNT = 1100, SAD_HP = 2500;
  const BEAR_COUNTS = [14, 8, 5, 2];
  SG.KINDS = KINDS;
  const TREE_HP = 20, ORE_HP = 150, ORE_NEED_LVL = 3;

  const boundsFor = L => {
    const b = SG.baseHalf(L);
    return { minX: -b, maxX: b, minZ: -b, maxZ: 14, corners: L >= SG.CORNER_GATES_LVL };
  };
  const inBase = (x, z, m) => {
    const b = G.bounds; m = m || 0;
    return x > b.minX - m && x < b.maxX + m && z > b.minZ - m && z < b.maxZ + m;
  };
  G.inBase = inBase;

  // Проём в заборе: ворота посередине трёх сторон + южные ворота + места лавок
  // + на последнем уровне базы угловые ворота (по SG.CORNER_C метров от каждого угла вдоль обеих сторон).
  // m — запас: насколько сузить проём (NPC не должны задевать столбы; у игрока m = 0).
  SG.gapOK = function (side, v, m) {
    const b = G.bounds; m = m || 0;
    const c = SG.CORNER_C - m;
    if (side === 'W' || side === 'E') {
      if (Math.abs(v - (b.minZ + b.maxZ) / 2) < 2.4 - m) return true;
      return !!b.corners && Math.min(v - b.minZ, b.maxZ - v) < c;
    }
    if (side === 'N') {
      if (Math.abs(v - (b.minX + b.maxX) / 2) < 2.4 - m) return true;
      return !!b.corners && Math.min(v - b.minX, b.maxX - v) < c;
    }
    if (Math.abs(v - SG.GATE_S_X) < 2.4 - m) return true;
    for (const s of SG.STALLS) if (Math.abs(v - s.x) < 1.8 - m) return true;
    return !!b.corners && Math.min(v - b.minX, b.maxX - v) < c;
  };
  function fenceBlocked(x, z) {
    const b = G.bounds, r = 0.55;
    if (z >= b.minZ - r && z <= b.maxZ + r) {
      if (Math.abs(x - b.minX) < r && !SG.gapOK('W', z)) return true;
      if (Math.abs(x - b.maxX) < r && !SG.gapOK('E', z)) return true;
    }
    if (x >= b.minX - r && x <= b.maxX + r) {
      if (Math.abs(z - b.minZ) < r && !SG.gapOK('N', x)) return true;
      if (Math.abs(z - b.maxZ) < r && !SG.gapOK('S', x)) return true;
    }
    return false;
  }

  // Вода и гигантские деревья не пускают пешего игрока. На корабле игрок плавает по воде (moveShip).
  const GIANT_HP = 6000, GIANT_R = 1.8;
  const inWater = (x, z) => x > SG.LAKE.x - 0.4 && x < SG.SEA.x1 && z > SG.LAKE.z0 && z < SG.LAKE.z1;
  function giantBlocked(x, z) {
    if (x > SG.WALL_X - 3 || z < SG.JUNGLE.z + 3) {
      const r2 = (GIANT_R + 0.5) * (GIANT_R + 0.5);
      for (const g of G.giants) if (g.hp > 0 && (g.x - x) ** 2 + (g.z - z) ** 2 < r2) return true;
    }
    return false;
  }
  const worldBlocked = (x, z) => inWater(x, z) || giantBlocked(x, z);

  function segDist2(px, pz, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    let t = l2 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
    t = clamp(t, 0, 1);
    const qx = ax + dx * t - px, qz = az + dz * t - pz;
    return qx * qx + qz * qz;
  }

  // ---------- маршруты NPC через ворота ----------
  // Рабочие, сборщики и золотоискатели не ходят сквозь забор: между базой и внешним миром они проходят
  // только в проёмы (ворота, угловые ворота, лавки). Игрока это не касается — он упирается в забор физически.
  // Отрезок, пересекающий стену не в проёме, считается заблокированным.
  // m — запас от столбов. Маршрут строим с запасом побольше (0,5), а на ходу проверяем с меньшим (0,3):
  // иначе на кромке допуска NPC из-за округления «выпадал» из проёма и маршрут перестраивался.
  function segBlocked(ax, az, bx, bz, m) {
    const b = G.bounds, dx = bx - ax, dz = bz - az;
    m = m === undefined ? 0.4 : m;
    if (dx !== 0) {
      for (const k of [0, 1]) {
        const t = ((k ? b.maxX : b.minX) - ax) / dx;
        if (t <= 0 || t >= 1) continue;
        const z = az + dz * t;
        if (z >= b.minZ && z <= b.maxZ && !SG.gapOK(k ? 'E' : 'W', z, m)) return true;
      }
    }
    if (dz !== 0) {
      for (const k of [0, 1]) {
        const t = ((k ? b.maxZ : b.minZ) - az) / dz;
        if (t <= 0 || t >= 1) continue;
        const x = ax + dx * t;
        if (x >= b.minX && x <= b.maxX && !SG.gapOK(k ? 'S' : 'N', x, m)) return true;
      }
    }
    return false;
  }
  // Проёмы для планировщика: точка «снаружи» и «внутри» по обе стороны от центра проёма.
  // pen — штраф к длине пути: лавки допустимы (это разрешено), но двери предпочтительнее.
  let openCache = null;
  function openings() {
    const b = G.bounds;
    if (openCache && openCache.b === b) return openCache.list;
    const list = [], mx = (b.minX + b.maxX) / 2, mz = (b.minZ + b.maxZ) / 2, o = 1.8;
    const add = (x, z, nx, nz, pen) => list.push({ ox: x + nx * o, oz: z + nz * o, ix: x - nx * o, iz: z - nz * o, pen: pen || 0 });
    add(mx, b.minZ, 0, -1); add(b.minX, mz, -1, 0); add(b.maxX, mz, 1, 0); add(SG.GATE_S_X, b.maxZ, 0, 1);
    for (const st of SG.STALLS) add(st.x, b.maxZ, 0, 1, 8);
    if (b.corners) {
      const h = SG.CORNER_C / 2, r = Math.SQRT1_2;
      add(b.minX + h, b.minZ + h, -r, -r); add(b.maxX - h, b.minZ + h, r, -r);
      add(b.minX + h, b.maxZ - h, -r, r); add(b.maxX - h, b.maxZ - h, r, r);
    }
    openCache = { b, list };
    return list;
  }
  // Кратчайший путь по графу видимости: точки у проёмов + 4 угла забора (обход снаружи).
  // Возвращает список точек от первой после старта до цели включительно.
  function planRoute(sx, sz, tx, tz) {
    const pts = [[sx, sz], [tx, tz]], pen = [0, 0], b = G.bounds, k = 2.5;
    for (const op of openings()) { pts.push([op.ox, op.oz], [op.ix, op.iz]); pen.push(op.pen / 2, op.pen / 2); }
    for (const [x, z] of [[b.minX - k, b.minZ - k], [b.maxX + k, b.minZ - k], [b.minX - k, b.maxZ + k], [b.maxX + k, b.maxZ + k]]) { pts.push([x, z]); pen.push(0); }
    const n = pts.length, dist = new Array(n).fill(Infinity), prev = new Array(n).fill(-1), done = new Array(n).fill(false);
    dist[0] = 0;
    for (let it = 0; it < n; it++) {
      let u = -1;
      for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0 || dist[u] === Infinity || u === 1) break;
      done[u] = true;
      for (let v = 0; v < n; v++) {
        if (done[v]) continue;
        const nd = dist[u] + hyp(pts[v][0] - pts[u][0], pts[v][1] - pts[u][1]) + pen[v];
        if (nd < dist[v] && !segBlocked(pts[u][0], pts[u][1], pts[v][0], pts[v][1], 0.5)) { dist[v] = nd; prev[v] = u; }
      }
    }
    if (prev[1] < 0) return [[tx, tz]]; // пути нет (не должно быть) — идём напрямик, лишь бы не встать
    const out = [];
    for (let v = 1; v !== 0; v = prev[v]) out.push(pts[v]);
    return out.reverse();
  }
  // Куда NPC идти прямо сейчас, чтобы добраться до (tx, tz): сама цель или ближайшая точка маршрута через проём.
  function routeStep(n, tx, tz) {
    let r = n.route;
    if (!r || r.b !== G.bounds || (r.tx - tx) ** 2 + (r.tz - tz) ** 2 > 1) r = n.route = { b: G.bounds, tx, tz, pts: planRoute(n.x, n.z, tx, tz), i: 0 };
    // Переключаемся только когда точка достигнута вплотную: шаг в walkTo ложится ровно на неё. Иначе NPC срезает угол
    // и пересекает проём не по проверенному отрезку, а под другим углом — вплоть до столба.
    while (r.i < r.pts.length - 1 && hyp(r.pts[r.i][0] - n.x, r.pts[r.i][1] - n.z) < 0.02) r.i++;
    return r.pts[r.i];
  }
  // Шаг NPC к цели с обходом забора. Возвращает расстояние до цели; пока между NPC и целью забор,
  // оно «с запасом» (+50), чтобы вызывающий код не решил, что дошёл, стоя с другой стороны забора.
  function walkTo(n, tx, tz, sp, dt) {
    const d = hyp(tx - n.x, tz - n.z), blocked = segBlocked(n.x, n.z, tx, tz, 0.3);
    let wx = tx, wz = tz;
    if (blocked) [wx, wz] = routeStep(n, tx, tz); else n.route = null;
    if (d > 0.05) {
      const dx = wx - n.x, dz = wz - n.z, dd = hyp(dx, dz);
      if (dd > 0.001) { const s = Math.min(dd, sp * dt); n.x += dx / dd * s; n.z += dz / dd * s; n.face = Math.atan2(dx, dz); n.walk = true; }
    }
    return blocked ? d + 50 : d;
  }
  G.walkTo = walkTo; G.segBlocked = segBlocked; // для проверок

  // ---------- мир ----------
  G.init = function () {
    const S = SG.S, D = SG.D;
    G.t = 0;
    G.bounds = boundsFor(D.baseL);
    G.p = { x: SG.SPAWN[0], z: SG.SPAWN[1], face: 0, walk: false, dead: false, hurt: 0, axeAng: 0, swing: 0, hp: Math.min(S.hp > 0 ? S.hp : D.maxHp, D.maxHp) };
    G.fire = { x: -12, z: 8.5 };
    G.trees = []; G.ores = []; G.bears = []; G.workers = []; G.customers = [];
    G.palms = []; G.hunters = []; G.guns = []; G.gshots = []; G.gunCd = []; G.gunFl = []; G.onStation = null; G.stArmed = false;
    G.sad = { kind: 'sad', x: 0, z: 0, s: 1.6, hp: SAD_HP, max: SAD_HP, dead: true, under: false, respawn: rnd(60, 120), t: 0, life: 0, flash: 0, a: 0, ph: 0 };
    G.stations = [
      Object.assign({ id: 'main', name: 'Дом', icon: 'castle', ok: () => SG.D.railLvl > 0 }, SG.RAIL.main),
      Object.assign({ id: 'fish', name: 'Море', icon: 'fish', ok: () => SG.D.railLvl > 0 && SG.D.stFish }, SG.RAIL.fish),
      Object.assign({ id: 'jungle', name: 'Джунгли', icon: 'palm', ok: () => SG.D.railLvl > 0 && SG.D.stJungle }, SG.RAIL.jungle)
    ];
    G.turrets = []; G.shots = []; G.drops = []; G.axes = []; G.onPad = null; G.collectors = []; G.miners = []; G.giants = []; G.fishers = []; G.fishFx = []; G.harps = []; G.sea = []; G.fishMode = null;
    G.ship = { x: SG.SHIP.dock.x, z: SG.SHIP.dock.z, rot: 0, rotT: 0, boarded: false, aim: 0, cd: 0, tgt: null };
    G.pf = { state: 'cast', t: 0, wait: 0, thrown: false, bx: SG.FISH.bobX, bz: 0 }; // удочка самого игрока на пирсе
    G.queues = { wood: [], meat: [], gold: [], fish: [], jwood: [], banana: [] };
    G.custT = 2; G.custTF = 4; G.custTJ = 5;
    G.stalls = SG.STALLS.map(d => ({
      id: d.id, name: d.name, icon: d.icon, price: d.price, x: d.x,
      pad: { x: d.x, z: SG.STALL_PAD_Z }, cash: { x: d.x + 3.4, z: 10.2 }, bench: { x: d.x, z: SG.BENCH_Z },
      // очередь: голова (x, z), направление «от лавки», на каком расстоянии появляются покупатели, куда уходят
      q: { x: d.x - 0.6, z: 15.8, dx: 0, dz: 1, len: 36.2, exit: 2.8 },
      flow: 'main', get st() { return SG.S.stall[d.id]; }, get unlocked() { return d.id !== 'gold' || SG.D.goldUnlocked; }
    }));
    // рыбная лавка на дальнем берегу: игрок туда ничего не выкладывает (рыба прилетает сама), только забирает выручку
    const FZ = SG.FISH;
    G.stalls.push({
      id: 'fish', name: 'Рыба', icon: 'fish', price: FZ.price, x: FZ.x, remote: true, flow: 'fish',
      pad: { x: FZ.pad.x, z: FZ.pad.z }, cash: { x: FZ.cash.x, z: FZ.cash.z }, bench: { x: FZ.x, z: FZ.benchZ },
      q: { x: FZ.x, z: FZ.headZ, dx: 0, dz: -1, len: 28, exit: 2.8 },
      get st() { return SG.S.stall.fish; }, get unlocked() { return SG.D.fishBase; }
    });
    // лавки джунглевой базы: дерево с пальм и бананы (товар берётся из S[res])
    const Z0 = SG.JB.z0;
    SG.JSTALLS.forEach(d => G.stalls.push({
      id: d.id, res: d.res, name: d.name, icon: d.icon, price: d.price, x: d.x, remote: true, flow: 'jungle',
      pad: { x: d.x, z: Z0 + 2.1 }, cash: { x: d.x + 3.4, z: Z0 + 2.9 }, bench: { x: d.x, z: Z0 },
      q: { x: d.x - 0.6, z: Z0 - 2.7, dx: 0, dz: -1, len: 26, exit: 2.8 },
      get st() { return SG.S.stall[d.id]; }, get unlocked() { return SG.D.jungleBase; }
    }));
    // плитки покупок
    G.pads = SG.U.map(u => ({ id: u.id, kind: 'upg', x: u.x, z: u.z, def: u }));
    SG.TURRETS.forEach((t, i) => {
      const [x, z] = SG.slotPos(i, G.bounds);
      G.pads.push({ id: 'tur' + i, kind: 'turret', idx: i, x, z, rot: i % 4, minL: t[2], def: { name: 'Башня', icon: 'bow', max: 1 } });
    });

    genTrees(); genOres(); genBears(); genGiants(); genPalms(); genSea();
    G.syncWorkers(); G.syncTurrets();
  };

  function genTrees() {
    const grid = new Map(), cell = 2.4;
    const key = (x, z) => Math.floor(x / cell) + ',' + Math.floor(z / cell);
    const near = (x, z) => {
      const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const a = grid.get((cx + i) + ',' + (cz + j));
        if (a) for (const t of a) if ((t.x - x) ** 2 + (t.z - z) ** 2 < cell * cell) return true;
      }
      return false;
    };
    let tries = 0;
    // половина деревьев — плотный лес вокруг базы (как в рекламе), остальные по всему миру
    while (G.trees.length < 2000 && tries++ < 80000) {
      const span = G.trees.length < 800 ? 80 : SG.HALF;
      const x = rnd(-span, span), z = rnd(-span, span);
      if (inBase(x, z, 3.5)) continue;
      if (x > SG.WALL_X - 2) continue; // за стеной растут только гиганты
      if (z < SG.JUNGLE.z - 2) continue; // на севере джунгли: там пальмы, а не ёлки
      if (x > -16 && x < 8 && z > 12 && z < 52) continue; // ледяные дорожки покупателей
      if (near(x, z)) continue;
      const t = { i: G.trees.length, x, z, hp: TREE_HP, max: TREE_HP, respawn: 0, hitT: 0, shake: 0, s: rnd(0.55, 0.8), rot: rnd(0, 6.28), off: false, dirty: true, claim: null };
      G.trees.push(t);
      const k = key(x, z);
      (grid.get(k) || grid.set(k, []).get(k)).push(t);
    }
  }

  // Гигантские деревья: два ряда стены вдоль всего мира + редкие одиночные за ней.
  // Рубятся только топором «ур. 25» и выше. Генерация детерминирована (свой генератор случайных чисел), чтобы
  // индекс дерева был одним и тем же после перезагрузки: срубленные индексы лежат в S.cut, и пеньки сохраняются.
  function seeded(seed) {
    return () => {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function genGiants() {
    const R = seeded(20261019), rr = (a, b) => a + R() * (b - a);
    const add = (x, z) => G.giants.push({ i: G.giants.length, x, z, hp: GIANT_HP, max: GIANT_HP, hitT: 0, shake: 0, s: rr(1.85, 2.25), rot: rr(0, 6.28), dirty: true });
    for (const wx of [SG.WALL_X, SG.WALL_X + 3.4]) {
      // шаг 3 при радиусе столкновения 1.8: щелей между стволами нет, пока дерево не срублено
      for (let z = -SG.HALF + 1.5; z <= SG.HALF - 0.5; z += 3) add(wx + rr(-0.3, 0.3), z + rr(-0.2, 0.2));
    }
    const L = SG.LAKE;
    let n = 0, tries = 0;
    while (n < 70 && tries++ < 3000) {
      const x = rr(SG.WALL_X + 8, 146), z = rr(-SG.HALF + 2, SG.HALF - 2);
      if (x > 133 && z > -34 && z < 62) continue;                 // рыбацкая база, плитки и очередь
      if (x > L.x - 4 && z > L.z0 - 4 && z < L.z1 + 4) continue;  // берег
      let ok = true;
      for (let k = G.giants.length - 1; k >= 0 && ok; k--) { const g = G.giants[k]; if (g.x > SG.WALL_X + 5 && (g.x - x) ** 2 + (g.z - z) ** 2 < 36) ok = false; }
      if (ok) { add(x, z); n++; }
    }
    // Северная стена из тропических гигантов + одиночные внутри джунглей. Идут ПОСЛЕ восточных (индексы восточных
    // не меняются, значит старые сохранения с S.cut остаются верными); свой генератор случайных чисел.
    G.jgStart = G.giants.length;
    const RJ = seeded(20261125), rj = (a, b) => a + RJ() * (b - a);
    const addJ = (x, z) => G.giants.push({ i: G.giants.length, x, z, hp: GIANT_HP, max: GIANT_HP, hitT: 0, shake: 0, s: rj(1.85, 2.25), rot: rj(0, 6.28), dirty: true, jg: true });
    for (const wz of [SG.JUNGLE.z, SG.JUNGLE.z - 3.4]) {
      for (let x = -SG.HALF + 1.5; x <= SG.WALL_X - 2; x += 3) addJ(x + rj(-0.3, 0.3), wz + rj(-0.2, 0.2));
    }
    let nj = 0, tj = 0;
    while (nj < 50 && tj++ < 3000) {
      const x = rj(-SG.HALF + 6, SG.JUNGLE.x1 - 6), z = rj(-SG.HALF + 6, SG.JUNGLE.z - 12);
      if (inJClearing(x, z, 6)) continue;
      let ok = true;
      for (let k = G.giants.length - 1; k >= G.jgStart && ok; k--) { const g = G.giants[k]; if (g.z < SG.JUNGLE.z - 6 && (g.x - x) ** 2 + (g.z - z) ** 2 < 49) ok = false; }
      if (ok) { addJ(x, z); nj++; }
    }
    // Расширение мира на север: восточная стена продолжается до нового края, плюс одиночные гиганты в новой полосе.
    // Свой генератор и добавление в самый конец — индексы всего, что было раньше, не меняются.
    const RJ2 = seeded(20261127), rk = (a, b) => a + RJ2() * (b - a);
    for (const wx of [SG.WALL_X, SG.WALL_X + 3.4]) {
      for (let z = SG.JUNGLE.zMin + 1.5; z < -SG.HALF + 1.4; z += 3) addJ(wx + rk(-0.3, 0.3), z + rk(-0.2, 0.2));
    }
    let nk = 0, tk = 0;
    while (nk < 80 && tk++ < 3000) {
      const x = rk(-SG.HALF + 6, SG.JUNGLE.x1 - 6), z = rk(SG.JUNGLE.zMin + 6, -SG.HALF + 2);
      if (inJClearing(x, z, 6)) continue;
      let ok = true;
      for (let k = G.giants.length - 1; k >= G.jgStart && ok; k--) { const g = G.giants[k]; if (g.z < SG.JUNGLE.z - 6 && (g.x - x) ** 2 + (g.z - z) ** 2 < 49) ok = false; }
      if (ok) { addJ(x, z); nk++; }
    }
    for (const i of SG.S.cut) if (G.giants[i]) { G.giants[i].hp = 0; G.giants[i].dirty = true; }
  }

  // Поляна джунглевой базы: тут не растут деревья и не ходят мобы
  // Поляна — по самой большой ограде (уровень 4): растения и мобы туда не лезут, чтобы база могла расти
  const JR4 = SG.jbRect(4);
  const inJClearing = (x, z, m) => x > JR4.minX - m && x < JR4.maxX + m && z > JR4.minZ - m && z < JR4.maxZ + m;
  function genPalms() {
    const cell = 3.4, grid = new Map();
    const key = (x, z) => Math.floor(x / cell) + ',' + Math.floor(z / cell);
    const near = (x, z) => {
      const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const a = grid.get((cx + i) + ',' + (cz + j));
        if (a) for (const t of a) if ((t.x - x) ** 2 + (t.z - z) ** 2 < cell * cell) return true;
      }
      return false;
    };
    let tries = 0;
    while (G.palms.length < PALM_COUNT && tries++ < 90000) {
      const x = rnd(-SG.HALF + 3, SG.JUNGLE.x1 - 2), z = rnd(SG.JUNGLE.zMin + 3, SG.JUNGLE.z - 8);
      if (inJClearing(x, z, 3) || near(x, z)) continue;
      let hit = false;
      for (let k = G.jgStart; k < G.giants.length && !hit; k++) { const g = G.giants[k]; if ((g.x - x) ** 2 + (g.z - z) ** 2 < 9) hit = true; }
      if (hit) continue;
      const t = { i: G.palms.length, x, z, hp: PALM_HP, max: PALM_HP, respawn: 0, hitT: 0, shake: 0, s: rnd(0.9, 1.3), rot: rnd(0, 6.28), dirty: true, ban: Math.random() < 0.06 };
      G.palms.push(t);
      const k = key(x, z);
      (grid.get(k) || grid.set(k, []).get(k)).push(t);
    }
  }

  // Большая рыба: у каждой есть «дом» — чем дальше от берега, тем крупнее рыба, тем больше у неё здоровья и добычи.
  const seaSize = hx => 0.8 + (hx - SG.LAKE.x) / 50;
  const seaHp = s => 25 * Math.pow(s, 2.4);
  const seaLoot = s => Math.ceil(2 * Math.pow(s, 1.6));
  function newSeaFish(f) {
    const hx = SG.LAKE.x + 8 + Math.pow(Math.random(), 1.5) * (SG.SEA.x1 - SG.LAKE.x - 20);
    const hz = rnd(SG.LAKE.z0 + 10, SG.LAKE.z1 - 10);
    const s = seaSize(hx) * rnd(0.9, 1.1);
    Object.assign(f, { hx, hz, x: hx, z: hz, s, hp: seaHp(s), max: seaHp(s), a: rnd(0, 6.28), t: 0, dead: false, respawn: 0, flash: 0, ph: rnd(0, 6) });
    return f;
  }
  function genSea() { for (let i = 0; i < SG.SEA.fishCount; i++) G.sea.push(newSeaFish({ i })); }

  function genOres() {
    for (let i = 0; i < 9; i++) {
      let x, z, n = 0;
      do { const a = rnd(0, 6.28), r = rnd(45, 105); x = Math.cos(a) * r; z = Math.sin(a) * r; } while (n++ < 50 && (x > SG.WALL_X - 15 || inBase(x, z, 30) || (x > -20 && x < 12 && z > 10)));
      G.ores.push({ i, x, z, hp: ORE_HP, max: ORE_HP, respawn: 0, hitT: 0, shake: 0, dirty: true, claim: null });
    }
  }
  const jungleClear = (x, z) => inJClearing(x, z, 6);
  function bearPos(kind) {
    const K = KINDS[kind], J = SG.JUNGLE;
    if (K.jungle) {
      for (let n = 0; n < 60; n++) {
        const x = rnd(-SG.HALF + 6, J.x1 - 6), z = rnd(J.zMin + 6, J.z - 12);
        if (!jungleClear(x, z)) return [x, z];
      }
      return [-60, -200];
    }
    for (let n = 0; n < 60; n++) {
      const a = rnd(0, 6.28), r = rnd(K.ring[0], K.ring[1]);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(x) > SG.HALF - 3 || Math.abs(z) > SG.HALF - 3) continue;
      if (inBase(x, z, 12)) continue;
      if (x > SG.WALL_X - 6) continue; // звери не заходят в восточный биом
      if (z < SG.JUNGLE.z + 8) continue; // и в северные джунгли
      return [x, z];
    }
    return [rnd(60, 100), rnd(60, 100)];
  }
  function spawnBear(b, kind) {
    const [x, z] = bearPos(kind), K = KINDS[kind];
    Object.assign(b, { kind, x, z, wx: x, wz: z, wt: 0, hp: K.hp, max: K.hp, face: rnd(0, 6.28), cd: 0, atk: 0, hitT: 0, flash: 0, ph: rnd(0, 6), moving: false, aggro: false, dead: false, respawn: 0, life: 0 });
    if (kind === CURIO) { b.life = 200; b.fleeT = 0; if (SG.D.jungleBase) { SG.hooks.sfx('jingle'); SG.hooks.banner('Редкий моб «' + SG.CURIO_NAME + '» появился в джунглях! Он сам подойдёт — выпадут бананы'); } }
    if (kind === VERITE) { b.life = 200; SG.hooks.sfx('jingle'); SG.hooks.banner('Редкий моб «' + SG.VERITE_NAME + '» появился на карте! Поймай его — выпадет золото'); }
    return b;
  }
  function genBears() {
    BEAR_COUNTS.forEach((n, k) => { for (let i = 0; i < n; i++) G.bears.push(spawnBear({ i: G.bears.length }, k)); });
    JUNGLE_COUNTS.forEach((n, k) => { for (let i = 0; i < n; i++) G.bears.push(spawnBear({ i: G.bears.length }, MONKEY + k)); });
    // «Любопытстити» стартует «мёртвым» и появится через минуту-две
    G.bears.push({ i: G.bears.length, kind: CURIO, x: 0, z: 0, hp: KINDS[CURIO].hp, max: KINDS[CURIO].hp, face: 0, dead: true, respawn: rnd(60, 120), moving: false, aggro: false, hitT: 0, flash: 0, ph: 0, wx: 0, wz: 0, wt: 0, cd: 0, atk: 0, life: 0, fleeT: 0 });
    // «Верите» стартует «мёртвым» и появится через минуту-две
    const K = KINDS[VERITE];
    G.bears.push({ i: G.bears.length, kind: VERITE, x: 0, z: 0, hp: K.hp, max: K.hp, face: 0, dead: true, respawn: rnd(60, 120), moving: false, aggro: false, hitT: 0, flash: 0, ph: 0, wx: 0, wz: 0, wt: 0, cd: 0, atk: 0, life: 0 });
  }

  // ---------- покупки ----------
  const lvOf = pad => SG.S.lv[pad.id] || 0;
  G.builtTurrets = function () {
    let n = 0;
    for (let i = 0; i < SG.TURRETS.length; i++) if (SG.S.lv['tur' + i]) n++;
    return n;
  };
  G.padVisible = function (pad) {
    const L = lvOf(pad);
    if (pad.id === 'fisher' && L >= 1 + (SG.S.lv.flen || 0)) return false; // нужно свободное место: удлини пирс
    if (pad.id === 'jhire' && L >= SG.D.hunterCap) return false; // нужно место: расширь базу в джунглях
    if (pad.kind === 'turret') return L === 0 && SG.D.baseL >= SG.TURRETS_NEED_BASE && pad.minL <= SG.D.baseL;
    if (pad.def.max === 1 && L >= 1) return false;
    if (L > 0) return true; // купленное не прячем, даже если условие потом «сломалось»
    const r = SG.REQ[pad.id];
    if (!r) return true;
    const conds = Array.isArray(r[0]) ? r : [r]; // одно условие или список (нужны все)
    return conds.every(c => (c[0] === 'turrets' ? G.builtTurrets() : (SG.S.lv[c[0]] || 0)) >= c[1]);
  };
  G.padCost = function (pad) {
    const L = lvOf(pad);
    if (pad.kind === 'turret') {
      let built = 0;
      for (let i = 0; i < SG.TURRETS.length; i++) if (SG.S.lv['tur' + i]) built++;
      return Math.ceil(SG.TURRET_BASE_COST * Math.pow(SG.TURRET_COST_MULT, built));
    }
    return Math.ceil(pad.def.base * Math.pow(pad.def.mult, L));
  };
  G.padMaxed = pad => lvOf(pad) >= pad.def.max;
  // Сколько дерева нужно ещё и к деньгам (0 — только деньги). Дерево берётся из того, что герой несёт с собой.
  G.padWood = function (pad) {
    if (pad.kind === 'turret') return Math.ceil(SG.TURRET_WOOD_BASE * Math.pow(SG.TURRET_WOOD_MULT, G.builtTurrets()));
    const w = pad.def.wood;
    return w ? Math.ceil(w[0] * Math.pow(w[1], lvOf(pad))) : 0;
  };

  function buy(pad) {
    const S = SG.S;
    const before = G.pads.filter(x => G.padVisible(x));
    S.wood -= G.padWood(pad); // считаем до роста уровня, иначе цена уже будет следующей
    S.lv[pad.id] = lvOf(pad) + 1;
    SG.recalc();
    G.syncWorkers(); // рабочие, сборщики и золотоискатели появляются сразу после покупки
    if (pad.kind === 'turret') G.syncTurrets();
    if (pad.id === 'base') expandBase();
    SG.hooks.sfx('buy');
    if (pad.id === 'fbase') SG.hooks.banner('Рыбацкая база построена! Купи удочку и рыбаков');
    if (pad.id === 'jbase') SG.hooks.banner('Джунгли-база построена! Купи дробовик и продавай бананы и пальмовое дерево');
    if (pad.id === 'gun') SG.hooks.banner('Дробовик куплен! Он кружит вокруг героя и сам стреляет по мобам');
    if (pad.id === 'rail' && lvOf(pad) === 1) SG.hooks.banner('Железная дорога! Встань на станцию, отпусти джойстик и нажми снова — выберешь, куда ехать');
    SG.hooks.pop(pad.x, pad.z, 'Куплено!', '#ffd23f');
    // что открылось благодаря этой покупке
    const fresh = G.pads.filter(x => G.padVisible(x) && !before.includes(x));
    if (fresh.length) { SG.hooks.pop(fresh[0].x, fresh[0].z, 'Новое улучшение!', '#9dd2ff'); SG.hooks.sfx('unlock'); }
    SG.hooks.changed();
  }
  function expandBase() {
    G.bounds = boundsFor(SG.D.baseL);
    for (const t of G.trees) if (!t.off && inBase(t.x, t.z, 1)) { t.off = true; t.hp = 0; t.dirty = true; }
    for (const o of G.ores) if (inBase(o.x, o.z, 1)) { o.hp = 0; o.respawn = 1e9; o.dirty = true; }
    // башни и места под них переезжают к новому забору, иначе после расширения они оказались бы в центре
    for (const pad of G.pads) if (pad.kind === 'turret') { const [x, z] = SG.slotPos(pad.idx, G.bounds); pad.x = x; pad.z = z; }
    for (const t of G.turrets) { const [x, z] = SG.slotPos(t.idx, G.bounds); t.x = x; t.z = z; }
  }

  G.syncWorkers = function () {
    while (G.fishers.length < SG.D.fishers) G.fishers.push({ seat: G.fishers.length, state: 'cast', t: rnd(0, 1.2), wait: 0, thrown: false, bx: SG.FISH.bobX, bz: SG.FISH.seatZ(G.fishers.length) });
    while (G.miners.length < SG.D.miners) G.miners.push({ x: rnd(3, 5.5), z: rnd(6, 8), face: 0, walk: false, ore: null, carry: 0, t: 0, swing: 0, state: 'seek' });
    while (G.collectors.length < SG.D.collectors) G.collectors.push({ x: rnd(-2, 2), z: rnd(6, 8), face: 0, walk: false, target: null, carry: 0, state: 'seek', idle: 0 });
    while (G.hunters.length < SG.D.hunters) G.hunters.push({ x: rnd(1, 5), z: SG.JB.z0 - rnd(0.5, 2.5), face: 0, walk: false, tgt: null, t: 0, swing: 0, state: 'seek', route: null });
    while (G.workers.length < SG.D.workers) G.workers.push({ x: rnd(-2, 2), z: rnd(2, 5), face: 0, walk: false, tree: null, carry: 0, t: 0, swing: 0, state: 'seek' });
  };
  G.syncTurrets = function () {
    SG.TURRETS.forEach((t, i) => {
      if (SG.S.lv['tur' + i] && !G.turrets.some(x => x.idx === i)) { const [x, z] = SG.slotPos(i, G.bounds); G.turrets.push({ idx: i, x, z, cd: rnd(0, 1), aim: 0, flash: 0 }); }
    });
  };

  // ---------- действия игрока ----------
  G.eat = function () {
    const S = SG.S, p = G.p, D = SG.D;
    if (p.dead || (S.meat <= 0 && S.banana <= 0) || p.hp >= D.maxHp) return;
    // мясо лечит сильнее; когда мяса нет — банан (слабее)
    const banana = S.meat <= 0;
    if (banana) S.banana--; else S.meat--;
    S.stats.eaten++; SG.hooks.sfx('eat');
    const h = banana ? Math.max(20, 0.15 * D.maxHp) : Math.max(40, 0.35 * D.maxHp);
    p.hp = Math.min(D.maxHp, p.hp + h);
    SG.hooks.pop(p.x, p.z, '+' + Math.round(h) + ' {heart}', '#7dff8a');
  };
  // Биом по координатам: восток (за стеной) — «fish», север (за северной стеной) — «jungle», остальное — «main»
  G.biomeAt = (x, z) => (x > SG.WALL_X - 3 ? 'fish' : z < SG.JUNGLE.z + 3 ? 'jungle' : 'main');
  G.inJungleBase = (x, z) => {
    if (!SG.D.jungleBase) return false;
    const r = SG.jbRect(SG.D.jbaseL);
    return x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ;
  };
  // Герой возрождается на базе того биома, где погиб (если там база уже построена), иначе — на основной
  G.respawn = function () {
    const p = G.p, b = p.deadIn || 'main';
    const ok = (b === 'fish' && SG.lv('fbase') > 0) || (b === 'jungle' && SG.D.jungleBase);
    const sp = ok ? SG.RESPAWN[b] : SG.SPAWN;
    p.ride = null; G.ship.boarded = false;
    p.hp = SG.D.maxHp; p.x = sp[0]; p.z = sp[1]; p.dead = false; p.deadIn = null;
  };
  function hurtPlayer(d) {
    const p = G.p, S = SG.S;
    if (p.ride) return; // в вагоне не достать
    p.hp -= d; p.hurt = 0.45; SG.hooks.sfx('hurt');
    SG.hooks.pop(p.x, p.z, '-' + Math.round(d), '#ff5a5a');
    SG.hooks.shake();
    if (p.hp <= 0 && !p.dead) {
      p.hp = 0; p.dead = true; p.deadIn = G.biomeAt(p.x, p.z); S.stats.deaths++; SG.hooks.sfx('death');
      // всё, что нёс, выпадает на землю — можно вернуться и подобрать; из денег выпадает четверть
      dropStack('wood', S.wood, p.x, p.z); dropStack('meat', S.meat, p.x, p.z); dropStack('gold', S.gold, p.x, p.z); dropStack('fish', S.fish, p.x, p.z); dropStack('banana', S.banana, p.x, p.z);
      const lostCash = Math.floor(S.cash * 0.25);
      dropStack('cash', lostCash, p.x, p.z);
      S.wood = S.meat = S.gold = S.fish = S.banana = 0; S.cash -= lostCash;
      SG.hooks.dead();
    }
  }
  function drop(x, z, n) {
    for (let i = 0; i < n && G.drops.length < 200; i++) {
      const a = rnd(0, 6.28), s = rnd(2, 6);
      G.drops.push({ type: 'meat', n: 1, x, z, vx: Math.cos(a) * s, vz: Math.sin(a) * s, age: 0, life: 120 });
    }
  }
  // Выпавший стак: делим на кучки (не больше 12 предметов на экране), в каждой n штук
  function dropStack(type, total, x, z) {
    total = Math.floor(total);
    if (total <= 0) return;
    const pieces = Math.min(total, 12);
    let left = total;
    for (let i = 0; i < pieces; i++) {
      const n = i === pieces - 1 ? left : Math.ceil(total / pieces);
      left -= n;
      const a = rnd(0, 6.28), s = rnd(2, 7);
      G.drops.push({ type, n, x, z, vx: Math.cos(a) * s, vz: Math.sin(a) * s, age: 0, life: 300 });
    }
  }
  function dealBear(b, dmg, byPlayer, by) {
    if (b.dead) return;
    b.hp -= dmg; b.hitT = 0.3; b.flash = 0.12;
    SG.hooks.sfx(b.kind === VERITE || b.kind === CURIO ? 'boing' : 'hit', b.x, b.z);
    if (b.kind === CURIO) b.fleeT = 4; // получив удар, убегает
    if (byPlayer) {
      SG.hooks.pop(b.x, b.z, '-' + SG.fmt(dmg), '#fff3b0');
      const p = G.p, dx = b.x - p.x, dz = b.z - p.z, l = hyp(dx, dz) || 1;
      b.x += dx / l * 0.5; b.z += dz / l * 0.5;
    }
    if (b.hp <= 0) {
      b.dead = true;
      const S = SG.S, K = KINDS[b.kind];
      S.stats.kills++;
      SG.hooks.sfx(b.kind === VERITE || b.kind === CURIO ? 'fanfare' : 'bearDie', b.x, b.z);
      if (b.kind === VERITE) {
        b.respawn = rnd(240, 420); S.stats.verite++;
        dropStack('gold', rint(25, 40), b.x, b.z);
        SG.hooks.banner('«' + SG.VERITE_NAME + '» повержен! Золото выпало — подбирай');
      } else if (b.kind === CURIO) {
        b.respawn = rnd(240, 420); S.stats.curio++;
        dropStack('banana', rint(K.loot[0], K.loot[1]), b.x, b.z);
        SG.hooks.banner('«' + SG.CURIO_NAME + '» повержен! Бананы выпали — подбирай');
      } else if (K.jungle) {
        b.respawn = 40; S.stats.monk++; b.hClaim = null;
        if (b.kind === GORILLA) S.stats.boss++;
        const n = rint(K.loot[0], K.loot[1]);
        if (by === 'hunter') { // добыча охотника сразу уходит на банановую лавку: подбирать не нужно
          S.stats.hmonk++; G.stalls.find(x => x.id === 'banana').st.stock += n;
          SG.hooks.pop(b.x, b.z, '+' + n + ' {banana}', '#ffe14d');
        } else {
          dropStack('banana', n, b.x, b.z);
          SG.hooks.pop(b.x, b.z, b.kind === GORILLA ? 'Горилла повержена!' : 'Победа!', '#ffd23f');
        }
      } else {
        b.respawn = 35;
        if (b.kind === 3) S.stats.boss++;
        drop(b.x, b.z, rint(K.meat[0], K.meat[1]));
        SG.hooks.pop(b.x, b.z, b.kind >= 2 ? 'Босс повержен!' : 'Победа!', '#ffd23f');
      }
    }
  }

  // ---------- обновление ----------
  G.update = function (dt, inp) {
    const S = SG.S, D = SG.D, p = G.p;
    G.t += dt; S.stats.time += dt;
    p.hurt = Math.max(0, p.hurt - dt);
    if (p.dead) G.onPad = null;

    if (!p.dead) {
      if (p.ride) rideStep(dt); else { movePlayer(dt, inp); updateFishMode(dt); }
      p.axeAng += D.spin * dt;
      if (!G.fishMode && !p.ride) attack(dt); // на пирсе, на корабле и в вагоне топоры убраны
      updateGuns(dt);
      // лечение
      let heal = D.regen;
      if (hyp(p.x - G.fire.x, p.z - G.fire.z) < 7) heal += D.heal;
      else if (inBase(p.x, p.z)) heal += 3;
      else if (G.inJungleBase(p.x, p.z)) heal += 3 + D.jbaseL;
      p.hp = Math.min(D.maxHp, p.hp + heal * dt);
      if (!p.ride) { doPads(dt); doStations(); doStalls(dt); }
      pickupDrops();
    } else G.guns.length = 0;
    G.axes.length = 0;
    for (let i = 0; !G.fishMode && !p.ride && i < D.axeCount; i++) {
      const a = p.axeAng + i * Math.PI * 2 / D.axeCount;
      G.axes.push({ a, x: p.x + Math.cos(a) * D.axeR, z: p.z + Math.sin(a) * D.axeR });
    }

    for (const t of G.trees) {
      if (t.hitT > 0) t.hitT -= dt;
      if (t.shake > 0) { t.shake -= dt; t.dirty = true; }
      if (t.hp <= 0 && !t.off) { t.respawn -= dt; if (t.respawn <= 0) { t.hp = t.max; t.dirty = true; } }
    }
    for (const t of G.palms) {
      if (t.hitT > 0) t.hitT -= dt;
      if (t.shake > 0) { t.shake -= dt; t.dirty = true; }
      if (t.hp <= 0) { t.respawn -= dt; if (t.respawn <= 0) { t.hp = t.max; t.ban = Math.random() < 0.06; t.dirty = true; } } // отросла — иногда сразу с бананами
    }
    for (const g of G.giants) {
      if (g.hitT > 0) g.hitT -= dt;
      if (g.shake > 0) { g.shake -= dt; g.dirty = true; }
    }
    for (const o of G.ores) {
      if (o.hitT > 0) o.hitT -= dt;
      if (o.shake > 0) { o.shake -= dt; o.dirty = true; }
      if (o.hp <= 0) { o.respawn -= dt; if (o.respawn <= 0) { o.hp = o.max; o.dirty = true; } }
    }
    updateBears(dt); updateSadMob(dt); updateGunShots(dt); updateWorkers(dt); updateHunters(dt); updateCollectors(dt); updateMiners(dt); updateFishers(dt); updateSea(dt); updateCustomers(dt); updateTurrets(dt); updateShots(dt); updateDrops(dt);
  };

  const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
  function movePlayer(dt, inp) {
    const p = G.p, D = SG.D, sh = G.ship;
    let mx = inp.mx, mz = inp.mz;
    const l = hyp(mx, mz);
    if (l > 1) { mx /= l; mz /= l; }
    if (sh.boarded) { moveShip(dt, mx, mz, l); return; }
    p.walk = l > 0.08;
    if (p.walk) {
      const nx = p.x + mx * D.speed * dt, nz = p.z + mz * D.speed * dt;
      // упёрся в воду рядом со своим кораблём — садимся «на ходу»: корабль сразу оказывается под ногами
      if (D.shipOwned && (inWater(nx, p.z) || inWater(p.x, nz)) && hyp(sh.x - p.x, sh.z - p.z) < SG.SHIP.boardR) {
        if (inWater(nx, p.z)) p.x = nx;
        if (inWater(p.x, nz)) p.z = nz;
        sh.boarded = true; sh.x = p.x; sh.z = p.z; sh.rot = sh.rotT = Math.atan2(mx, mz); p.face = sh.rot; p.walk = false;
        SG.hooks.sfx('splash', p.x, p.z);
        return;
      }
      if (!fenceBlocked(nx, p.z) && !worldBlocked(nx, p.z)) p.x = nx;
      if (!fenceBlocked(p.x, nz) && !worldBlocked(p.x, nz)) p.z = nz;
      p.face = Math.atan2(mx, mz);
    }
    p.z = clamp(p.z, SG.JUNGLE.zMin + 2, SG.HALF - 2);
    p.x = clamp(p.x, -SG.HALF + 2, p.z < -SG.HALF ? SG.WALL_X - 4 : SG.HALF - 2); // севернее старого края мира востока нет
  }
  // Корабль плывёт только по озеру. Как только следующий шаг выводит из воды в пределах мира — игрок сходит на берег,
  // а корабль остаётся у кромки там, где пристали.
  function moveShip(dt, mx, mz, l) {
    const p = G.p, D = SG.D, sh = G.ship;
    p.walk = false;
    if (l > 0.08) {
      sh.rotT = Math.atan2(mx, mz); p.face = sh.rotT;
      const nx = p.x + mx * D.shipSpeed * dt, nz = p.z + mz * D.shipSpeed * dt;
      if (inWater(nx, nz)) { p.x = nx; p.z = nz; }
      else if (nx <= SG.HALF - 3 && Math.abs(nz) <= SG.HALF - 3 && !fenceBlocked(nx, nz) && !giantBlocked(nx, nz)) {
        const dx = p.x - nx, dz = p.z - nz, d = hyp(dx, dz) || 1;
        let sx = p.x + dx / d * 2.5, sz = p.z + dz / d * 2.5; // чуть глубже в воду, чтобы корабль не торчал на берегу
        if (!inWater(sx, sz)) { sx = p.x; sz = p.z; }
        sh.x = sx; sh.z = sz; sh.boarded = false; p.x = nx; p.z = nz;
        return;
      } else { // дальше берега нет (край мира): скользим вдоль невидимой границы
        if (inWater(nx, p.z)) p.x = nx;
        if (inWater(p.x, nz)) p.z = nz;
      }
    }
    sh.x = p.x; sh.z = p.z;
  }

  function attack(dt) {
    const S = SG.S, D = SG.D, p = G.p;
    const R = D.axeR, reach = R + 3;
    const tip = [];
    for (let i = 0; i < D.axeCount; i++) {
      const a = p.axeAng + i * Math.PI * 2 / D.axeCount;
      tip.push([p.x + Math.cos(a) * R, p.z + Math.sin(a) * R]);
    }
    const hit = (x, z, rad) => {
      const r2 = rad * rad;
      for (const t of tip) if (segDist2(x, z, p.x, p.z, t[0], t[1]) < r2) return true;
      return false;
    };
    const room = () => Infinity; // рюкзака нет: носить можно сколько угодно

    // деревья
    if (room() >= 1) {
      for (const t of G.trees) {
        if (t.off || t.hp <= 0 || t.hitT > 0) continue;
        const dx = t.x - p.x, dz = t.z - p.z;
        if (dx * dx + dz * dz > reach * reach) continue;
        if (!hit(t.x, t.z, 1.1)) continue;
        t.hp -= D.axeDmg; t.hitT = 0.28; t.shake = 0.25; t.dirty = true; p.swing = 1;
        SG.hooks.sfx('chop', t.x, t.z);
        if (t.hp <= 0) {
          t.respawn = 18; S.stats.trees++; SG.hooks.sfx('treefall', t.x, t.z);
          const n = Math.min(D.treeWood, room());
          S.wood += n;
          SG.hooks.pop(t.x, t.z, '+' + n + ' {log}', '#ffe9b0');
        }
        if (room() < 1) break;
      }
    }
    // пальмы джунглей: обычное дерево, а с банановых ещё и бананы
    if (p.z < SG.JUNGLE.z + 12) {
      for (const t of G.palms) {
        if (t.hp <= 0 || t.hitT > 0) continue;
        const dx = t.x - p.x, dz = t.z - p.z;
        if (dx * dx + dz * dz > reach * reach) continue;
        if (!hit(t.x, t.z, 1.0)) continue;
        t.hp -= D.axeDmg; t.hitT = 0.28; t.shake = 0.25; t.dirty = true; p.swing = 1;
        SG.hooks.sfx('chop', t.x, t.z);
        if (t.hp <= 0) {
          t.respawn = 20; S.stats.palms++; SG.hooks.sfx('treefall', t.x, t.z);
          S.wood += D.treeWood;
          SG.hooks.pop(t.x, t.z, '+' + D.treeWood + ' {log}', '#ffe9b0');
          if (t.ban) { t.ban = false; dropStack('banana', rint(2, 4), t.x, t.z); }
        }
      }
    }
    // гигантские деревья: восточные (топор «ур. 25») и северные тропические (топор «ур. 28»)
    if (p.x > SG.WALL_X - 10 || p.z < SG.JUNGLE.z + 10) {
      for (const g of G.giants) {
        if (g.hp <= 0 || g.hitT > 0) continue;
        const dx = g.x - p.x, dz = g.z - p.z;
        if (dx * dx + dz * dz > (reach + 2) * (reach + 2)) continue;
        if (!hit(g.x, g.z, 2.1)) continue;
        g.hitT = 0.28;
        const need = g.jg ? SG.JUNGLE_NEED_LVL : SG.GIANT_NEED_LVL;
        if (D.axeLvl < need) {
          g.shake = 0.1; g.dirty = true; SG.hooks.sfx('clank', g.x, g.z);
          if (!G.giantWarnT || G.t - G.giantWarnT > 3) { G.giantWarnT = G.t; SG.hooks.pop(g.x, g.z, 'Нужен топор ур. ' + (need + 1), '#ff9d9d'); }
          continue;
        }
        g.hp -= D.axeDmg; g.shake = 0.3; g.dirty = true; p.swing = 1; SG.hooks.sfx('chop', g.x, g.z);
        if (g.hp <= 0) {
          S.stats.giants++; SG.hooks.sfx('treefall', g.x, g.z);
          if (!S.cut.includes(g.i)) S.cut.push(g.i); // пенёк остаётся и после перезагрузки
          const n = D.treeWood * 6; S.wood += n; // гигант даёт много дерева — оно нужно на постройки
          SG.hooks.pop(g.x, g.z, '+' + n + ' {log}', '#ffe9b0');
        }
      }
    }
    // золотая руда (нужен топор не слабее 4-го уровня)
    for (const o of G.ores) {
      if (o.hp <= 0 || o.hitT > 0) continue;
      const dx = o.x - p.x, dz = o.z - p.z;
      if (dx * dx + dz * dz > reach * reach) continue;
      if (!hit(o.x, o.z, 1.6)) continue;
      o.hitT = 0.3;
      if (D.axeLvl < ORE_NEED_LVL) {
        o.shake = 0.1; o.dirty = true; SG.hooks.sfx('clank', o.x, o.z);
        if (!G.oreWarnT || G.t - G.oreWarnT > 3) { G.oreWarnT = G.t; SG.hooks.pop(o.x, o.z, 'Нужен топор ур. ' + (ORE_NEED_LVL + 1), '#ff9d9d'); }
        continue;
      }
      if (room() < 1) continue;
      o.hp -= D.axeDmg; o.shake = 0.25; o.dirty = true; p.swing = 1; SG.hooks.sfx('pick', o.x, o.z);
      if (o.hp <= 0) {
        o.respawn = 45; S.stats.ores++; SG.hooks.sfx('ore', o.x, o.z);
        const n = Math.min(D.oreYield, room());
        S.gold += n;
        SG.hooks.pop(o.x, o.z, '+' + n + ' {gold}', '#ffe27a');
      }
    }
    // медведи
    for (const b of G.bears) {
      if (b.dead || b.hitT > 0) continue;
      const dx = b.x - p.x, dz = b.z - p.z;
      if (dx * dx + dz * dz > (reach + 3) * (reach + 3)) continue;
      if (!hit(b.x, b.z, 1.0 + 0.6 * KINDS[b.kind].scale)) continue;
      p.swing = 1;
      dealBear(b, D.axeDmg, true);
      b.aggro = true;
    }
    p.swing = Math.max(0, p.swing - dt * 3);
  }

  function pickupDrops() {
    // подбор мяса — в updateDrops (там же магнит)
  }

  // Деньги начинают уходить на плитку не сразу: чтобы можно было пробежать по базе и ничего не потратить.
  // Плитка 3 м шириной (хитбокс ±1,6 м), минимальная скорость героя 9 м/с → пересечь её насквозь
  // можно за ~0,36 с. Берём 0,55 с с запасом.
  const PAD_DWELL = 0.55;
  function doPads(dt) {
    const S = SG.S, p = G.p;
    G.onPad = null;
    for (const pad of G.pads) {
      if (!G.padVisible(pad)) continue;
      if (Math.abs(p.x - pad.x) > 1.6 || Math.abs(p.z - pad.z) > 1.6) continue;
      G.onPad = pad;
      if (G.padId !== pad.id) { G.padId = pad.id; G.padT = 0; }
      else G.padT += dt;
      if (G.padT < PAD_DWELL || S.cash <= 0 || G.padMaxed(pad)) break;
      if (S.wood < G.padWood(pad)) break; // не хватает дерева — деньги не списываем
      const c = G.padCost(pad), prog = S.prog[pad.id] || 0;
      const pay = Math.min(S.cash, Math.max(1, Math.ceil(c * dt * 1.5)), c - prog);
      if (pay <= 0) break;
      S.cash -= pay; S.stats.spent += pay;
      S.prog[pad.id] = prog + pay;
      SG.hooks.sfx('pay', null, null, (prog + pay) / c);
      if (S.prog[pad.id] >= c) { S.prog[pad.id] = 0; buy(pad); }
      break; // платим только на одной плитке за кадр
    }
    if (!G.onPad) { G.padId = null; G.padT = 0; }
  }

  G.onStall = st => !G.p.dead && Math.abs(G.p.x - st.pad.x) < 1.6 && Math.abs(G.p.z - st.pad.z) < 1.2;
  function doStalls(dt) {
    const S = SG.S, p = G.p;
    for (const st of G.stalls) {
      // выкладываем товар на лавку
      if (st.unlocked && G.onStall(st)) {
        const rk = st.res || st.id, n = S[rk]; // дерево/бананы джунглевых лавок берутся из своего ресурса
        if (n > 0) {
          st.acc = (st.acc || 0) + dt * Math.max(16, n * 2);
          const k = Math.min(Math.floor(st.acc), n);
          if (k > 0) { st.acc -= k; S[rk] -= k; st.st.stock += k; SG.hooks.sfx('put'); }
        }
      }
      // собираем выручку
      if (st.st.cash > 0 && hyp(p.x - st.cash.x, p.z - st.cash.z) < 1.9) {
        const c = Math.floor(st.st.cash);
        S.cash += c; S.earned = (S.earned || 0) + c; st.st.cash = 0;
        SG.hooks.pop(st.cash.x, st.cash.z, '+' + SG.fmt(c) + '$', '#9dffa0'); SG.hooks.sfx('cash');
      }
    }
  }

  const DROP_ICON = { wood: '{log}', meat: '{meat}', gold: '{gold}', cash: '$', fish: '{fish}', banana: '{banana}' };
  function updateDrops(dt) {
    const S = SG.S, D = SG.D, p = G.p;
    for (let i = G.drops.length - 1; i >= 0; i--) {
      const m = G.drops[i];
      m.age += dt; m.x += m.vx * dt; m.z += m.vz * dt; m.vx *= 0.92; m.vz *= 0.92;
      if (!p.dead && m.age > 0.5) {
        const room = 1e9;
        if (room >= 1) {
          const d = hyp(p.x - m.x, p.z - m.z);
          // На корабле добыча улетает назад быстрее, чем плывёт судно: дальность и скорость притяжения растут
          // вместе с прокачкой «Скорости корабля» (иначе приходится останавливаться и ждать рыбу).
          const boat = G.ship.boarded, rng = boat ? D.magnet + D.shipSpeed * 0.6 : D.magnet, pull = boat ? Math.max(16, D.shipSpeed * 2.4) : 16;
          if (d < rng && d > 0.001) { const st = Math.min(d, pull * dt); m.x += (p.x - m.x) / d * st; m.z += (p.z - m.z) / d * st; }
          if (d < (boat ? 1.8 : 1.1)) {
            const k = Math.min(m.n, room);
            S[m.type === 'cash' ? 'cash' : m.type] += k; m.n -= k;
            if (m.type === 'banana') S.stats.banana += k;
            SG.hooks.pop(p.x, p.z, '+' + SG.fmt(k) + ' ' + DROP_ICON[m.type], '#ffe9c0');
            SG.hooks.sfx({ wood: 'pickWood', meat: 'pickMeat', gold: 'pickGold', cash: 'pickCash', fish: 'pickMeat', banana: 'pickMeat' }[m.type]);
            if (m.n <= 0) { G.drops.splice(i, 1); continue; }
          }
        }
      }
      if (m.age > m.life) G.drops.splice(i, 1);
    }
  }

  // на базу звери не заходят: выталкиваем к ближайшей стороне
  function keepOutOfBase(b) {
    if (!inBase(b.x, b.z, 2)) return;
    const bd = G.bounds, m = 2.2;
    const dl = b.x - (bd.minX - m), dr = (bd.maxX + m) - b.x, dn = b.z - (bd.minZ - m), ds = (bd.maxZ + m) - b.z;
    const mn = Math.min(dl, dr, dn, ds);
    if (mn === dl) b.x = bd.minX - m; else if (mn === dr) b.x = bd.maxX + m; else if (mn === dn) b.z = bd.minZ - m; else b.z = bd.maxZ + m;
    b.wx = b.x; b.wz = b.z;
  }

  // «Верите»: убегает от игрока, у края мира сворачивает к центру, через ~200 с исчезает сам
  function updateVerite(b, dt) {
    const p = G.p, K = KINDS[VERITE];
    b.hitT = Math.max(0, b.hitT - dt); b.flash = Math.max(0, b.flash - dt);
    b.life -= dt;
    if (b.life <= 0) { b.dead = true; b.respawn = rnd(150, 300); SG.hooks.banner('«' + SG.VERITE_NAME + '» скрылся из виду...'); return; }
    const dx = b.x - p.x, dz = b.z - p.z, d = hyp(dx, dz) || 1;
    let mx = 0, mz = 0, sp = 0;
    if (!p.dead && d < 12) {
      mx = dx / d; mz = dz / d; sp = K.spd;
      const lim = SG.HALF - 10;
      if (Math.abs(b.x) > lim || Math.abs(b.z) > lim) {
        const cl = hyp(b.x, b.z) || 1;
        mx = mx * 0.35 - b.x / cl * 0.9; mz = mz * 0.35 - b.z / cl * 0.9;
        const l = hyp(mx, mz) || 1; mx /= l; mz /= l;
      }
    } else {
      b.wt -= dt;
      if (b.wt <= 0) { b.wt = rnd(2, 5); b.wx = clamp(b.x + rnd(-10, 10), -SG.HALF + 8, SG.HALF - 8); b.wz = clamp(b.z + rnd(-10, 10), (KINDS[b.kind].jungle ? SG.JUNGLE.zMin : -SG.HALF) + 8, SG.HALF - 8); }
      const ddx = b.wx - b.x, ddz = b.wz - b.z, dd = hyp(ddx, ddz);
      if (dd > 0.5) { mx = ddx / dd; mz = ddz / dd; sp = 2.5; }
    }
    b.moving = sp > 0;
    if (b.moving) { b.x += mx * sp * dt; b.z += mz * sp * dt; b.face = Math.atan2(mx, mz); }
    b.x = clamp(b.x, -SG.HALF + 3, Math.min(SG.HALF - 3, SG.WALL_X - 6)); b.z = clamp(b.z, SG.JUNGLE.z + 8, SG.HALF - 3);
    keepOutOfBase(b);
  }

  // Звери остаются в своих биомах: джунглевые — севернее стены (и не лезут на поляну базы), остальные — южнее неё
  function confine(b) {
    const J = SG.JUNGLE;
    if (KINDS[b.kind].jungle) {
      b.x = clamp(b.x, -SG.HALF + 3, J.x1 - 2); b.z = clamp(b.z, J.zMin + 3, J.z - 8);
      if (inJClearing(b.x, b.z, 4)) { // база и её будущая ограда — безопасная зона: выталкиваем к ближайшему краю (на север или вбок)
        const dl = b.x - (JR4.minX - 4), dr = (JR4.maxX + 4) - b.x, dn = b.z - (JR4.minZ - 4), m = Math.min(dl, dr, dn);
        if (m === dn) { b.z = JR4.minZ - 4; b.wz = b.z; } else if (m === dl) { b.x = JR4.minX - 4; b.wx = b.x; } else { b.x = JR4.maxX + 4; b.wx = b.x; }
      }
    } else {
      if (b.x > SG.WALL_X - 6) b.x = b.wx = SG.WALL_X - 6;
      if (b.z < J.z + 8) b.z = b.wz = J.z + 8;
    }
  }
  // «Любопытстити»: сам подходит к игроку, кружит рядом; после удара убегает
  function updateCurio(b, dt) {
    const p = G.p, K = KINDS[CURIO];
    b.hitT = Math.max(0, b.hitT - dt); b.flash = Math.max(0, b.flash - dt); b.fleeT = Math.max(0, (b.fleeT || 0) - dt);
    b.life -= dt;
    if (b.life <= 0) { b.dead = true; b.respawn = rnd(150, 300); SG.hooks.banner('«' + SG.CURIO_NAME + '» ушёл в чащу...'); return; }
    const dx = p.x - b.x, dz = p.z - b.z, d = hyp(dx, dz) || 1;
    let mx = 0, mz = 0, sp = 0;
    if (!p.dead && !p.ride && d < 60) {
      if (b.fleeT > 0) { mx = -dx / d; mz = -dz / d; sp = K.spd; }
      else if (d > 7) { mx = dx / d; mz = dz / d; sp = K.spd * 0.7; }
      else { mx = -dz / d; mz = dx / d; sp = 3; } // подошёл — ходит вокруг, разглядывает
    } else {
      b.wt -= dt;
      if (b.wt <= 0) { b.wt = rnd(2, 5); b.wx = b.x + rnd(-12, 12); b.wz = b.z + rnd(-12, 12); }
      const ddx = b.wx - b.x, ddz = b.wz - b.z, dd = hyp(ddx, ddz);
      if (dd > 0.5) { mx = ddx / dd; mz = ddz / dd; sp = 2.5; }
    }
    b.moving = sp > 0;
    if (b.moving) { b.x += mx * sp * dt; b.z += mz * sp * dt; }
    confine(b);
  }

  // ---------- дробовики ----------
  // Кружат вокруг героя, как топоры (но по внутреннему кольцу), и сами стреляют по ближайшему мобу в радиусе.
  function updateGuns(dt) {
    const D = SG.D, p = G.p;
    G.guns.length = 0;
    if (!D.gunOwned || G.fishMode || p.ride || p.dead) return;
    let best = null, bd = D.gunRange * D.gunRange;
    for (const b of G.bears) {
      if (b.dead) continue;
      const d = (b.x - p.x) ** 2 + (b.z - p.z) ** 2;
      if (d < bd) { bd = d; best = b; }
    }
    const n = D.gunCount;
    for (let i = 0; i < n; i++) {
      const a = p.axeAng * 0.7 + i * Math.PI * 2 / n;
      const x = p.x + Math.cos(a) * 1.7, z = p.z + Math.sin(a) * 1.7;
      const aim = best ? Math.atan2(best.z - z, best.x - x) : a;
      G.gunCd[i] = (G.gunCd[i] || 0) - dt; G.gunFl[i] = Math.max(0, (G.gunFl[i] || 0) - dt);
      if (best && G.gunCd[i] <= 0 && G.gshots.length < 60) {
        G.gunCd[i] = D.gunInt * rnd(0.9, 1.1); G.gunFl[i] = 0.1;
        SG.hooks.sfx('gun', x, z);
        // три дробины: урон считает первая, остальные — для вида
        for (let k = 0; k < 3; k++) G.gshots.push({ x, y: 1.2, z, tgt: best, dmg: k === 0 ? D.gunDmg : 0, ox: rnd(-0.6, 0.6), oz: rnd(-0.6, 0.6) });
      }
      G.guns.push({ x, z, aim, flash: G.gunFl[i] });
    }
  }
  function updateGunShots(dt) {
    for (let i = G.gshots.length - 1; i >= 0; i--) {
      const s = G.gshots[i], b = s.tgt;
      if (b.dead) { G.gshots.splice(i, 1); continue; }
      const dx = b.x + s.ox - s.x, dz = b.z + s.oz - s.z, d = hyp(dx, dz), step = 70 * dt;
      if (d < step + 0.8) { if (s.dmg > 0) dealBear(b, s.dmg, true); G.gshots.splice(i, 1); continue; }
      s.x += dx / d * step; s.z += dz / d * step;
    }
  }

  // ---------- железная дорога ----------
  // Станция под ногами: «взведена», пока игрок не отменил выбор или не уехал. Выбор (интерфейс) начинается,
  // когда игрок отпустил джойстик и нажал снова, стоя на взведённой станции.
  function doStations() {
    const p = G.p;
    let on = null;
    for (const st of G.stations) if (st.ok() && Math.abs(p.x - st.x) < 1.6 && Math.abs(p.z - st.z) < 1.6) on = st;
    if (on !== G.onStation) { G.onStation = on; G.stArmed = !!on; }
  }
  G.railTargets = () => G.stations.filter(s => s !== G.onStation && s.ok());
  G.startRide = function (destId) {
    const p = G.p, from = G.onStation, to = G.stations.find(s => s.id === destId), lvl = SG.D.railLvl;
    if (!from || !to || to === from || !to.ok() || p.dead || p.ride || lvl < 1) return false;
    const dist = hyp(to.land[0] - p.x, to.land[1] - p.z);
    p.ride = { t: 0, dur: Math.max(0.8, dist / SG.RAIL.speed[lvl - 1]), x0: p.x, z0: p.z, x1: to.land[0], z1: to.land[1], lvl };
    G.onStation = null; G.stArmed = false;
    SG.S.stats.rides++;
    SG.hooks.sfx('rail'); SG.hooks.ride(lvl, true);
    return true;
  };
  function rideStep(dt) {
    const p = G.p, r = p.ride;
    r.t += dt;
    const u = Math.min(1, r.t / r.dur), e = u * u * (3 - 2 * u);
    p.walk = false;
    p.face = Math.atan2(r.x1 - r.x0, r.z1 - r.z0);
    p.x = r.x0 + (r.x1 - r.x0) * e; p.z = r.z0 + (r.z1 - r.z0) * e;
    if (u >= 1) { p.ride = null; p.x = r.x1; p.z = r.z1; SG.hooks.ride(r.lvl, false); }
  }

  // ---------- «Грустити» ----------
  // Редкий моб моря: плавает, периодически ныряет (тогда его не видно и не достать) и всплывает рядом.
  // Бьётся только гарпуном с корабля. Награда — рыба.
  function spawnSad(f) {
    Object.assign(f, { x: rnd(SG.LAKE.x + 30, SG.LAKE.x + 120), z: rnd(SG.LAKE.z0 + 15, SG.LAKE.z1 - 15), hp: SAD_HP, max: SAD_HP, dead: false, under: false, t: rnd(4, 7), life: 170, flash: 0, a: rnd(0, 6.28) });
    SG.hooks.sfx('jingle');
    SG.hooks.banner('Редкий моб «' + SG.SAD_NAME + '» всплыл в море! Достань гарпуном — выпадет рыба');
  }
  function updateSadMob(dt) {
    const f = G.sad, L = SG.LAKE;
    f.flash = Math.max(0, f.flash - dt);
    if (f.dead) {
      f.respawn -= dt;
      if (f.respawn <= 0) { if (SG.D.shipOwned) spawnSad(f); else f.respawn = 30; }
      return;
    }
    f.life -= dt;
    if (f.life <= 0) { f.dead = true; f.respawn = rnd(150, 300); SG.hooks.banner('«' + SG.SAD_NAME + '» уплыл на глубину...'); return; }
    f.t -= dt;
    if (f.t <= 0) {
      SG.hooks.sfx('splash', f.x, f.z);
      if (!f.under) { f.under = true; f.t = 2.2; }
      else {
        f.under = false; f.t = rnd(5, 8);
        const a = rnd(0, 6.28), r = rnd(10, 26);
        f.x = clamp(f.x + Math.cos(a) * r, L.x + 8, SG.SEA.x1 - 20); f.z = clamp(f.z + Math.sin(a) * r, L.z0 + 8, L.z1 - 8);
      }
    }
    if (!f.under) {
      f.x += Math.sin(f.a) * 1.4 * dt; f.z += Math.cos(f.a) * 1.4 * dt;
      if (f.x < L.x + 8 || f.x > SG.SEA.x1 - 20 || f.z < L.z0 + 8 || f.z > L.z1 - 8) f.a += Math.PI; // у края разворачивается
    }
  }
  function killSad(f) {
    f.dead = true; f.respawn = rnd(240, 420); SG.S.stats.grust++;
    dropStack('fish', rint(80, 140), f.x, f.z);
    SG.hooks.sfx('fanfare', f.x, f.z);
    SG.hooks.banner('«' + SG.SAD_NAME + '» повержен! Рыба всплыла — подбирай');
  }

  function updateBears(dt) {
    const p = G.p;
    for (const b of G.bears) {
      if (b.dead) { b.respawn -= dt; if (b.respawn <= 0) spawnBear(b, b.kind); continue; }
      if (b.kind === VERITE) { updateVerite(b, dt); continue; }
      if (b.kind === CURIO) { if (!SG.D.jungleBase) { b.dead = true; b.respawn = 30; continue; } updateCurio(b, dt); continue; }
      const K = KINDS[b.kind];
      b.cd -= dt; b.atk = Math.max(0, b.atk - dt); b.flash = Math.max(0, b.flash - dt); b.hitT = Math.max(0, b.hitT - dt);
      const dx = p.x - b.x, dz = p.z - b.z, d = hyp(dx, dz);
      b.aggro = !p.dead && !p.ride && d < K.aggro && !inBase(p.x, p.z, 0.5);
      let tx, tz, sp;
      const reach = 2.2 + 0.7 * K.scale;
      if (b.aggro) {
        tx = p.x; tz = p.z; sp = d > reach ? K.spd : 0;
        if (d < reach + 0.7 && b.cd <= 0) { b.cd = 1.2; b.atk = 0.35; hurtPlayer(rnd(K.dmg[0], K.dmg[1])); }
      } else {
        b.wt -= dt;
        if (b.wt <= 0) { b.wt = rnd(2, 5); b.wx = clamp(b.x + rnd(-14, 14), -SG.HALF + 3, SG.HALF - 3); b.wz = clamp(b.z + rnd(-14, 14), -SG.HALF + 3, SG.HALF - 3); }
        tx = b.wx; tz = b.wz; sp = 2.2;
      }
      const ddx = tx - b.x, ddz = tz - b.z, dd = hyp(ddx, ddz);
      b.moving = dd > 0.5 && sp > 0;
      if (b.moving) { b.x += ddx / dd * sp * dt; b.z += ddz / dd * sp * dt; b.face = Math.atan2(ddx, ddz); }
      else if (b.aggro) b.face = Math.atan2(dx, dz);
      keepOutOfBase(b);
      confine(b);
    }
  }

  function updateWorkers(dt) {
    const D = SG.D, ws = D.wSpeed, wood = G.stalls[0];
    for (const w of G.workers) {
      w.swing = Math.max(0, w.swing - dt * 2);
      w.walk = false;
      const go = (tx, tz, sp) => walkTo(w, tx, tz, sp, dt);
      const speed = 4.5 + ws * 0.8;
      if (w.state === 'seek') {
        let best = null, bd = 1e9;
        for (const t of G.trees) {
          if (t.off || t.hp <= 0 || t.claim) continue;
          const d = (t.x - w.x) ** 2 + (t.z - w.z) ** 2;
          if (d < bd) { bd = d; best = t; }
        }
        if (best) { best.claim = w; w.tree = best; w.state = 'go'; }
      } else if (w.state === 'go') {
        const t = w.tree;
        if (!t || t.off || t.hp <= 0) { if (t) t.claim = null; w.tree = null; w.state = 'seek'; continue; }
        if (go(t.x, t.z, speed) < 1.5) { w.state = 'chop'; w.t = 0; }
      } else if (w.state === 'chop') {
        const t = w.tree;
        if (!t || t.off || t.hp <= 0) { if (t) t.claim = null; w.tree = null; w.state = 'seek'; continue; }
        w.t += dt;
        if (w.t >= 0.7 / ws) {
          w.t = 0; w.swing = 1; t.hp -= 14; t.shake = 0.25; t.dirty = true; SG.hooks.sfx('wchop', t.x, t.z);
          if (t.hp <= 0) { t.respawn = 18; SG.S.stats.wtrees++; t.claim = null; w.tree = null; w.carry = D.wYield; w.state = 'deliver'; }
        }
      } else if (w.state === 'deliver') {
        if (go(wood.pad.x, wood.pad.z + 1.2, speed) < 1.2) {
          wood.st.stock += w.carry; w.carry = 0; w.state = 'seek';
        }
      }
    }
  }

  // Охотники джунглей: бегут к ближайшей обезьяне и рубят её мачете. Бананы с убитой сразу идут на банановую лавку.
  // Горилл и «Любопытстити» не трогают — это добыча игрока. Охотников обезьяны не атакуют.
  function updateHunters(dt) {
    const D = SG.D, spd = 7 + 0.15 * SG.lv('jhdmg');
    for (const h of G.hunters) {
      h.swing = Math.max(0, h.swing - dt * 3); h.walk = false;
      if (h.state === 'seek') {
        let best = null, bd = 1e9;
        for (const b of G.bears) {
          if (b.kind !== MONKEY || b.dead || (b.hClaim && b.hClaim !== h && G.hunters.includes(b.hClaim))) continue;
          const d = (b.x - h.x) ** 2 + (b.z - h.z) ** 2;
          if (d < bd) { bd = d; best = b; }
        }
        if (best) { best.hClaim = h; h.tgt = best; h.state = 'go'; h.t = 0; }
        else walkTo(h, 2 + (G.hunters.indexOf(h) % 5) * 1.4, SG.JB.z0 - 2.5, spd, dt); // обезьян нет — ждёт у базы
      } else {
        const b = h.tgt;
        if (!b || b.dead) { if (b && b.hClaim === h) b.hClaim = null; h.tgt = null; h.state = 'seek'; continue; }
        const d = hyp(b.x - h.x, b.z - h.z);
        if (d > 2.0) { walkTo(h, b.x, b.z, spd, dt); continue; }
        h.face = Math.atan2(b.x - h.x, b.z - h.z);
        h.t += dt;
        if (h.t >= 0.75) { h.t = 0; h.swing = 1; dealBear(b, D.mDmg, false, 'hunter'); }
      }
    }
  }

  // Сборщики мяса: бегают за мясом, выпавшим вокруг базы, и сносят его на мясную лавку.
  // Дальше этого расстояния от базы не ходят — в дикие земли к мобам они не лезут.
  // Дальность обзора и вместимость корзины — из прокачки (D.cRange, D.cCarry), скорость умножается на D.cSpeed
  function updateCollectors(dt) {
    const D = SG.D, meat = G.stalls[1], ws = D.wSpeed, speed = (4.8 + ws * 0.8) * D.cSpeed;
    const b = G.bounds, cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    for (const c of G.collectors) {
      c.walk = false;
      const go = (tx, tz) => walkTo(c, tx, tz, speed, dt);
      if (c.state === 'seek') {
        let best = null, bd = 1e9;
        if (c.carry < D.cCarry) {
          for (const m of G.drops) {
            if (m.type !== 'meat' || m.age < 0.6 || (m.claim && m.claim !== c && G.collectors.includes(m.claim))) continue;
            if (Math.abs(m.x - cx) > D.cRange || Math.abs(m.z - cz) > D.cRange) continue;
            const d = (m.x - c.x) ** 2 + (m.z - c.z) ** 2;
            if (d < bd) { bd = d; best = m; }
          }
        }
        if (best) { best.claim = c; c.target = best; c.state = 'go'; }
        else if (c.carry > 0) c.state = 'deliver';
        else go(meat.pad.x + (G.collectors.indexOf(c) % 3 - 1) * 1.6, meat.pad.z - 3.2); // ждёт у мясной лавки
      } else if (c.state === 'go') {
        const m = c.target;
        if (!m || !G.drops.includes(m)) { c.target = null; c.state = 'seek'; continue; }
        if (go(m.x, m.z) < 1.0) {
          c.carry += m.n; SG.S.stats.cmeat += m.n;
          G.drops.splice(G.drops.indexOf(m), 1);
          SG.hooks.sfx('pickMeat', c.x, c.z);
          c.target = null; c.state = 'seek';
        }
      } else if (c.state === 'deliver') {
        if (go(meat.pad.x, meat.pad.z + 1.2) < 1.2) { meat.st.stock += c.carry; c.carry = 0; c.state = 'seek'; SG.hooks.sfx('put', c.x, c.z); }
      }
    }
  }

  // Золотоискатели: сами идут к свободной золотой руде, бьют её киркой и носят слитки на золотую лавку.
  // Сколько слитков падает с руды — решает улучшение «Руда» (D.oreYield), общее с героем.
  // Руды всего 9 и каждая восстанавливается 45 с, поэтому это естественный потолок добычи: больше ~5 искателей почти не растят доход.
  const MINER_DMG = 30, MINER_SWING = 0.9;
  function updateMiners(dt) {
    const D = SG.D, S = SG.S, gold = G.stalls[2], ws = D.wSpeed, speed = 5 + ws * 0.8;
    for (const m of G.miners) {
      m.swing = Math.max(0, m.swing - dt * 2);
      m.walk = false;
      const go = (tx, tz) => walkTo(m, tx, tz, speed, dt);
      const release = () => { if (m.ore && m.ore.claim === m) m.ore.claim = null; m.ore = null; };
      if (m.state === 'seek') {
        let best = null, bd = 1e9;
        for (const o of G.ores) {
          if (o.hp <= 0 || (o.claim && o.claim !== m)) continue;
          const d = (o.x - m.x) ** 2 + (o.z - m.z) ** 2;
          if (d < bd) { bd = d; best = o; }
        }
        if (best) { best.claim = m; m.ore = best; m.state = 'go'; }
        else go(gold.pad.x + (G.miners.indexOf(m) % 3 - 1) * 1.6, gold.pad.z - 3.2); // свободной руды нет — ждёт у лавки
      } else if (m.state === 'go') {
        const o = m.ore;
        if (!o || o.hp <= 0) { release(); m.state = 'seek'; continue; }
        if (go(o.x, o.z) < 2.0) { m.state = 'mine'; m.t = 0; }
      } else if (m.state === 'mine') {
        const o = m.ore;
        if (!o || o.hp <= 0) { release(); m.state = 'seek'; continue; } // руду успел добыть герой
        m.t += dt;
        if (m.t >= MINER_SWING / ws) {
          m.t = 0; m.swing = 1; o.hp -= MINER_DMG; o.shake = 0.25; o.dirty = true; SG.hooks.sfx('pick', o.x, o.z);
          if (o.hp <= 0) {
            o.respawn = 45; S.stats.ores++; SG.hooks.sfx('ore', o.x, o.z);
            release(); m.carry = D.oreYield; m.state = 'deliver';
          }
        }
      } else if (m.state === 'deliver') {
        if (go(gold.pad.x, gold.pad.z + 1.2) < 1.2) {
          gold.st.stock += m.carry; S.stats.mgold += m.carry; m.carry = 0; m.state = 'seek'; SG.hooks.sfx('put', m.x, m.z);
        }
      }
    }
  }

  function updateCustomers(dt) {
    const D = SG.D;
    G.custT -= dt; G.custTF -= dt; G.custTJ -= dt;
    // покупатели основной базы, рыбного берега и джунглей приходят независимо, каждый поток со своим таймером
    const trySpawn = flow => {
      const open = G.stalls.filter(s => s.flow === flow && s.unlocked && G.queues[s.id].length < D.queue);
      if (!open.length) return;
      const st = open[Math.floor(Math.random() * open.length)], q = st.q;
      const c = { x: q.x + q.dx * q.len, z: q.z + q.dz * q.len, stall: st, state: 'queue', need: rint(1, D.demand), serve: 0, patience: 45, face: Math.atan2(-q.dx, -q.dz), walk: true, shade: Math.random() };
      G.customers.push(c); G.queues[st.id].push(c);
    };
    if (G.custT <= 0) { G.custT = D.custInt * rnd(0.7, 1.3); trySpawn('main'); }
    if (G.custTF <= 0) { G.custTF = D.custInt * rnd(0.7, 1.3); trySpawn('fish'); }
    if (G.custTJ <= 0) { G.custTJ = D.custInt * rnd(0.7, 1.3) / D.jCust; trySpawn('jungle'); }
    for (let i = G.customers.length - 1; i >= 0; i--) {
      const c = G.customers[i], st = c.stall, q = st.q;
      let tx, tz, sp = 9;
      if (c.state === 'queue') {
        const idx = G.queues[st.id].indexOf(c);
        tx = q.x + q.dx * idx * 1.7; tz = q.z + q.dz * idx * 1.7;
        if (idx === 0 && Math.hypot(c.x - tx, c.z - tz) < 0.1) {
          if (st.st.stock >= c.need) {
            c.serve += dt;
            if (c.serve >= 0.5) {
              st.st.stock -= c.need;
              SG.hooks.sfx('coin', st.bench.x, st.bench.z);
              SG.S.stats.customers++; SG.S.stats['sold' + st.id] += c.need;
              const pay = Math.round(c.need * st.price * D.priceMul * (st.flow === 'jungle' ? D.jPrice : 1));
              st.st.cash += pay;
              G.queues[st.id].shift();
              c.state = 'out';
            }
          } else {
            c.patience -= dt;
            if (c.patience <= 0) { G.queues[st.id].shift(); c.state = 'out'; }
          }
        }
      } else { tx = q.x + q.dx * (q.len + 4) + q.dz * q.exit; tz = q.z + q.dz * (q.len + 4) - q.dx * q.exit; }
      const dx = tx - c.x, dz = tz - c.z, d = hyp(dx, dz);
      c.walk = d > 0.1;
      if (d > 0.05) { const s = Math.min(d, sp * dt); c.x += dx / d * s; c.z += dz / d * s; c.face = Math.atan2(dx, dz); }
      else if (c.state === 'queue') c.face = Math.atan2(-q.dx, -q.dz);
      if (c.state === 'out' && (c.x - q.x) * q.dx + (c.z - q.z) * q.dz > q.len + 2) { c.gone = true; G.customers.splice(i, 1); }
    }
  }

  // Автомат удочки (общий для рыбаков и самого игрока на пирсе): закинул → ждёт → поклёвка → подсёк и бросил.
  // Полный цикл — D.fishInt секунд (из удочки), анимации занимают около 1,85 с, остальное — ожидание.
  const FISH_CYCLE_ANIM = 1.85;
  function stepRod(f, dt, onThrow) {
    f.t += dt;
    if (f.state === 'cast') {
      if (f.t >= 0.8) { f.state = 'wait'; f.t = 0; f.wait = Math.max(0.2, SG.D.fishInt * rnd(0.8, 1.2) - FISH_CYCLE_ANIM); }
    } else if (f.state === 'wait') {
      if (f.t >= f.wait) { f.state = 'bite'; f.t = 0; SG.hooks.sfx('splash', f.bx, f.bz); }
    } else if (f.state === 'bite') {
      if (f.t >= 0.5) { f.state = 'pull'; f.t = 0; f.thrown = false; }
    } else if (f.state === 'pull') {
      if (!f.thrown && f.t >= 0.3) { f.thrown = true; SG.hooks.sfx('throw', f.bx, f.bz); onThrow(); }
      if (f.t >= 0.55) { f.state = 'cast'; f.t = 0; f.thrown = false; }
    }
  }
  function updateFishers(dt) {
    const F = SG.FISH;
    for (const f of G.fishers) {
      const sz = F.seatZ(f.seat);
      f.bx = F.bobX + Math.sin(G.t * 1.7 + f.seat) * 0.25; f.bz = sz + Math.cos(G.t * 1.3 + f.seat * 2) * 0.25;
      stepRod(f, dt, () => G.fishFx.push({ x0: f.bx, z0: f.bz, x1: F.x + rnd(-1.9, 1.9), z1: F.benchZ, t: 0, dur: 1.0 }));
    }
    // летящая рыба: рыбацкая падает на прилавок и становится товаром, своя — прилетает к игроку в «рыбу с собой»
    const st = G.stalls[3], S = SG.S, p = G.p;
    for (let i = G.fishFx.length - 1; i >= 0; i--) {
      const fx = G.fishFx[i];
      fx.t += dt;
      if (fx.toPlayer) { fx.x1 = p.x; fx.z1 = p.z; }
      if (fx.t >= fx.dur) {
        if (fx.toPlayer) { S.fish++; S.stats.cfish++; SG.hooks.pop(p.x, p.z, '+1 {fish}', '#bfe8ff'); SG.hooks.sfx('pickMeat'); }
        else { st.st.stock += 1; S.stats.fish++; SG.hooks.sfx('put', fx.x1, fx.z1); }
        G.fishFx.splice(i, 1);
      }
    }
  }

  // ---------- пирс и корабль ----------
  function onPier() {
    const D = SG.D, F = SG.FISH, p = G.p;
    return D.fishBase && p.x > F.deckX0 - 0.3 && p.x < F.deckX1 && p.z > F.northZ - 0.3 && p.z < F.endZ(D.fishLen) + 0.8;
  }
  // Режим игрока: 'ship' на корабле, 'rod' на пирсе с купленной удочкой (топоры тогда убраны), иначе обычный
  function updateFishMode(dt) {
    const D = SG.D, p = G.p, sh = G.ship, F = SG.FISH, pf = G.pf;
    sh.rot += angDiff(sh.rot, sh.rotT) * Math.min(1, dt * 6);
    G.fishMode = sh.boarded ? 'ship' : (onPier() && D.rodLvl > 0 ? 'rod' : null);
    if (G.fishMode === 'rod') {
      if (!p.walk) p.face = Math.PI / 2; // стоя на пирсе, смотрит на воду
      const zc = clamp(p.z, F.northZ + 1, F.endZ(D.fishLen) - 1);
      pf.bx = F.bobX + Math.sin(G.t * 1.7) * 0.25; pf.bz = zc + Math.cos(G.t * 1.3) * 0.25;
      stepRod(pf, dt, () => G.fishFx.push({ x0: pf.bx, z0: pf.bz, x1: p.x, z1: p.z, t: 0, dur: 0.9, toPlayer: true }));
    } else { pf.state = 'cast'; pf.t = 0; pf.thrown = false; }
    if (G.fishMode === 'ship') updateHarpoon(dt);
  }
  // Гарпун сам бьёт ближайшую большую рыбу в радиусе
  function updateHarpoon(dt) {
    const D = SG.D, p = G.p, sh = G.ship;
    sh.cd -= dt;
    let best = null, bd = SG.SHIP.harpoonR * SG.SHIP.harpoonR;
    for (const f of G.sea) {
      if (f.dead) continue;
      const d = (f.x - p.x) ** 2 + (f.z - p.z) ** 2;
      if (d < bd) { bd = d; best = f; }
    }
    const sd = G.sad; // «Грустити» в приоритете, пока не нырнул
    if (!sd.dead && !sd.under && (sd.x - p.x) ** 2 + (sd.z - p.z) ** 2 < SG.SHIP.harpoonR * SG.SHIP.harpoonR) best = sd;
    sh.tgt = best;
    if (best) {
      sh.aim = Math.atan2(best.x - p.x, best.z - p.z);
      if (sh.cd <= 0) { sh.cd = D.hInt; SG.hooks.sfx('throw', p.x, p.z); G.harps.push({ x: p.x, y: 2.4, z: p.z, tgt: best, dmg: D.hDmg }); }
    }
  }
  function killSea(f) {
    const n = seaLoot(f.s);
    f.dead = true; f.respawn = 25; SG.S.stats.hfish++;
    dropStack('fish', n, f.x, f.z);
    SG.hooks.sfx('splash', f.x, f.z);
    if (f.s > 3) SG.hooks.pop(f.x, f.z, 'Большая рыба!', '#ffd23f');
  }
  function updateSea(dt) {
    for (const f of G.sea) {
      f.flash = Math.max(0, f.flash - dt);
      if (f.dead) { f.respawn -= dt; if (f.respawn <= 0) newSeaFish(f); continue; }
      f.t -= dt;
      if (f.t <= 0) { f.t = rnd(1.5, 4); f.a += rnd(-1.2, 1.2); }
      if (hyp(f.x - f.hx, f.z - f.hz) > 9 + f.s) f.a = Math.atan2(f.hx - f.x, f.hz - f.z); // далеко от дома — плывёт обратно
      const sp = 1.2 + f.s * 0.4;
      f.x += Math.sin(f.a) * sp * dt; f.z += Math.cos(f.a) * sp * dt;
    }
    for (let i = G.harps.length - 1; i >= 0; i--) {
      const h = G.harps[i], t = h.tgt;
      if (t.dead || t.under) { G.harps.splice(i, 1); continue; }
      const dx = t.x - h.x, dz = t.z - h.z, d = hyp(dx, dz), step = 45 * dt;
      h.dir = Math.atan2(dx, dz);
      if (d < step + 0.8) {
        t.hp -= h.dmg; t.flash = 0.15; SG.hooks.sfx('hit', t.x, t.z);
        G.harps.splice(i, 1);
        if (t.hp <= 0) { if (t === G.sad) killSad(t); else killSea(t); }
        continue;
      }
      h.x += dx / d * step; h.z += dz / d * step; h.y = Math.max(0.5, h.y - dt * 3);
    }
  }

  function updateTurrets(dt) {
    const D = SG.D;
    for (const t of G.turrets) {
      t.cd -= dt; t.flash = Math.max(0, t.flash - dt);
      let best = null, bd = D.tRange * D.tRange;
      for (const b of G.bears) {
        if (b.dead) continue;
        const d = (b.x - t.x) ** 2 + (b.z - t.z) ** 2;
        if (d < bd) { bd = d; best = b; }
      }
      if (best) {
        t.aim = Math.atan2(best.x - t.x, best.z - t.z);
        if (t.cd <= 0) { t.cd = D.tInt; t.flash = 0.12; SG.hooks.sfx('shot', t.x, t.z); G.shots.push({ x: t.x, y: 3, z: t.z, tgt: best, dmg: D.tDmg }); }
      }
    }
  }
  function updateShots(dt) {
    for (let i = G.shots.length - 1; i >= 0; i--) {
      const s = G.shots[i], b = s.tgt;
      if (b.dead) { G.shots.splice(i, 1); continue; }
      const dx = b.x - s.x, dz = b.z - s.z, d = hyp(dx, dz);
      s.dir = Math.atan2(dx, dz);
      const step = 40 * dt;
      if (d < step + 0.8) { dealBear(b, s.dmg, false); G.shots.splice(i, 1); continue; }
      s.x += dx / d * step; s.z += dz / d * step;
      s.y = Math.max(1, s.y - dt * 2);
    }
  }
})();
