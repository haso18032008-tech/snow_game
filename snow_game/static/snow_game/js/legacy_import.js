// ВРЕМЕННЫЙ файл: разовый перенос локального прогресса со старого адреса (внутри Финстата).
// localStorage привязан к домену, поэтому при переезде игра «забыла бы» прогресс тех, кто играл без аккаунта.
// Старая страница кладёт состояние в #import=..., здесь оно один раз попадает в localStorage.
// Когда переезд закончится, файл и его <script> в index.html можно просто удалить.
// Выполняется ДО cloud.js и main.js, то есть до первой загрузки состояния.
(function () {
  'use strict';
  const m = location.hash.match(/^#import=(.+)$/);
  if (!m) return;
  try {
    const raw = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1])))));
    if (raw && typeof raw === 'object' && typeof raw.lv === 'object') {
      let cur = null;
      try { cur = JSON.parse(localStorage.getItem('snowfarm3') || 'null'); } catch (e) { /* битое — перезапишем */ }
      // чужой прогресс на этом домене не затираем, если здесь уже заработано больше
      if (!cur || (cur.earned || 0) < (raw.earned || 0)) localStorage.setItem('snowfarm3', JSON.stringify(raw));
    }
  } catch (e) { /* не наш формат — игнорируем */ }
  // убираем хвост из адресной строки, чтобы закладка и «Поделиться» не несли сохранение
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* не страшно */ }
})();
