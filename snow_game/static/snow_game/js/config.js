// Конфигурация игры: все числа и список улучшений живут здесь.
// Чтобы добавить новое улучшение — достаточно одной строки в U и (если нужно) формулы в F.
(function () {
  'use strict';
  const SG = (window.SG = window.SG || {});

  SG.fmt = function (n) {
    n = Math.floor(n);
    if (n < 1000) return String(n);
    const u = ['K', 'M', 'B', 'T'];
    let i = -1, v = n;
    while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; }
    let t = v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : String(Math.floor(v));
    if (t.indexOf('.') >= 0) t = t.replace(/0+$/, '').replace(/\.$/, '');
    return t + u[i];
  };

  // 30 уровней топора: имя + цвет лезвия
  SG.TIERS = [
    ['Каменный', '#9aa0a6'], ['Костяной', '#e3dccb'], ['Медный', '#c7773b'], ['Бронзовый', '#b0793a'],
    ['Железный', '#c9d1d6'], ['Стальной', '#8fa3b5'], ['Серебряный', '#e8eef2'], ['Золотой', '#ffd23f'],
    ['Янтарный', '#ffb300'], ['Изумрудный', '#2ecc71'], ['Сапфировый', '#3b6fe0'], ['Аметистовый', '#a45bd6'],
    ['Алмазный', '#6ee7f5'], ['Рубиновый', '#ff4d6d'], ['Обсидиановый', '#3a2f45'], ['Лавовый', '#ff6a00'],
    ['Огненный', '#ff3d00'], ['Громовой', '#ffe14d'], ['Морозный', '#9fe3ff'], ['Призрачный', '#cfd8ff'],
    ['Теневой', '#5b4b8a'], ['Лунный', '#e6e9ff'], ['Солнечный', '#fff176'], ['Звёздный', '#c9a0ff'],
    ['Кометный', '#7df9ff'], ['Космический', '#8e44ff'], ['Галактический', '#ff5fd2'], ['Квантовый', '#00e5ff'],
    ['Божественный', '#fffbe0'], ['Бесконечный', '#ffffff']
  ].map(t => ({ n: t[0], c: t[1] }));

  SG.VERITE_NAME = 'Верите';           // имя редкого моба (жёлтый смайлик) — меняется в одном месте
  SG.HALF = 190;                       // половина стороны мира
  // Восточный (на экране — справа снизу) зимний биом с озером. Его отделяет стена гигантских деревьев:
  // топор ниже «ур. 25» их не берёт, так что в начале игры туда не попасть. Звери за стену не заходят.
  SG.WALL_X = 118;                     // x первого ряда гигантских деревьев
  SG.GIANT_NEED_LVL = 24;              // уровень топора (с нуля), с которого гиганты рубятся — это «ур. 25» на экране
  SG.LAKE = { x: 150, z0: -70, z1: 110 }; // вода: x > LAKE.x в пределах z0..z1
  // Рыбацкая база на берегу. Настил идёт вдоль берега (по z): на севере прилавок, к югу — места рыбаков.
  // Каждый уровень «Длины пирса» удлиняет настил и добавляет место (k = 0..3).
  SG.FISH = {
    x: 147, deckX0: 143, deckX1: 150.6,
    northZ: 17.6, benchZ: 19.2, headZ: 16.5,     // северный край настила, прилавок, голова очереди (она тянется на север)
    cash: { x: 140.6, z: 19.2 },
    seatX: 148.5, seatZ: k => 25 + 4.2 * k, endZ: k => 27.1 + 4.2 * k,
    bobX: 157, price: 15,
    pad: { x: 147, z: 22.4 }                       // поле разгрузки: сюда игрок выкладывает пойманную рыбу
  };
  // Корабль: стоит у южного конца пирса; в воду нигде, кроме корабля, зайти нельзя.
  // SEA — где корабль может плыть (озеро уходит за край мира, поэтому x1 больше SG.HALF).
  SG.SHIP = { dock: { x: 153.4, z: 44.2 }, boardR: 9, harpoonR: 20 };
  SG.SEA = { x1: 440, fishCount: 70 };
  SG.baseHalf = L => 14 + 3 * L;       // половина стороны базы (юг всегда на z=14 — там лавки)
  SG.SPAWN = [1.0, 8.2];               // где появляется герой: между плитками, чтобы не стоять на покупке
  SG.STALL_PAD_Z = 11.0;               // поле разгрузки (стоит игрок), лежит на платформе лавки
  SG.BENCH_Z = 13.1;                   // задняя часть платформы — тут лежит товар
  // Камера: pitch — угол над горизонтом (больше = смотрит сильнее сверху), dist — расстояние до героя
  SG.CAM = { pitch: 52, fov: 30, dist: 60 };
  SG.GATE_S_X = 10.5;                  // южные ворота
  // На последнем уровне базы (L=4) в каждом из 4 углов забора появляются ворота: срезают угол по диагонали.
  // CORNER_C — сколько метров забора от угла убрано по каждой стороне (хорда между концами = ширина обычных ворот).
  SG.CORNER_GATES_LVL = 4;
  SG.CORNER_C = 3.4;
  SG.STALLS = [
    { id: 'wood', name: 'Дрова', icon: 'log', x: -8, price: 2 },
    { id: 'meat', name: 'Мясо', icon: 'meat', x: -2, price: 7 },
    { id: 'gold', name: 'Золото', icon: 'gold', x: 4, price: 30 }
  ];

  // Формулы эффектов от уровня улучшения L
  const F = (SG.F = {
    axeDmg: L => 10 * Math.pow(1.22, L),
    axeCount: L => Math.min(10, 2 + Math.floor(L / 3)),
    axeR: L => 2.3 + Math.min(1.7, 0.055 * L),
    spin: L => 4 + 0.12 * L,
    hp: L => 100 + 25 * L,
    speed: L => 9 + 0.3 * L,
    regen: L => 0.5 * L,
    wSpeed: L => 1 + 0.2 * L,
    wYield: L => 1 + Math.floor(L * 0.7),
    magnet: L => 3 + 0.8 * L,
    ore: L => 1 + Math.floor(L / 2),
    sSpeed: L => 10 + 0.9 * L,
    hDmg: L => 20 * Math.pow(1.22, L),
    hInt: L => 1.1 / (1 + 0.1 * L),
    fishInt: L => 8 / (1 + 0.25 * L), // полный цикл «закинул—клюнуло—бросил» в секундах (быстрее ~2 с не бывает: анимация)
    // Сборщики мяса. Уровень 0 = как было до появления этих улучшений (48 м, ×1, 10 шт.),
    // чтобы старые сохранения не «просели» после обновления.
    cRange: L => 48 + 5 * L,
    cSpeed: L => 1 + 0.08 * L,
    cCarry: L => 10 + 5 * L,
    tDmg: L => 12 * Math.pow(1.22, L),
    tInt: L => 1.4 / (1 + 0.12 * L),
    tRange: L => 16 + 1.2 * L,
    custInt: L => 2.2 / (1 + 0.2 * L),
    demand: L => 3 + L,
    queue: L => 4 + L,
    heal: L => 8 + 3 * L,
    price: L => 1 + 0.2 * L
  });
  const f = SG.fmt;

  // row/col — место плитки в сетке на базе. base*mult^L — цена следующего уровня.
  SG.U = [
    { id: 'axe', name: 'Топор', icon: 'axe', row: 0, col: 0, max: 29, base: 20, mult: 1.4, val: L => SG.TIERS[Math.min(L, 29)].n },
    { id: 'hp', name: 'Здоровье', icon: 'heart', row: 0, col: 2, max: 20, base: 25, mult: 1.35, val: L => F.hp(L) + ' HP' },
    { id: 'speed', name: 'Скорость', icon: 'boot', row: 0, col: 3, max: 15, base: 30, mult: 1.45, val: L => F.speed(L).toFixed(1) },
    { id: 'regen', name: 'Регенерация', icon: 'regen', row: 0, col: 4, max: 15, base: 40, mult: 1.5, val: L => F.regen(L).toFixed(1) + ' HP/с' },

    { id: 'hire', name: 'Рабочий', icon: 'worker', row: 1, col: 0, max: 12, base: 30, mult: 1.5, val: L => L + ' шт.' },
    { id: 'collect', name: 'Сборщик мяса', icon: 'basket', row: 1, col: 0, max: 8, base: 70, mult: 1.55, val: L => L + ' шт.' },
    { id: 'cradius', name: 'Обзор сборщиков', icon: 'eye', row: 1, col: 0, max: 10, base: 60, mult: 1.4, val: L => F.cRange(L) + ' м' },
    { id: 'cspeed', name: 'Скорость сборщиков', icon: 'boot', row: 1, col: 0, max: 10, base: 55, mult: 1.4, val: L => '×' + F.cSpeed(L).toFixed(2) },
    { id: 'ccarry', name: 'Вместимость сборщиков', icon: 'bag', row: 1, col: 0, max: 10, base: 50, mult: 1.4, val: L => F.cCarry(L) + ' мяса' },
    { id: 'miner', name: 'Золотоискатель', icon: 'miner', row: 1, col: 4, max: 6, base: 200, mult: 1.6, val: L => L + ' шт.' },
    { id: 'fbase', name: 'Рыбацкая база', icon: 'fish', row: 0, col: 0, max: 1, base: 40000, mult: 1, wood: [300, 1], val: () => 'Построить' },
    { id: 'flen', name: 'Длина пирса', icon: 'pier', row: 0, col: 0, max: 3, base: 6000, mult: 3, val: L => (1 + L) + ' мест' },
    { id: 'rod', name: 'Удочка', icon: 'rod', row: 0, col: 0, max: 15, base: 500, mult: 1.5, val: L => L ? F.fishInt(L).toFixed(1) + ' с/рыба' : 'нет' },
    { id: 'fisher', name: 'Рыбак', icon: 'fisher', row: 0, col: 0, max: 4, base: 1500, mult: 2.2, val: L => L + ' шт.' },
    { id: 'ship', name: 'Корабль', icon: 'ship', row: 0, col: 0, max: 1, base: 167000, mult: 1, val: () => 'Купить' },
    { id: 'hdmg', name: 'Урон гарпуна', icon: 'harpoon', row: 0, col: 0, max: 25, base: 3000, mult: 1.3, val: L => f(F.hDmg(L)) },
    { id: 'hrate', name: 'Скорость гарпуна', icon: 'bolt', row: 0, col: 0, max: 15, base: 3500, mult: 1.4, val: L => F.hInt(L).toFixed(2) + ' с' },
    { id: 'sspeed', name: 'Скорость корабля', icon: 'boot', row: 0, col: 0, max: 15, base: 2500, mult: 1.4, val: L => F.sSpeed(L).toFixed(1) },
    { id: 'wspeed', name: 'Темп работы', icon: 'bolt', row: 1, col: 1, max: 20, base: 35, mult: 1.4, val: L => '×' + F.wSpeed(L).toFixed(1) },
    { id: 'wyield', name: 'Дерево/раб.', icon: 'log', row: 1, col: 2, max: 15, base: 45, mult: 1.5, val: L => F.wYield(L) + ' шт.' },
    { id: 'magnet', name: 'Магнит', icon: 'magnet', row: 1, col: 3, max: 15, base: 25, mult: 1.4, val: L => F.magnet(L).toFixed(1) + ' м' },
    { id: 'ore', name: 'Руда', icon: 'pick', row: 1, col: 4, max: 15, base: 60, mult: 1.45, val: L => F.ore(L) + ' слит.' },

    { id: 'base', name: 'База', icon: 'castle', row: 2, col: 0, max: 4, base: 120, mult: 2.2, wood: [50, 2], val: L => 'Размер ' + (2 * SG.baseHalf(L)) },
    { id: 'tdmg', name: 'Урон башен', icon: 'boom', row: 2, col: 1, max: 25, base: 50, mult: 1.35, val: L => f(F.tDmg(L)) },
    { id: 'trate', name: 'Скорость башен', icon: 'bow', row: 2, col: 2, max: 20, base: 55, mult: 1.4, val: L => F.tInt(L).toFixed(2) + ' с' },
    { id: 'cust', name: 'Покупатели', icon: 'crowd', row: 2, col: 3, max: 20, base: 40, mult: 1.4, val: L => F.custInt(L).toFixed(1) + ' с' },
    { id: 'price', name: 'Цены', icon: 'coin', row: 2, col: 4, max: 25, base: 70, mult: 1.38, val: L => '×' + F.price(L).toFixed(1) },

    { id: 'demand', name: 'Заказы', icon: 'cart', row: 3, col: 0, max: 15, base: 50, mult: 1.4, val: L => 'до ' + F.demand(L) },
    { id: 'queue', name: 'Очередь', icon: 'walker', row: 3, col: 1, max: 8, base: 40, mult: 1.45, val: L => F.queue(L) + ' мест' },
    { id: 'goldstall', name: 'Лавка золота', icon: 'lock', row: 3, col: 2, max: 1, base: 150, mult: 1, val: () => 'Открыть' },
    { id: 'heal', name: 'Костёр', icon: 'fire', row: 3, col: 3, max: 10, base: 35, mult: 1.4, val: L => F.heal(L) + ' HP/с' },
    { id: 'trange', name: 'Дальность башен', icon: 'target', row: 3, col: 4, max: 15, base: 45, mult: 1.35, val: L => F.tRange(L).toFixed(0) + ' м' }
  ];
  // Плитки разбросаны по базе (x, z, поворот в четвертях оборота), а не стоят сеткой
  // Каждая плитка стоит у «своего» объекта или в своём кластере: герой — в центре, рабочие — на западе,
  // защита — на востоке, торговля — у лавок, костёр — у костра, замок золотой лавки — у золотой лавки.
  const POS = {
    axe: [-1.5, -3.9, 0], hp: [3.0, -10.3, 3], speed: [-4.9, -10.5, 2], regen: [-3.8, 0.9, 1], magnet: [2.9, -1.8, 0],
    hire: [-8.4, -7.5, 0], wspeed: [-8.6, -1.2, 3], wyield: [-5.1, -2.8, 2], collect: [-2.2, 7.6, 1],
    ore: [8.2, 3.0, 1], base: [-0.6, -8.2, 2], tdmg: [10.8, -6.0, 1], trate: [11.1, 6.6, 1], trange: [7.1, -7.0, 3],
    cust: [0.8, 3.6, 3], price: [-6.2, 6.4, 2], demand: [-7.4, 2.6, 1], queue: [7.7, -0.9, 0],
    goldstall: [4.2, 7.4, 3], heal: [-11.8, 4.6, 2],
    // новые плитки: позиции временные, подвинь их в редакторе плиток
    cradius: [-2.5, 4.3, 1], cspeed: [-0.5, 0.5, 1], ccarry: [7.1, 9.0, 1], miner: [4.9, 3.0, 1],
    // рыбацкая база (на берегу, далеко от основной базы)
    fbase: [146.8, 29, 0], flen: [138.4, 26.0, 1], rod: [138.4, 29.4, 1], fisher: [138.4, 32.8, 1],
    ship: [138.4, 36.2, 1], hdmg: [134.9, 26.0, 1], hrate: [134.9, 29.4, 1], sspeed: [134.9, 32.8, 1]
  };
  SG.U.forEach(u => { u.kind = 'upg'; u.x = POS[u.id][0]; u.z = POS[u.id][1]; u.rot = POS[u.id][2]; });

  // Какие плитки появляются только после других: id -> [id-условия, нужный уровень].
  // 'turrets' — число построенных башен. Плитка, которую уже купил, остаётся видимой всегда.
  // В начале доступны топор, покупатели и замок золотой лавки (без условий); башни открываются после первого расширения базы.
  SG.REQ = {
    speed: ['axe', 1], hp: ['axe', 2], regen: ['hp', 1], heal: ['hp', 1],
    hire: ['cust', 1], wspeed: ['hire', 1], wyield: ['hire', 2], collect: ['hire', 2],
    cradius: ['collect', 1], cspeed: ['cradius', 1], ccarry: ['cspeed', 1],
    miner: ['goldstall', 1],
    fbase: ['axe', 24], flen: ['fbase', 1], rod: ['fbase', 1], fisher: ['rod', 1],
    ship: ['flen', 3], hdmg: ['ship', 1], hrate: ['ship', 1], sspeed: ['ship', 1],
    magnet: ['axe', 2], ore: ['axe', 3],
    price: ['cust', 1], demand: ['cust', 2], queue: ['cust', 3],
    base: ['axe', 2],
    tdmg: ['turrets', 1], trate: ['tdmg', 1], trange: ['trate', 1]
  };
  SG.TURRETS_NEED_BASE = 1; // башни можно строить после расширения базы до этого уровня

  // Места под башни заданы ОТНОСИТЕЛЬНО границ базы (u, v от -1 до 1, уровень базы), поэтому
  // при расширении базы башни переезжают к новому забору и продолжают её защищать.
  SG.TURRETS = [
    [-1, -1, 0], [1, -1, 0], [-1, -0.1, 0], [1, -0.1, 0],
    [-0.5, -1, 1], [0.5, -1, 1], [-1, 0.6, 2], [1, 0.6, 2],
    [-1, -0.55, 3], [1, -0.55, 3], [-1, 0.3, 4], [1, 0.3, 4]
  ];
  SG.slotPos = function (i, b) {
    const t = SG.TURRETS[i];
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    // северные угловые башни (v = -1, u = ±1) стояли бы ровно в проёме угловых ворот — сдвигаем их вглубь базы
    const inset = b.corners && Math.abs(t[0]) === 1 && t[1] === -1 ? 3.6 : 0;
    const hw = (b.maxX - b.minX) / 2 - 1.9 - inset, hd = (b.maxZ - b.minZ) / 2 - 1.9 - inset;
    return [cx + t[0] * hw, cz + t[1] * hd];
  };
  SG.TURRET_BASE_COST = 25;
  SG.TURRET_COST_MULT = 1.75;
  // Дерево на башни и базу: платится вместе с деньгами. База: 50, 100, 200, 400; башни: 15·1.4^построено
  SG.TURRET_WOOD_BASE = 15;
  SG.TURRET_WOOD_MULT = 1.4;
})();
