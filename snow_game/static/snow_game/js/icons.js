// Иконки нарисованы кодом, а не эмодзи: часть эмодзи (🪓, 🪵 и др.) на многих устройствах не отображается,
// а свой набор выглядит одинаково везде. Все рисуются в квадрате 100×100.
(function () {
  'use strict';
  const SG = window.SG;
  const DK = '#1f2430';

  const poly = (g, pts, fill) => {
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath(); g.fillStyle = fill; g.fill(); g.stroke();
  };
  const rrect = (g, x, y, w, h, r, fill) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = fill; g.fill(); g.stroke(); };
  const circ = (g, x, y, r, fill) => { g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = fill; g.fill(); g.stroke(); };
  const line = (g, x1, y1, x2, y2, w, col) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineWidth = w; g.strokeStyle = col; g.stroke(); g.lineWidth = 5; g.strokeStyle = DK; };
  const heart = (g, cx, cy, s, fill) => {
    g.beginPath(); g.moveTo(cx, cy + s * 0.9);
    g.bezierCurveTo(cx - s * 1.5, cy - s * 0.1, cx - s * 0.9, cy - s * 1.1, cx, cy - s * 0.35);
    g.bezierCurveTo(cx + s * 0.9, cy - s * 1.1, cx + s * 1.5, cy - s * 0.1, cx, cy + s * 0.9);
    g.closePath(); g.fillStyle = fill; g.fill(); g.stroke();
  };

  const D = {
    axe(g) { line(g, 26, 88, 62, 28, 11, DK); line(g, 26, 88, 62, 28, 7, '#a56a35'); poly(g, [[52, 18], [86, 28], [80, 62], [58, 46]], '#e9eef2'); },
    bag(g) { rrect(g, 22, 28, 56, 60, 16, '#f0953a'); rrect(g, 32, 58, 36, 22, 6, '#c9722a'); g.beginPath(); g.arc(50, 28, 14, Math.PI, 0); g.lineWidth = 7; g.stroke(); g.lineWidth = 5; line(g, 34, 46, 66, 46, 5, '#c9722a'); },
    heart(g) { heart(g, 50, 46, 30, '#ff4d5e'); },
    regen(g) { heart(g, 50, 46, 30, '#52d36b'); line(g, 50, 34, 50, 62, 9, '#fff'); line(g, 36, 48, 64, 48, 9, '#fff'); },
    boot(g) { poly(g, [[30, 14], [58, 14], [58, 52], [86, 62], [86, 84], [28, 84]], '#c58547'); poly(g, [[28, 72], [86, 72], [86, 84], [28, 84]], '#6b4a2c'); },
    worker(g) { rrect(g, 26, 52, 48, 36, 14, '#2a93dc'); circ(g, 50, 36, 16, '#f2c9a0'); g.beginPath(); g.arc(50, 33, 18, Math.PI, 0); g.closePath(); g.fillStyle = '#ffd23f'; g.fill(); g.stroke(); },
    ship(g) { poly(g, [[8, 56], [92, 56], [78, 82], [24, 82]], '#2f5f8f'); rrect(g, 30, 40, 36, 16, 3, '#f4f1ea'); line(g, 50, 40, 50, 10, 4, '#6b4426'); poly(g, [[50, 12], [78, 24], [50, 32]], '#e8392b'); g.beginPath(); g.moveTo(4, 90); g.quadraticCurveTo(30, 82, 50, 90); g.quadraticCurveTo(70, 98, 96, 88); g.lineWidth = 6; g.strokeStyle = '#4aa3d8'; g.stroke(); g.lineWidth = 5; g.strokeStyle = DK; },
    harpoon(g) { line(g, 16, 86, 70, 32, 8, DK); line(g, 16, 86, 70, 32, 4, '#a56a35'); poly(g, [[62, 14], [90, 10], [86, 38], [74, 30], [62, 38]], '#d5dce2'); },
    fish(g) { g.beginPath(); g.ellipse(46, 50, 30, 18, 0, 0, 7); g.fillStyle = '#7fc4ec'; g.fill(); g.stroke(); poly(g, [[70, 50], [92, 32], [92, 68]], '#4aa3d8'); circ(g, 33, 44, 4, '#fff'); circ(g, 33, 44, 1.8, DK); line(g, 50, 36, 50, 64, 3, '#b8e2f8'); },
    pier(g) { rrect(g, 8, 52, 84, 16, 4, '#c98e55'); line(g, 22, 54, 22, 66, 3, '#8a5a30'); line(g, 40, 54, 40, 66, 3, '#8a5a30'); line(g, 58, 54, 58, 66, 3, '#8a5a30'); rrect(g, 18, 68, 10, 22, 3, '#7d4f2b'); rrect(g, 72, 68, 10, 22, 3, '#7d4f2b'); g.beginPath(); g.moveTo(4, 88); g.quadraticCurveTo(30, 78, 50, 88); g.quadraticCurveTo(70, 98, 96, 86); g.lineWidth = 6; g.strokeStyle = '#4aa3d8'; g.stroke(); g.lineWidth = 5; g.strokeStyle = DK; },
    rod(g) { line(g, 18, 90, 74, 18, 8, DK); line(g, 18, 90, 74, 18, 4, '#a56a35'); g.beginPath(); g.moveTo(74, 18); g.quadraticCurveTo(96, 40, 84, 70); g.lineWidth = 3; g.strokeStyle = '#e9eef2'; g.stroke(); g.lineWidth = 5; g.strokeStyle = DK; circ(g, 84, 76, 7, '#e8392b'); },
    fisher(g) { rrect(g, 26, 56, 48, 32, 12, '#3b7bd4'); circ(g, 50, 44, 16, '#f2c9a0'); g.beginPath(); g.arc(50, 40, 19, Math.PI, 0); g.closePath(); g.fillStyle = '#e8c34a'; g.fill(); g.stroke(); line(g, 70, 70, 94, 30, 4, '#a56a35'); },
    eye(g) { g.beginPath(); g.moveTo(8, 50); g.quadraticCurveTo(50, 8, 92, 50); g.quadraticCurveTo(50, 92, 8, 50); g.closePath(); g.fillStyle = '#f4f8fb'; g.fill(); g.stroke(); circ(g, 50, 50, 17, '#3b8fe0'); circ(g, 50, 50, 7, DK); },
    miner(g) { rrect(g, 26, 56, 48, 32, 12, '#7d8a99'); circ(g, 50, 44, 16, '#f2c9a0'); g.beginPath(); g.arc(50, 40, 19, Math.PI, 0); g.closePath(); g.fillStyle = '#ff9f1c'; g.fill(); g.stroke(); circ(g, 50, 22, 6, '#fff3b0'); },
    bolt(g) { poly(g, [[58, 8], [24, 56], [46, 56], [38, 92], [78, 40], [54, 40]], '#ffd23f'); },
    log(g) {
      // два бревна: дальнее выглядывает сверху, ближнее с торцом, годовыми кольцами и корой
      const logB = (x, y, w, h, shade) => {
        const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, shade ? '#c58a4a' : '#d9a063'); gr.addColorStop(1, shade ? '#8d5528' : '#a8692f');
        rrect(g, x, y, w, h, 9, gr);
        g.lineWidth = 2.5; g.strokeStyle = 'rgba(70,38,12,.55)';
        for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(x + 8, y + h * i / 4); g.lineTo(x + w - 14, y + h * i / 4); g.stroke(); }
        g.lineWidth = 5; g.strokeStyle = DK;
        g.beginPath(); g.ellipse(x + w, y + h / 2, h * 0.34, h / 2, 0, 0, 7); g.fillStyle = '#efc489'; g.fill(); g.stroke();
        g.lineWidth = 2.2; g.strokeStyle = '#c28445';
        for (const k of [0.62, 0.36]) { g.beginPath(); g.ellipse(x + w, y + h / 2, h * 0.34 * k, h / 2 * k, 0, 0, 7); g.stroke(); }
        g.lineWidth = 5; g.strokeStyle = DK;
      };
      logB(14, 16, 56, 30, true); logB(8, 50, 62, 34, false);
    },
    magnet(g) {
      g.lineCap = 'round'; g.beginPath(); g.arc(50, 50, 26, Math.PI, 0); g.lineWidth = 20; g.strokeStyle = DK; g.stroke();
      g.lineWidth = 12; g.strokeStyle = '#e04b4b'; g.beginPath(); g.arc(50, 50, 26, Math.PI, 0); g.stroke();
      for (const x of [24, 76]) { g.lineWidth = 20; g.strokeStyle = DK; g.beginPath(); g.moveTo(x, 50); g.lineTo(x, 76); g.stroke(); g.lineWidth = 12; g.strokeStyle = '#e04b4b'; g.beginPath(); g.moveTo(x, 50); g.lineTo(x, 70); g.stroke(); rrect(g, x - 6, 70, 12, 10, 2, '#fff'); }
      g.lineWidth = 5; g.strokeStyle = DK;
    },
    pick(g) { line(g, 24, 90, 66, 34, 11, DK); line(g, 24, 90, 66, 34, 7, '#a56a35'); g.lineCap = 'round'; g.beginPath(); g.moveTo(26, 40); g.quadraticCurveTo(62, 6, 92, 42); g.lineWidth = 17; g.strokeStyle = DK; g.stroke(); g.lineWidth = 10; g.strokeStyle = '#d5dce2'; g.beginPath(); g.moveTo(26, 40); g.quadraticCurveTo(62, 6, 92, 42); g.stroke(); g.lineWidth = 5; g.strokeStyle = DK; },
    castle(g) { poly(g, [[18, 86], [18, 44], [26, 44], [26, 34], [38, 34], [38, 44], [44, 44], [44, 34], [56, 34], [56, 44], [62, 44], [62, 34], [74, 34], [74, 44], [82, 44], [82, 86]], '#d6cfbd'); g.beginPath(); g.arc(50, 86, 14, Math.PI, 0); g.closePath(); g.fillStyle = '#6b4426'; g.fill(); g.stroke(); },
    boom(g) { const p = []; for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8 - Math.PI / 2, r = i % 2 ? 22 : 44; p.push([50 + Math.cos(a) * r, 50 + Math.sin(a) * r]); } poly(g, p, '#ff9a1f'); circ(g, 50, 50, 14, '#ffe14d'); },
    bow(g) { g.lineCap = 'round'; g.beginPath(); g.arc(34, 50, 40, -1.1, 1.1); g.lineWidth = 12; g.strokeStyle = DK; g.stroke(); g.lineWidth = 7; g.strokeStyle = '#a56a35'; g.beginPath(); g.arc(34, 50, 40, -1.1, 1.1); g.stroke(); const ex = 34 + Math.cos(1.1) * 40, ey = 50 + Math.sin(1.1) * 40; line(g, ex, 50 - (ey - 50), ex, ey, 3, '#fff'); line(g, 22, 50, 92, 50, 7, DK); line(g, 22, 50, 92, 50, 4, '#e8dcc0'); poly(g, [[96, 50], [80, 42], [80, 58]], '#d5dce2'); },
    crowd(g) { for (const [x, c] of [[34, '#4aa3e0'], [66, '#2f7fc0']]) { rrect(g, x - 15, 54, 30, 32, 12, c); circ(g, x, 38, 13, '#f2c9a0'); } },
    coin(g) { circ(g, 50, 50, 38, '#ffd23f'); g.beginPath(); g.arc(50, 50, 28, 0, 7); g.lineWidth = 3; g.strokeStyle = '#c9961f'; g.stroke(); g.lineWidth = 5; g.strokeStyle = DK; g.font = '800 46px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#b87f00'; g.fillText('$', 50, 54); },
    cart(g) { line(g, 8, 22, 26, 22, 7, DK); line(g, 26, 22, 36, 62, 7, DK); poly(g, [[22, 30], [90, 30], [80, 62], [34, 62]], '#9fb5c9'); circ(g, 42, 78, 8, '#444'); circ(g, 72, 78, 8, '#444'); },
    walker(g) { circ(g, 56, 18, 11, '#f2c9a0'); g.lineCap = 'round'; line(g, 54, 30, 50, 58, 13, DK); line(g, 54, 30, 50, 58, 8, '#fff'); line(g, 50, 58, 34, 86, 13, DK); line(g, 50, 58, 34, 86, 8, '#fff'); line(g, 50, 58, 70, 84, 13, DK); line(g, 50, 58, 70, 84, 8, '#fff'); line(g, 52, 38, 72, 52, 11, DK); line(g, 52, 38, 72, 52, 6, '#fff'); },
    lock(g) { g.lineCap = 'round'; g.beginPath(); g.arc(50, 40, 20, Math.PI, 0); g.lineWidth = 12; g.strokeStyle = DK; g.stroke(); g.lineWidth = 6; g.strokeStyle = '#d5dce2'; g.beginPath(); g.arc(50, 40, 20, Math.PI, 0); g.stroke(); g.lineWidth = 5; g.strokeStyle = DK; rrect(g, 22, 42, 56, 44, 10, '#aeb6bd'); circ(g, 50, 62, 6, DK); },
    fire(g) { g.beginPath(); g.moveTo(50, 6); g.bezierCurveTo(88, 40, 90, 66, 70, 84); g.bezierCurveTo(56, 94, 30, 92, 22, 74); g.bezierCurveTo(14, 56, 34, 46, 38, 30); g.bezierCurveTo(46, 38, 44, 22, 50, 6); g.closePath(); g.fillStyle = '#ff7a1f'; g.fill(); g.stroke(); g.beginPath(); g.moveTo(50, 50); g.bezierCurveTo(68, 66, 66, 80, 52, 84); g.bezierCurveTo(38, 82, 34, 68, 50, 50); g.fillStyle = '#ffd84a'; g.fill(); },
    target(g) { circ(g, 50, 50, 40, '#fff'); circ(g, 50, 50, 28, '#e8433f'); circ(g, 50, 50, 16, '#fff'); circ(g, 50, 50, 7, '#e8433f'); },
    meat(g) {
      // стейк с косточкой: блестящее мясо, светлая жировая кромка и белые прожилки
      g.beginPath(); g.moveTo(12, 56); g.bezierCurveTo(6, 22, 48, 12, 78, 26); g.bezierCurveTo(98, 42, 88, 82, 56, 86); g.bezierCurveTo(28, 90, 14, 76, 12, 56); g.closePath();
      const gr = g.createLinearGradient(20, 14, 80, 88); gr.addColorStop(0, '#ff8a94'); gr.addColorStop(1, '#d1303f');
      g.fillStyle = gr; g.fill(); g.stroke();
      g.save(); g.clip();
      g.strokeStyle = '#ffd6da'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(18, 54); g.bezierCurveTo(10, 22, 48, 14, 76, 28); g.bezierCurveTo(94, 42, 86, 78, 56, 82); g.stroke();
      g.lineWidth = 3; g.strokeStyle = 'rgba(255,225,228,.85)';
      for (const [x1, y1, x2, y2] of [[36, 40, 58, 36], [32, 58, 62, 54], [44, 70, 66, 66]]) { g.beginPath(); g.moveTo(x1, y1); g.quadraticCurveTo((x1 + x2) / 2, y1 - 8, x2, y2); g.stroke(); }
      g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(34, 30, 14, 6, -0.5, 0, 7); g.fill();
      g.restore();
      g.lineWidth = 5; g.strokeStyle = DK;
      circ(g, 70, 56, 11, '#fff7e8'); line(g, 70, 56, 90, 78, 11, DK); line(g, 70, 56, 90, 78, 6, '#fff7e8'); circ(g, 92, 82, 6, '#fff7e8'); circ(g, 70, 56, 5, '#e8d9bd');
    },
    gold(g) { poly(g, [[34, 30], [78, 30], [90, 52], [22, 52]], '#ffe76a'); poly(g, [[22, 52], [90, 52], [96, 80], [14, 80]], '#f2a900'); line(g, 40, 38, 70, 38, 4, 'rgba(255,255,255,.8)'); line(g, 26, 60, 50, 60, 4, 'rgba(255,255,255,.55)'); },
    cash(g) {
      // пачка из двух купюр: дальняя чуть повёрнута, ближняя с рамкой, кругом и знаком доллара
      g.save(); g.translate(50, 50); g.rotate(-0.16);
      rrect(g, -42, -26, 84, 50, 8, '#2f9e4a'); g.restore();
      const gr = g.createLinearGradient(0, 28, 0, 78); gr.addColorStop(0, '#86e496'); gr.addColorStop(1, '#3fb35d');
      rrect(g, 8, 26, 84, 52, 9, gr);
      g.lineWidth = 2.6; g.strokeStyle = '#d6ffde'; g.beginPath(); g.roundRect(14, 32, 72, 40, 5); g.stroke();
      g.lineWidth = 5; g.strokeStyle = DK;
      circ(g, 50, 52, 15, '#2b8f46');
      g.fillStyle = '#eafff0'; g.font = '800 24px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 0; g.fillText('$', 50, 54); g.lineWidth = 5;
      g.fillStyle = '#d6ffde'; for (const [x, y] of [[22, 42], [78, 42], [22, 62], [78, 62]]) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
    },
    basket(g) {
      // плетёная корзина с кусками мяса сверху
      for (const [x, y, c] of [[34, 36, '#e0525f'], [58, 34, '#d1303f'], [46, 28, '#ff7b86']]) { g.beginPath(); g.ellipse(x, y, 17, 13, 0, 0, 7); g.fillStyle = c; g.fill(); g.stroke(); }
      g.beginPath(); g.moveTo(14, 44); g.lineTo(86, 44); g.lineTo(76, 88); g.lineTo(24, 88); g.closePath(); g.fillStyle = '#c99556'; g.fill(); g.stroke();
      g.lineWidth = 3; g.strokeStyle = '#8d5f2b';
      for (let y = 54; y < 88; y += 10) { g.beginPath(); g.moveTo(18, y); g.lineTo(82, y); g.stroke(); }
      for (let x = 28; x < 80; x += 12) { g.beginPath(); g.moveTo(x, 46); g.lineTo(x + (x - 50) * 0.18, 88); g.stroke(); }
      g.lineWidth = 5; g.strokeStyle = DK;
    },
    gear(g) { for (let i = 0; i < 8; i++) { g.save(); g.translate(50, 50); g.rotate(i * Math.PI / 4); rrect(g, -9, -46, 18, 22, 4, '#c9d1d8'); g.restore(); } circ(g, 50, 50, 32, '#c9d1d8'); circ(g, 50, 50, 13, '#5b6672'); },
    trophy(g) { g.lineWidth = 5; g.beginPath(); g.arc(22, 36, 14, Math.PI * 0.5, Math.PI * 1.5); g.stroke(); g.beginPath(); g.arc(78, 36, 14, -Math.PI * 0.5, Math.PI * 0.5); g.stroke(); poly(g, [[26, 12], [74, 12], [68, 52], [32, 52]], '#ffd23f'); rrect(g, 44, 52, 12, 18, 2, '#e0a800'); rrect(g, 30, 70, 40, 14, 4, '#c9961f'); },
    skull(g) { circ(g, 50, 44, 32, '#f3f0e8'); rrect(g, 34, 66, 32, 22, 6, '#f3f0e8'); circ(g, 38, 46, 8, DK); circ(g, 62, 46, 8, DK); poly(g, [[50, 54], [45, 64], [55, 64]], DK); }
  };

  // Рисует иконку name в центре (cx, cy) размером size на 2D-контексте g
  SG.drawIcon = function (g, name, cx, cy, size) {
    const f = D[name]; if (!f) return;
    g.save();
    g.translate(cx - size / 2, cy - size / 2); g.scale(size / 100, size / 100);
    g.lineWidth = 5; g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = DK;
    f(g);
    g.restore();
  };

  // Для обычной вёрстки: картинка-иконка (кэшируется как dataURL)
  const cache = {};
  SG.iconURL = function (name) {
    if (cache[name]) return cache[name];
    const c = document.createElement('canvas'); c.width = c.height = 96;
    SG.drawIcon(c.getContext('2d'), name, 48, 48, 88);
    return (cache[name] = c.toDataURL ? c.toDataURL('image/png') : '');
  };
  SG.iconImg = function (name) {
    const i = document.createElement('img'); i.className = 'ico'; i.alt = ''; i.src = SG.iconURL(name); return i;
  };
  // Подставляет иконки в разметку: <img data-ico="log">
  SG.applyIcons = function (root) {
    (root || document).querySelectorAll('[data-ico]').forEach(e => { e.src = SG.iconURL(e.getAttribute('data-ico')); });
  };
})();
