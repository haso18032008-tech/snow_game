// Состояние игрока, производные характеристики и сохранение в localStorage.
(function () {
  'use strict';
  const SG = window.SG;
  const KEY = 'snowfarm3';

  SG.S = null;
  SG.D = {};

  SG.newState = () => ({
    v: 3, cash: 0, wood: 0, meat: 0, gold: 0, fish: 0, banana: 0, hp: 100,
    cut: [], // индексы срубленных гигантских деревьев (стена детерминирована, поэтому индексы стабильны)
    lv: {}, prog: {},
    stall: { wood: { stock: 0, cash: 0 }, meat: { stock: 0, cash: 0 }, gold: { stock: 0, cash: 0 }, fish: { stock: 0, cash: 0 }, jwood: { stock: 0, cash: 0 }, banana: { stock: 0, cash: 0 } },
    nick: '', quality: 'high', tipClosed: false,
    earned: 0, // всего заработано с продаж — очки таблицы лидеров, только растёт
    // счётчики для раздела «Статистика» (ключи — маленькими латинскими буквами, их же проверяет сервер)
    stats: { time: 0, trees: 0, wtrees: 0, ores: 0, kills: 0, boss: 0, verite: 0, deaths: 0, eaten: 0, spent: 0, customers: 0, cmeat: 0, mgold: 0, soldwood: 0, soldmeat: 0, soldgold: 0, giants: 0, fish: 0, soldfish: 0, cfish: 0, hfish: 0, monk: 0, curio: 0, grust: 0, palms: 0, banana: 0, soldjwood: 0, soldbanana: 0, rides: 0, hmonk: 0 }
  });
  SG.lv = id => SG.S.lv[id] || 0;
  SG.total = () => SG.S.wood + SG.S.meat + SG.S.gold;

  // Характеристики по таблице уровней. Отдельно от recalc, чтобы считать их и для чужого сохранения
  // (экран статистики игрока из таблицы лидеров), не трогая SG.S и SG.D.
  SG.derive = function (lv, D) {
    const F = SG.F, l = id => lv[id] || 0;
    D = D || {};
    D.axeLvl = l('axe');
    D.tier = Math.min(D.axeLvl, SG.TIERS.length - 1);
    D.axeDmg = F.axeDmg(D.axeLvl);
    D.axeCount = F.axeCount(D.axeLvl);
    D.axeR = F.axeR(D.axeLvl);
    D.spin = F.spin(D.axeLvl);
    D.collectors = l('collect');
    D.cRange = F.cRange(l('cradius'));
    D.cSpeed = F.cSpeed(l('cspeed'));
    D.cCarry = F.cCarry(l('ccarry'));
    D.miners = l('miner');
    D.fishBase = l('fbase') > 0;
    D.rodLvl = l('rod');
    D.shipOwned = l('ship') > 0;
    D.shipSpeed = F.sSpeed(l('sspeed'));
    D.hDmg = F.hDmg(l('hdmg'));
    D.hInt = F.hInt(l('hrate'));
    D.fishLen = l('flen');
    D.fishInt = F.fishInt(Math.max(1, l('rod')));
    D.fishers = D.fishBase && l('rod') > 0 ? l('fisher') : 0;
    D.maxHp = F.hp(l('hp'));
    D.speed = F.speed(l('speed'));
    D.regen = F.regen(l('regen'));
    D.workers = l('hire');
    D.wSpeed = F.wSpeed(l('wspeed'));
    D.wYield = F.wYield(l('wyield'));
    D.magnet = F.magnet(l('magnet'));
    D.oreYield = F.ore(l('ore'));
    D.baseL = l('base');
    D.tDmg = F.tDmg(l('tdmg'));
    D.tInt = F.tInt(l('trate'));
    D.tRange = F.tRange(l('trange'));
    D.custInt = F.custInt(l('cust'));
    D.demand = F.demand(l('demand'));
    D.queue = F.queue(l('queue'));
    D.heal = F.heal(l('heal'));
    D.priceMul = F.price(l('price'));
    D.goldUnlocked = l('goldstall') > 0;
    D.treeWood = 1 + Math.floor(D.axeLvl / 6);
    D.jungleBase = l('jbase') > 0;
    D.gunOwned = l('gun') > 0;
    D.gunDmg = F.gDmg(l('gdmg'));
    D.gunInt = F.gInt(l('grate'));
    D.gunCount = F.gCount(l('gcount'));
    D.gunRange = F.gRange(l('gdmg'));
    D.hunters = l('jhire');
    D.jbaseL = l('jup');                    // уровень базы в джунглях
    D.jPrice = 1 + 0.2 * D.jbaseL;          // цены джунглевых лавок
    D.jCust = 1 + 0.25 * D.jbaseL;          // частота покупателей там
    D.hunterCap = 2 + 2 * D.jbaseL;         // сколько охотников можно нанять
    D.mDmg = F.mDmg(l('jhdmg'));
    D.railLvl = l('rail');
    D.stFish = l('railf') > 0;
    D.stJungle = l('railj') > 0;
    return D;
  };
  // Пересчёт характеристик из уровней улучшений. Вызывать после любой покупки/загрузки.
  // SG.D меняем на месте: на этот объект уже ссылаются другие модули.
  SG.recalc = () => SG.derive(SG.S.lv, SG.D);

  SG.save = function () {
    try {
      const S = SG.S;
      S.hp = SG.G && SG.G.p ? SG.G.p.hp : S.hp;
      localStorage.setItem(KEY, JSON.stringify(S));
    } catch (e) { /* приватный режим — просто не сохраняем */ }
  };

  // Приводит «сырое» сохранение (из localStorage или с сервера) к целому состоянию с дефолтами
  SG.normalize = function (raw) {
    const S = SG.newState();
    if (raw && typeof raw === 'object') {
      for (const k of ['cash', 'wood', 'meat', 'gold', 'fish', 'banana', 'hp', 'earned']) if (isFinite(raw[k])) S[k] = raw[k];
      if (Array.isArray(raw.cut)) S.cut = raw.cut.filter(n => Number.isInteger(n) && n >= 0 && n < 2000).slice(0, 600);
      if (raw.lv) Object.assign(S.lv, raw.lv);
      if (raw.prog) Object.assign(S.prog, raw.prog);
      if (raw.stats) for (const k in S.stats) if (isFinite(raw.stats[k])) S.stats[k] = raw.stats[k];
      if (raw.stall) for (const id of ['wood', 'meat', 'gold', 'fish', 'jwood', 'banana']) if (raw.stall[id]) Object.assign(S.stall[id], raw.stall[id]);
      if (typeof raw.nick === 'string') S.nick = raw.nick.slice(0, 16);
      if (raw.quality === 'low' || raw.quality === 'high') S.quality = raw.quality;
      S.tipClosed = !!raw.tipClosed;
    }
    // Рюкзак убран из игры: уровни, купленные раньше, возвращаем деньгами (по старой формуле цены)
    if (S.lv.cap) {
      let back = 0;
      for (let i = 0; i < S.lv.cap; i++) back += Math.ceil(15 * Math.pow(1.3, i));
      S.cash += back; delete S.lv.cap; delete S.prog.cap;
    }
    return S;
  };

  SG.load = function () {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { /* битое сохранение — начинаем заново */ }
    SG.S = SG.normalize(raw);
    SG.recalc();
    return SG.S;
  };
  // Подменяет текущее состояние (например, прогрессом с сервера) и кладёт его в localStorage
  SG.adopt = function (raw) {
    SG.S = SG.normalize(raw);
    SG.recalc();
    SG.save();
  };

  SG.resetSave = function () {
    try {
      const keep = { nick: SG.S.nick, quality: SG.S.quality };
      localStorage.setItem(KEY, JSON.stringify(Object.assign(SG.newState(), keep)));
    } catch (e) {}
  };
})();
