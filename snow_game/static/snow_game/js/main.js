(function () {
  'use strict';
  const SG = window.SG;
  SG.load();

  function start() {
    SG.G.init();
    SG.R.init(document.getElementById('c'));
    SG.UI.init();
    let last = performance.now();
    // Микро-счётчик FPS в правом нижнем углу. Нажатие — подробности: сколько мс процессор тратит на логику
    // и на подготовку кадра, и сколько вызовов отрисовки. Если «логика + кадр» заметно меньше времени между
    // кадрами, а FPS низкий — упираемся в видеокарту; если близко — в процессор.
    const fpsEl = document.getElementById('fps');
    let fpsDetail = false, fAcc = 0, fN = 0, msL = 0, msR = 0;
    fpsEl.onclick = () => { fpsDetail = !fpsDetail; };
    function loop(now) {
      const real = (now - last) / 1000, dt = Math.min(0.05, real); last = now;
      const t0 = performance.now();
      SG.G.update(dt, SG.UI.input());
      SG.UI.hud();
      const t1 = performance.now();
      SG.R.frame(dt);
      const t2 = performance.now();
      if (real < 0.5) { fAcc += real; fN++; msL += t1 - t0; msR += t2 - t1; } // долгие паузы (вкладка в фоне) не считаем
      if (fAcc >= 0.5) {
        const fps = Math.round(fN / fAcc);
        fpsEl.textContent = fpsDetail
          ? fps + ' fps · логика ' + (msL / fN).toFixed(1) + ' · кадр ' + (msR / fN).toFixed(1) + ' мс · ' + SG.R.drawInfo().calls + ' выз.'
          : String(fps);
        fAcc = fN = msL = msR = 0;
      }
      requestAnimationFrame(loop);
    }
    addEventListener('resize', () => SG.R.resize());
    setInterval(SG.save, 3000);
    setInterval(() => SG.cloud.push(false), 15000);
    addEventListener('visibilitychange', () => { SG.save(); if (document.hidden) SG.cloud.push(true); });
    addEventListener('pagehide', () => { SG.save(); SG.cloud.push(true); });
    requestAnimationFrame(loop);
  }

  // Сначала спрашиваем сервер (не дольше 3.5 с), потом стартуем — чтобы не играть на устаревшем прогрессе
  Promise.race([SG.cloud.pull(), new Promise(r => setTimeout(r, 3500))]).then(start, start);
})();
