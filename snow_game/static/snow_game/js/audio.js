// Звук без аудиофайлов: музыка и эффекты синтезируются через Web Audio прямо в браузере
// (никаких лицензий и лишнего веса). Браузеры запрещают звук до первого касания, поэтому
// контекст создаётся лениво — по первому нажатию.
(function () {
  'use strict';
  const SG = window.SG;
  const A = (SG.audio = { ctx: null, music: 0.5, sfx: 0.8, started: false });
  const KEY = 'snowfarm3_audio'; // отдельно от прогресса: настройки звука не должны затираться загрузкой с сервера
  const clamp = v => Math.max(0, Math.min(1, v));
  try {
    const r = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (r) { if (isFinite(r.music)) A.music = clamp(r.music); if (isFinite(r.sfx)) A.sfx = clamp(r.sfx); }
  } catch (e) { /* нет доступа к хранилищу — остаются значения по умолчанию */ }
  A.save = () => { try { localStorage.setItem(KEY, JSON.stringify({ music: A.music, sfx: A.sfx })); } catch (e) {} };

  let ctx, musicG, sfxG, musicBus, noiseBuf, barT = 0, bar = 0;
  const BAR = 3.6; // секунд на такт

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC(); A.ctx = ctx;
    const master = ctx.createGain(); master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp); comp.connect(ctx.destination);
    musicG = ctx.createGain(); sfxG = ctx.createGain();
    musicG.connect(master); sfxG.connect(master);
    musicBus = ctx.createGain(); musicBus.connect(musicG);
    // «ледяное» эхо для колокольчиков
    const dl = ctx.createDelay(1.0); dl.delayTime.value = 0.42;
    const fb = ctx.createGain(); fb.gain.value = 0.38;
    const wet = ctx.createGain(); wet.gain.value = 0.5;
    musicBus.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(musicG);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    A.apply();
    // тихий ветер на фоне, медленно «дышит»
    const w = ctx.createBufferSource(); w.buffer = noiseBuf; w.loop = true;
    const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 520;
    const wg = ctx.createGain(); wg.gain.value = 0.05;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lg = ctx.createGain(); lg.gain.value = 0.03;
    lfo.connect(lg); lg.connect(wg.gain);
    w.connect(wf); wf.connect(wg); wg.connect(musicG);
    w.start(0); lfo.start(0);
    return ctx;
  }
  A.apply = function () {
    if (!ctx) return;
    musicG.gain.setTargetAtTime(A.music * 0.55, ctx.currentTime, 0.05);
    sfxG.gain.setTargetAtTime(A.sfx, ctx.currentTime, 0.05);
  };

  // ---------- кирпичики звуков ----------
  function env(g, t, a, d, peak) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function tone(dest, f, t, dur, type, vol, slide) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    env(g, t, 0.005, dur, vol);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dest, t, dur, type, f0, vol, f1) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); env(g, t, 0.003, dur, vol);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  const N = m => 440 * Math.pow(2, (m - 69) / 12);

  // Эффекты: функция (время, выход, параметр). Громкость уже учтена выходом.
  const S = {
    chop: (t, o) => { noise(o, t, 0.07, 'bandpass', 1100, 0.5); tone(o, 140, t, 0.08, 'sine', 0.5, 70); },
    wchop: (t, o) => { noise(o, t, 0.06, 'bandpass', 900, 0.25); tone(o, 120, t, 0.07, 'sine', 0.25, 60); },
    treefall: (t, o) => { noise(o, t, 0.4, 'lowpass', 900, 0.5, 120); tone(o, 90, t + 0.05, 0.3, 'sine', 0.5, 40); },
    pick: (t, o) => { tone(o, 1500, t, 0.05, 'square', 0.15, 900); noise(o, t, 0.05, 'highpass', 3000, 0.3); },
    clank: (t, o) => { tone(o, 260, t, 0.12, 'square', 0.18, 200); noise(o, t, 0.05, 'bandpass', 2500, 0.25); },
    ore: (t, o) => { [1568, 2093, 2637].forEach((f, i) => tone(o, f, t + i * 0.05, 0.25, 'triangle', 0.25)); },
    hit: (t, o) => { noise(o, t, 0.08, 'lowpass', 1400, 0.55); tone(o, 220, t, 0.1, 'sawtooth', 0.3, 80); },
    boing: (t, o) => { tone(o, 300, t, 0.28, 'sine', 0.5, 900); tone(o, 600, t + 0.02, 0.2, 'triangle', 0.15, 1400); },
    bearDie: (t, o) => { tone(o, 240, t, 0.55, 'sawtooth', 0.3, 50); noise(o, t, 0.3, 'lowpass', 800, 0.4, 150); },
    fanfare: (t, o) => { [60, 64, 67, 72, 76].forEach((m, i) => tone(o, N(m + 12), t + i * 0.09, 0.4, 'triangle', 0.3)); },
    hurt: (t, o) => { tone(o, 330, t, 0.22, 'square', 0.3, 110); noise(o, t, 0.1, 'lowpass', 700, 0.3); },
    death: (t, o) => { [64, 60, 55, 48].forEach((m, i) => tone(o, N(m), t + i * 0.2, 0.5, 'triangle', 0.35, N(m) * 0.9)); },
    eat: (t, o) => { for (let i = 0; i < 3; i++) { noise(o, t + i * 0.1, 0.07, 'bandpass', 600, 0.4); tone(o, 180, t + i * 0.1, 0.06, 'sine', 0.3, 100); } },
    pickWood: (t, o) => tone(o, 420, t, 0.07, 'triangle', 0.3, 520),
    pickMeat: (t, o) => { tone(o, 620, t, 0.08, 'sine', 0.3, 740); },
    pickGold: (t, o) => { tone(o, 1318, t, 0.12, 'sine', 0.3); tone(o, 1976, t + 0.05, 0.15, 'sine', 0.25); },
    pickCash: (t, o) => { tone(o, 1175, t, 0.08, 'triangle', 0.3); tone(o, 1568, t + 0.05, 0.1, 'triangle', 0.25); },
    cash: (t, o) => { [1046, 1318, 1568, 2093].forEach((f, i) => tone(o, f, t + i * 0.06, 0.22, 'triangle', 0.3)); },
    coin: (t, o) => { tone(o, 1568, t, 0.08, 'square', 0.12); tone(o, 2349, t + 0.06, 0.2, 'square', 0.1); },
    put: (t, o) => tone(o, 300, t, 0.05, 'triangle', 0.2, 240),
    pay: (t, o, p) => tone(o, 600 + 700 * (p || 0), t, 0.04, 'triangle', 0.18),
    buy: (t, o) => { [60, 64, 67, 72].forEach((m, i) => { tone(o, N(m + 12), t + i * 0.07, 0.3, 'sawtooth', 0.12); tone(o, N(m + 24), t + i * 0.07, 0.25, 'sine', 0.12); }); },
    unlock: (t, o) => { [84, 88, 91].forEach((m, i) => tone(o, N(m), t + 0.3 + i * 0.08, 0.35, 'sine', 0.22)); },
    shot: (t, o) => { tone(o, 800, t, 0.09, 'square', 0.15, 220); noise(o, t, 0.06, 'highpass', 2500, 0.2); },
    jingle: (t, o) => { [72, 76, 79, 84, 79, 84].forEach((m, i) => tone(o, N(m + 12), t + i * 0.1, 0.3, 'triangle', 0.28)); },
    splash: (t, o) => { noise(o, t, 0.16, 'bandpass', 700, 0.35, 300); tone(o, 420, t, 0.12, 'sine', 0.25, 160); },
    throw: (t, o) => { noise(o, t, 0.14, 'highpass', 1800, 0.22); tone(o, 500, t, 0.12, 'triangle', 0.15, 900); },
    gun: (t, o) => { noise(o, t, 0.14, 'lowpass', 2400, 0.6, 300); tone(o, 150, t, 0.13, 'sawtooth', 0.3, 50); },
    rail: (t, o) => { for (let i = 0; i < 8; i++) noise(o, t + i * 0.12, 0.08, 'bandpass', 500, 0.3); tone(o, 110, t, 0.9, 'sawtooth', 0.12, 170); },
    ui: (t, o) => tone(o, 880, t, 0.05, 'triangle', 0.18, 1100)
  };
  // не чаще, чем раз в N мс (иначе удары топоров сливаются в кашу)
  const GAP = { chop: 55, wchop: 90, hit: 45, pay: 65, put: 55, pickWood: 45, pickMeat: 45, pickGold: 45, pickCash: 45, shot: 70, coin: 90, pick: 60, splash: 120, throw: 120, gun: 60, rail: 400 };
  const lastT = {};

  A.play = function (name, x, z, arg) {
    if (!ctx || ctx.state !== 'running' || A.sfx <= 0 || !S[name]) return;
    const now = performance.now();
    if (GAP[name] && now - (lastT[name] || 0) < GAP[name]) return;
    lastT[name] = now;
    let v = 1;
    if (x != null && SG.G && SG.G.p) { // чем дальше от героя, тем тише
      const d = Math.hypot(x - SG.G.p.x, z - SG.G.p.z);
      v = Math.pow(Math.max(0, 1 - d / 45), 1.5);
      if (v < 0.04) return;
    }
    const out = ctx.createGain(); out.gain.value = v; out.connect(sfxG);
    S[name](ctx.currentTime + 0.005, out, arg);
  };

  // ---------- музыка: спокойные аккорды Am–F–C–G и редкие колокольчики ----------
  const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
  const SCALE = [69, 72, 74, 76, 79, 81, 84];
  function bell(t, f) { tone(musicBus, f, t, 1.8, 'sine', 0.07); tone(musicBus, f * 2.01, t, 0.9, 'sine', 0.022); }
  function playBar(t, i) {
    const ch = CHORDS[i % 4];
    for (const n of ch) {
      const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = 'triangle'; o.frequency.value = N(n);
      f.type = 'lowpass'; f.frequency.value = 850;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.085, t + 1.3); g.gain.linearRampToValueAtTime(0.0001, t + BAR + 0.9);
      o.connect(f); f.connect(g); g.connect(musicBus); o.start(t); o.stop(t + BAR + 1);
    }
    tone(musicBus, N(ch[0] - 12), t, BAR * 0.95, 'sine', 0.13);
    for (let k = 0; k < 8; k++) if (Math.random() < 0.42) bell(t + k * BAR / 8, N(SCALE[Math.floor(Math.random() * SCALE.length)]));
  }
  function scheduleMusic() {
    if (!ctx || ctx.state !== 'running') return;
    if (A.music <= 0) { barT = ctx.currentTime + 0.2; return; } // выключена — не копим очередь
    while (barT < ctx.currentTime + 1.0) { playBar(barT, bar++); barT += BAR; }
  }

  function unlock() {
    const c = ensure(); if (!c) return;
    if (c.state !== 'running') c.resume();
    if (!A.started) { A.started = true; barT = c.currentTime + 0.2; setInterval(scheduleMusic, 250); }
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, unlock, { passive: true }));
  if (typeof document !== 'undefined' && document.addEventListener) {
    // в фоновой вкладке звук не нужен
    document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      if (document.hidden) ctx.suspend(); else ctx.resume();
    });
  }

  A.bindUI = function () {
    const $ = id => document.getElementById(id);
    const m = $('vmus'), s = $('vsfx');
    m.value = Math.round(A.music * 100); s.value = Math.round(A.sfx * 100);
    m.oninput = () => { A.music = clamp(m.value / 100); A.apply(); A.save(); };
    s.oninput = () => { A.sfx = clamp(s.value / 100); A.apply(); A.save(); };
    s.onchange = () => A.play('ui');
    // щелчок на любой кнопке интерфейса
    document.addEventListener('click', e => { if (e.target.closest && e.target.closest('button')) A.play('ui'); });
  };

  SG.hooks.sfx = A.play;
})();
