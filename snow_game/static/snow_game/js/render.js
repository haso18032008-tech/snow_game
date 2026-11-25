// 3D-отрисовка (Three.js r149, глобальный THREE). Читает состояние из SG.G и ничего в нём не меняет.
(function () {
  'use strict';
  const SG = window.SG;
  const R = (SG.R = {});
  let renderer, scene, camera, canvas;
  const camTarget = { x: 0, z: 5 };
  let camDist = 50;

  const MAT = {};
  const mat = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.9, metalness: 0, flatShading: true }, o || {}));
  const GEO = {
    box: new THREE.BoxGeometry(1, 1, 1),
    sph: new THREE.SphereGeometry(1, 10, 8),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
    cone: new THREE.ConeGeometry(1, 1, 7),
    cap: new THREE.CapsuleGeometry(0.42, 0.55, 3, 8),
    plane: new THREE.PlaneGeometry(1, 1)
  };
  function mesh(g, m, x, y, z, sx, sy, sz) {
    const o = new THREE.Mesh(g, m);
    o.position.set(x || 0, y || 0, z || 0);
    o.scale.set(sx == null ? 1 : sx, sy == null ? (sx == null ? 1 : sx) : sy, sz == null ? (sx == null ? 1 : sx) : sz);
    return o;
  }
  // сливаем геометрии с вершинными цветами в одну (для инстансов деревьев)
  function merge(parts) {
    const pos = [], nor = [], col = [];
    for (const p of parts) {
      const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
      g.computeVertexNormals();
      const a = g.attributes.position, n = g.attributes.normal;
      for (let i = 0; i < a.count; i++) {
        pos.push(a.getX(i), a.getY(i), a.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i));
        const c = p.color(a.getY(i));
        col.push(c[0], c[1], c[2]);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return g;
  }
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  function canvasTex(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false; // без мипмапов: проще и работает с любым размером
    return { c, g: c.getContext('2d'), tex };
  }

  // ---------- персонажи ----------
  // Человечек в парке с меховым капюшоном (как в рекламе): тело, пояс, голова с глазами и носом,
  // меховая опушка, руки-варежки и ноги в сапогах. hat — цвет шапки (рабочие/сборщики), beard — борода героя.
  function makeHuman(body, hood, beard, hat) {
    const g = new THREE.Group(), bodyG = new THREE.Group();
    const bm = mat(body, { flatShading: false }), hm = mat(hood, { flatShading: false }), skin = mat('#f2c9a0', { flatShading: false });
    const fur = mat('#fbfbf7', { flatShading: false }), dark = mat('#2b2420', { flatShading: false }), boot = mat('#4a3426');
    bodyG.add(mesh(GEO.cap, bm, 0, 1.02, 0, 1.08, 1.0, 0.9));                       // [0] торс
    bodyG.add(mesh(GEO.cyl, bm, 0, 0.66, 0, 0.5, 0.2, 0.46));                       // подол парки
    bodyG.add(mesh(GEO.box, mat('#6b4a2c'), 0, 1.0, 0, 0.98, 0.11, 0.78));            // ремень
    bodyG.add(mesh(GEO.box, mat('#ffcf4a'), 0, 1.0, 0.4, 0.18, 0.14, 0.05));          // пряжка
    bodyG.add(mesh(GEO.sph, skin, 0, 1.86, 0.1, 0.3));                              // лицо
    bodyG.add(mesh(GEO.sph, hm, 0, 1.94, -0.1, 0.46, 0.43, 0.42));                  // капюшон
    const trim = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.1, 8, 18), fur);     // меховая опушка вокруг лица
    trim.position.set(0, 1.87, 0.17); bodyG.add(trim);
    for (const s of [-1, 1]) bodyG.add(mesh(GEO.sph, dark, s * 0.11, 1.9, 0.37, 0.045));  // глаза
    bodyG.add(mesh(GEO.sph, mat('#e8a58a'), 0, 1.81, 0.4, 0.055));                   // нос
    if (beard) { bodyG.add(mesh(GEO.sph, fur, 0, 1.6, 0.3, 0.25, 0.21, 0.17)); bodyG.add(mesh(GEO.sph, fur, 0, 1.72, 0.38, 0.17, 0.05, 0.05)); }
    if (hat) { bodyG.add(mesh(GEO.sph, mat(hat, { flatShading: false }), 0, 2.2, -0.02, 0.4, 0.2, 0.4)); bodyG.add(mesh(GEO.cyl, mat(hat), 0, 2.1, 0.0, 0.43, 0.06, 0.43)); }
    const arms = [], legs = [];
    for (const s of [-1, 1]) {
      const arm = new THREE.Group(); arm.position.set(s * 0.56, 1.42, 0);
      arm.add(mesh(GEO.cap, bm, 0, -0.34, 0, 0.3, 0.7, 0.3));
      arm.add(mesh(GEO.sph, fur, 0, -0.72, 0, 0.17));                               // варежка
      bodyG.add(arm); arms.push(arm);
      const lg = new THREE.Group(); lg.position.set(s * 0.21, 0.6, 0);
      lg.add(mesh(GEO.box, mat('#3d3a4a'), 0, -0.22, 0, 0.26, 0.5, 0.28));
      lg.add(mesh(GEO.box, boot, 0, -0.5, 0.06, 0.3, 0.2, 0.44));                  // сапог
      lg.add(mesh(GEO.cyl, fur, 0, -0.38, 0, 0.17, 0.06, 0.17));                   // меховая отделка
      bodyG.add(lg); legs.push(lg);
    }
    g.add(bodyG);
    g.userData = { legs, arms, body: bodyG };
    g.scale.setScalar(1.18);
    return g;
  }
  function animHuman(h, walk, t) {
    const u = h.userData, a = walk ? Math.sin(t * 14) * 0.7 : 0;
    u.legs[0].rotation.x = a; u.legs[1].rotation.x = -a;
    u.arms[0].rotation.x = -a * 0.7; u.arms[1].rotation.x = a * 0.7;
    u.body.position.y = walk ? Math.abs(Math.sin(t * 14)) * 0.08 : 0;
  }
  function shadow(r) {
    const m = mesh(GEO.cyl, MAT.shadow, 0, 0.06, 0, r, 0.02, r);
    m.renderOrder = 3;
    return m;
  }

  // Редкий моб — жёлтый смайлик: шар, два чёрных овала-глаза и улыбка
  function makeSmiley() {
    const g = new THREE.Group(), inner = new THREE.Group();
    inner.add(mesh(new THREE.SphereGeometry(1.5, 28, 20), mat('#ffd60a', { flatShading: false, emissive: new THREE.Color('#4a3a00') }), 0, 1.5, 0));
    // лицо наклонено вверх, потому что камера смотрит сверху — иначе глаза уезжают на «подбородок»
    const eye = mat('#16140f', { flatShading: false }), face = new THREE.Group();
    face.position.set(0, 1.5, 0); face.rotation.x = -0.62;
    for (const s of [-1, 1]) face.add(mesh(GEO.sph, eye, s * 0.52, 0.5, 1.36, 0.2, 0.37, 0.14));
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.09, 8, 28, Math.PI), eye);
    smile.rotation.z = Math.PI; smile.position.set(0, 0.0, 1.3); smile.scale.set(1, 0.8, 1); face.add(smile);
    inner.add(face);
    g.add(inner, shadow(1.9));
    g.userData = { legs: [], inner };
    return g;
  }
  function makeBear(kind) {
    if (kind === 4) return makeSmiley();
    const K = SG.KINDS[kind];
    const g = new THREE.Group(), inner = new THREE.Group();
    const fur = kind === 3 ? '#cfe8ff' : '#f4f1ea', dark = kind === 3 ? '#a9cdee' : '#e2ddd0';
    const fm = mat(fur), dm = mat(dark);
    inner.add(mesh(GEO.sph, fm, 0, 1.25, 0, 1.0, 0.85, 1.6));
    inner.add(mesh(GEO.sph, fm, 0, 1.6, 1.55, 0.72));
    inner.add(mesh(GEO.sph, mat('#d9c8a8'), 0, 1.42, 2.15, 0.36, 0.3, 0.38));
    inner.add(mesh(GEO.sph, mat('#1a1212'), 0, 1.5, 2.5, 0.12));
    for (const s of [-1, 1]) {
      inner.add(mesh(GEO.sph, dm, s * 0.5, 2.25, 1.35, 0.22));
      inner.add(mesh(GEO.sph, mat('#1a1212'), s * 0.28, 1.8, 2.12, 0.07));
    }
    const legs = [];
    for (const [x, z] of [[-0.6, -0.9], [0.6, -0.9], [-0.6, 0.9], [0.6, 0.9]]) {
      const lg = new THREE.Group(); lg.position.set(x, 0.9, z);
      lg.add(mesh(GEO.box, dm, 0, -0.45, 0, 0.5, 0.95, 0.5));
      inner.add(lg); legs.push(lg);
    }
    if (kind >= 1 && kind <= 3) {
      const sm = mat('#9aa3ad');
      for (let i = 0; i < 8; i++) inner.add(mesh(GEO.cone, sm, 0, 2.15 + (i % 2) * 0.05, -1.2 + i * 0.4, 0.2, 0.8, 0.2));
    }
    if (kind === 2 || kind === 3) {
      const hm = mat('#e8e0c8');
      for (const s of [-1, 1]) {
        const h = mesh(GEO.cone, hm, s * 0.45, 2.55, 1.5, 0.17, 1.2, 0.17);
        h.rotation.z = -s * 0.5; inner.add(h);
      }
    }
    g.add(inner, shadow(1.7 * K.scale));
    inner.scale.setScalar(K.scale);
    g.userData = { legs, inner };
    return g;
  }

  function makeTurret() {
    const g = new THREE.Group(), wood = mat('#8a5a30');
    g.add(mesh(GEO.box, mat('#cfc7b8'), 0, 0.3, 0, 2.2, 0.6, 2.2));
    for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) g.add(mesh(GEO.box, wood, x, 1.9, z, 0.22, 2.6, 0.22));
    g.add(mesh(GEO.box, mat('#b07840'), 0, 3.2, 0, 2.0, 0.2, 2.0));
    const bow = new THREE.Group(); bow.position.set(0, 3.6, 0);
    bow.add(mesh(GEO.box, wood, 0, 0, 0.3, 0.25, 0.2, 1.8));
    bow.add(mesh(GEO.box, mat('#4a7ea8'), 0, 0, 0.9, 1.9, 0.15, 0.2));
    bow.add(mesh(GEO.box, mat('#ffb347'), 0, 0.12, 0.6, 0.08, 0.08, 1.3));
    g.add(bow); g.userData.bow = bow;
    return g;
  }

  // ---------- инициализация ----------
  R.init = function (cv) {
    canvas = cv;
    renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
    R.setQuality(SG.S.quality);
    scene = new THREE.Scene();
    const fogC = new THREE.Color('#dff0fb');
    scene.background = fogC;
    scene.fog = new THREE.Fog(fogC, 50, 105);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb9cfe6, 0.62));
    const sun = new THREE.DirectionalLight(0xfff4e0, 0.5); sun.position.set(30, 60, 20); scene.add(sun);
    camera = new THREE.PerspectiveCamera(SG.CAM.fov, 1, 1, 500);

    MAT.shadow = new THREE.MeshBasicMaterial({ color: 0x1c3a5c, transparent: true, opacity: 0.22, depthWrite: false });
    // Ресурсы с «настоящими» текстурами: торцы брёвен с годовыми кольцами, купюры с узором, стейки с прожилками
    const bark = canvasTex(64, 64), bg = bark.g;
    bg.fillStyle = '#9a6330'; bg.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 26; i++) { bg.fillStyle = i % 3 ? 'rgba(70,40,15,.55)' : 'rgba(210,150,80,.35)'; bg.fillRect(Math.random() * 64, 0, 1 + Math.random() * 3, 64); }
    const ring = canvasTex(128, 128), rg = ring.g;
    rg.fillStyle = '#e9bf84'; rg.fillRect(0, 0, 128, 128);
    for (let q = 60, k = 0; q > 4; q -= 8, k++) { rg.strokeStyle = k % 2 ? '#c48848' : '#dba66a'; rg.lineWidth = 3; rg.beginPath(); rg.arc(64, 64, q, 0, 7); rg.stroke(); }
    rg.fillStyle = '#9d5f29'; rg.beginPath(); rg.arc(64, 64, 5, 0, 7); rg.fill();
    const bill = canvasTex(128, 128), bl = bill.g;
    bl.fillStyle = '#4dc268'; bl.fillRect(0, 0, 128, 128);
    bl.strokeStyle = '#cdf8d6'; bl.lineWidth = 6; bl.strokeRect(10, 20, 108, 88);
    bl.fillStyle = '#2f9a4d'; bl.beginPath(); bl.arc(64, 64, 26, 0, 7); bl.fill(); bl.stroke();
    bl.fillStyle = '#e6ffe9'; bl.font = '800 40px Arial, sans-serif'; bl.textAlign = 'center'; bl.textBaseline = 'middle'; bl.fillText('$', 64, 66);
    const meatT = canvasTex(128, 128), mg = meatT.g;
    const grad = mg.createRadialGradient(64, 64, 8, 64, 64, 70); grad.addColorStop(0, '#ff6b78'); grad.addColorStop(0.75, '#d93a4a'); grad.addColorStop(1, '#ffd9dc');
    mg.fillStyle = grad; mg.fillRect(0, 0, 128, 128);
    mg.strokeStyle = 'rgba(255,225,228,.8)'; mg.lineWidth = 4; mg.lineCap = 'round';
    for (let i = 0; i < 6; i++) { mg.beginPath(); mg.moveTo(20 + i * 17, 30 + (i % 2) * 20); mg.quadraticCurveTo(40 + i * 12, 64, 28 + i * 16, 100); mg.stroke(); }
    const sideG = mat('#2c8a43');
    MAT.cashMats = [sideG, sideG, mat('#fff', { map: bill.tex }), mat('#2c8a43'), sideG, sideG];
    MAT.green = MAT.cashMats; MAT.red = mat('#c22d2d');
    MAT.logA = [mat('#fff', { map: bark.tex }), mat('#fff', { map: ring.tex }), mat('#fff', { map: ring.tex })]; MAT.logB = MAT.logA;
    MAT.fish = mat('#cfe3ee', { flatShading: false }); MAT.meat = mat('#fff', { map: meatT.tex, flatShading: false, roughness: 0.55 }); MAT.gold = mat('#ffcc2e', { emissive: new THREE.Color('#6b4b00') });

    buildGround(); buildTrees(); buildGiants(); buildOres(); buildBase(); buildStalls(); buildFish(); buildShip(); buildSea(); buildPads(); buildFire(); buildSnow();
    buildPlayer(); buildPools();
    R.resize();
    R.rebuildBase();
  };
  R.setQuality = function (q) {
    renderer.setPixelRatio(q === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    if (renderer.setSize && canvas) renderer.setSize(window.innerWidth, window.innerHeight, false);
  };
  R.drawInfo = () => renderer.info.render; // счётчик вызовов отрисовки для микро-FPS в углу
  R.resize = function () {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camDist = SG.CAM.dist;
    // туман «белой мглы»: дальняя земля (верх экрана) растворяется в белом
    scene.fog.near = camDist * 0.85; scene.fog.far = camDist * 1.85;
    camera.updateProjectionMatrix();
  };
  R.project = function (x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(camera);
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
  };

  // ---------- земля ----------
  function buildGround() {
    // снег: почти белый, с мягкими голубоватыми пятнами (тайл, повторяется)
    const T = canvasTex(512, 512), g = T.g;
    g.fillStyle = '#f2f8fd'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 220; i++) {
      const x = Math.random() * 512, y = Math.random() * 512, r = 20 + Math.random() * 70, blue = Math.random() < 0.65;
      for (const dx of [-512, 0, 512]) for (const dy of [-512, 0, 512]) {
        const cx = x + dx, cy = y + dy;
        if (cx + r < 0 || cx - r > 512 || cy + r < 0 || cy - r > 512) continue;
        const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
        gr.addColorStop(0, blue ? 'rgba(176,205,236,0.20)' : 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
    }
    T.tex.wrapS = T.tex.wrapT = THREE.RepeatWrapping; T.tex.repeat.set(30, 30);
    const gr = mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: T.tex }), 0, 0, 0, 900, 900, 1);
    gr.rotation.x = -Math.PI / 2; scene.add(gr);

    // ледяные дорожки покупателей: светло-голубые с обводкой
    const L = canvasTex(128, 512), lg = L.g;
    lg.fillStyle = '#d3e5f7'; lg.strokeStyle = '#a9c6e8'; lg.lineWidth = 8;
    lg.beginPath(); lg.roundRect(6, 6, 116, 500, 56); lg.fill(); lg.stroke();
    const lm = new THREE.MeshBasicMaterial({ map: L.tex, transparent: true, depthWrite: false });
    for (const st of SG.G.stalls) {
      if (st.remote) continue;
      const l = mesh(GEO.plane, lm, st.x + 0.8, 0.04, 36, 4.4, 46, 1); l.renderOrder = 2; l.rotation.x = -Math.PI / 2; scene.add(l);
    }
    buildWater();
  }
  // Озеро восточного биома: ледяная кромка у берега и вода с бегущей рябью (текстуру двигаем в R.frame)
  let waterTex;
  function buildWater() {
    const L = SG.LAKE, W = canvasTex(256, 256), wg = W.g;
    wg.fillStyle = '#74b9e3'; wg.fillRect(0, 0, 256, 256);
    wg.lineCap = 'round';
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * 256, y = Math.random() * 256, l = 14 + Math.random() * 26;
      wg.strokeStyle = Math.random() < 0.7 ? 'rgba(255,255,255,.30)' : 'rgba(40,110,170,.22)'; wg.lineWidth = 2 + Math.random() * 2;
      for (const dx of [-256, 0, 256]) { wg.beginPath(); wg.moveTo(x + dx - l / 2, y); wg.quadraticCurveTo(x + dx, y - 4, x + dx + l / 2, y); wg.stroke(); }
    }
    W.tex.wrapS = W.tex.wrapT = THREE.RepeatWrapping; W.tex.repeat.set(60, 36);
    const wd = 300, dp = L.z1 - L.z0, cz = (L.z0 + L.z1) / 2;
    const ice = mesh(GEO.plane, new THREE.MeshBasicMaterial({ color: '#cfe6f6' }), L.x - 3 + (wd + 3) / 2, 0.03, cz, wd + 3, dp + 6, 1);
    ice.rotation.x = -Math.PI / 2; scene.add(ice);
    const water = mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: W.tex }), L.x + wd / 2, 0.045, cz, wd, dp, 1);
    water.rotation.x = -Math.PI / 2; scene.add(water);
    waterTex = W.tex;
  }
  // падающий снег
  let snow, snowPos;
  function buildSnow() {
    const n = 320; snowPos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { snowPos[i * 3] = (Math.random() - 0.5) * 70; snowPos[i * 3 + 1] = Math.random() * 40; snowPos[i * 3 + 2] = (Math.random() - 0.5) * 70; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(snowPos.slice(), 3));
    snow = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.28, transparent: true, opacity: 0.9, fog: false, depthWrite: false }));
    snow.frustumCulled = false; scene.add(snow);
  }
  function syncSnow(dt) {
    const a = snow.geometry.attributes.position.array, t = SG.G.t;
    for (let i = 0; i < snowPos.length; i += 3) {
      snowPos[i + 1] -= dt * 2.6; snowPos[i] += Math.sin(t + i) * dt * 0.4;
      if (snowPos[i + 1] < 0) snowPos[i + 1] += 40;
      a[i] = camTarget.x + snowPos[i]; a[i + 1] = snowPos[i + 1]; a[i + 2] = camTarget.z + snowPos[i + 2];
    }
    snow.geometry.attributes.position.needsUpdate = true;
  }

  // ---------- деревья ----------
  let treeIM, stumpIM, treeGeo, treeMatV, giantIM, giantStumpIM;
  const tm = new THREE.Matrix4(), tq = new THREE.Quaternion(), tp = new THREE.Vector3(), ts = new THREE.Vector3(), tyAxis = new THREE.Vector3(0, 1, 0), tEu = new THREE.Euler();
  function buildTrees() {
    // каждый ярус: тёмно-голубая «юбка» снизу, светлеет к верху; верхние ярусы почти белые
    const dark = [0.40, 0.62, 0.84], light = [0.90, 0.96, 1.0];
    const parts = [];
    [[0.5, 2.1, 2.3, 0.0], [1.9, 1.9, 1.85, 0.2], [3.2, 1.7, 1.4, 0.4], [4.4, 1.6, 0.95, 0.6]].forEach(([y, h, r, lift]) => {
      const geo = new THREE.ConeGeometry(r, h, 8); geo.translate(0, y + h / 2, 0);
      parts.push({ geo, color: yy => { const t = Math.max(0, Math.min(1, (yy - y) / h)); return lerp3(lerp3(dark, light, lift), light, t * 0.75); } });
    });
    const trunk = new THREE.CylinderGeometry(0.3, 0.4, 0.9, 6); trunk.translate(0, 0.45, 0);
    parts.push({ geo: trunk, color: () => [0.42, 0.3, 0.26] });
    const g = merge(parts);
    treeGeo = g; treeMatV = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
    treeIM = new THREE.InstancedMesh(g, treeMatV, SG.G.trees.length);
    stumpIM = new THREE.InstancedMesh(GEO.cyl, mat('#d9ad78'), SG.G.trees.length);
    for (const t of SG.G.trees) t.dirty = true;
    scene.add(treeIM, stumpIM);
  }
  function syncTrees() {
    let any = false;
    for (const t of SG.G.trees) {
      if (!t.dirty) continue;
      t.dirty = false; any = true;
      const alive = t.hp > 0 && !t.off;
      tp.set(t.x, 0, t.z);
      const wob = t.shake > 0 ? Math.sin(SG.G.t * 45) * t.shake * 0.25 : 0;
      tEu.set(wob, t.rot, wob * 0.6); tq.setFromEuler(tEu);
      ts.setScalar(alive ? t.s : 0.0001);
      tm.compose(tp, tq, ts); treeIM.setMatrixAt(t.i, tm);
      const stump = !alive && !t.off;
      tp.set(t.x, 0.3, t.z); tq.identity(); ts.set(stump ? 0.45 : 0.0001, stump ? 0.3 : 0.0001, stump ? 0.45 : 0.0001);
      tm.compose(tp, tq, ts); stumpIM.setMatrixAt(t.i, tm);
    }
    if (any) { treeIM.instanceMatrix.needsUpdate = true; stumpIM.instanceMatrix.needsUpdate = true; }
  }

  // Гигантские деревья: та же модель, но втрое крупнее и чуть темнее; срубленный гигант оставляет широкий пень
  function buildGiants() {
    const n = SG.G.giants.length, c = new THREE.Color(0.8, 0.88, 0.95);
    giantIM = new THREE.InstancedMesh(treeGeo, treeMatV, n);
    for (let i = 0; i < n; i++) giantIM.setColorAt(i, c);
    giantStumpIM = new THREE.InstancedMesh(GEO.cyl, mat('#d9ad78'), n);
    for (const g of SG.G.giants) g.dirty = true;
    scene.add(giantIM, giantStumpIM);
  }
  function syncGiants() {
    let any = false;
    for (const t of SG.G.giants) {
      if (!t.dirty) continue;
      t.dirty = false; any = true;
      const alive = t.hp > 0;
      tp.set(t.x, 0, t.z);
      const wob = t.shake > 0 ? Math.sin(SG.G.t * 45) * t.shake * 0.12 : 0;
      tEu.set(wob, t.rot, wob * 0.6); tq.setFromEuler(tEu);
      ts.setScalar(alive ? t.s : 0.0001);
      tm.compose(tp, tq, ts); giantIM.setMatrixAt(t.i, tm);
      tp.set(t.x, 0.45, t.z); tq.identity(); ts.set(alive ? 0.0001 : 1.0, alive ? 0.0001 : 0.45, alive ? 0.0001 : 1.0);
      tm.compose(tp, tq, ts); giantStumpIM.setMatrixAt(t.i, tm);
    }
    if (any) { giantIM.instanceMatrix.needsUpdate = true; giantStumpIM.instanceMatrix.needsUpdate = true; }
  }

  // ---------- золотая руда ----------
  const oreMeshes = [];
  function buildOres() {
    const rock = mat('#ffc933', { emissive: new THREE.Color('#5a3d00') }), dark = mat('#5d5564');
    for (const o of SG.G.ores) {
      const g = new THREE.Group();
      g.add(mesh(new THREE.IcosahedronGeometry(1, 0), rock, 0, 1.4, 0, 2.2, 2.2, 1.9));
      g.add(mesh(new THREE.IcosahedronGeometry(1, 0), rock, 1.9, 0.8, 0.7, 1.2));
      g.add(mesh(new THREE.IcosahedronGeometry(1, 0), dark, -1.8, 0.7, 0.6, 1.1, 1.0, 1.1));
      g.add(mesh(GEO.cyl, mat('#e9d9a0'), 0, 0.15, 0, 3.6, 0.3, 3.6));
      g.position.set(o.x, 0, o.z); scene.add(g); oreMeshes.push(g);
    }
  }
  function syncOres() {
    SG.G.ores.forEach((o, i) => {
      const g = oreMeshes[i]; if (!o.dirty && !(o.shake > 0)) return;
      o.dirty = false;
      g.visible = o.hp > 0;
      const k = o.shake > 0 ? 1 + Math.sin(SG.G.t * 50) * 0.06 : 1;
      g.scale.set(k, k, k);
    });
  }

  // ---------- база: площадка, забор, ворота ----------
  let baseMesh, postIM, tipIM, capIM, gateGroup;
  function buildBase() {
    baseMesh = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
    // Прозрачные слои без записи глубины сортируются по расстоянию до центра объекта, и огромная земля базы
    // перекрывала плитки, лежащие дальше её центра. Поэтому порядок задан явно: база -> дорожки -> плитки -> кольцо.
    baseMesh.renderOrder = 1;
    baseMesh.rotation.x = -Math.PI / 2; baseMesh.position.y = 0.06; scene.add(baseMesh);
    postIM = new THREE.InstancedMesh(GEO.box, mat('#c97a44'), 800);
    tipIM = new THREE.InstancedMesh(GEO.cone, mat('#c97a44'), 800);
    capIM = new THREE.InstancedMesh(GEO.cone, mat('#ffffff'), 800);
    scene.add(postIM, tipIM, capIM);
    gateGroup = new THREE.Group(); scene.add(gateGroup);
  }
  // Земля базы — терракотовая с размытым краем, как в рекламе (рисуем в канвас под текущий размер)
  function paintBase(w, d) {
    const ppu = 14, W = Math.min(2048, Math.round((w + 12) * ppu)), H = Math.min(2048, Math.round((d + 12) * ppu));
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.shadowColor = '#d98450'; g.shadowBlur = 3.2 * ppu; g.fillStyle = '#d98450';
    const ins = 4.2 * ppu; g.fillRect(ins, ins, W - 2 * ins, H - 2 * ins);
    g.shadowBlur = 0; g.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,210,170,0.06)' : 'rgba(150,70,30,0.05)';
      g.beginPath(); g.arc(Math.random() * W, Math.random() * H, 2 + Math.random() * 6, 0, 7); g.fill();
    }
    const tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    if (baseMesh.material.map) baseMesh.material.map.dispose();
    baseMesh.material.map = tex; baseMesh.material.needsUpdate = true;
  }
  R.rebuildBase = function () {
    const b = SG.G.bounds, cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const w = b.maxX - b.minX, d = b.maxZ - b.minZ;
    baseMesh.scale.set(w + 12, d + 12, 1); baseMesh.position.set(cx, 0.06, cz);
    paintBase(w, d);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    let n = 0;
    const post = (x, z) => {
      if (n >= 800) return;
      q.identity();
      p.set(x, 1.1, z); s.set(0.62, 2.2, 0.62); m.compose(p, q, s); postIM.setMatrixAt(n, m);
      p.set(x, 2.6, z); s.set(0.46, 0.8, 0.46); m.compose(p, q, s); tipIM.setMatrixAt(n, m);
      p.set(x, 2.95, z); s.set(0.3, 0.4, 0.3); m.compose(p, q, s); capIM.setMatrixAt(n, m); n++;
    };
    const step = 0.62;
    for (let x = b.minX; x <= b.maxX + 0.01; x += step) { if (!SG.gapOK('N', x)) post(x, b.minZ); if (!SG.gapOK('S', x)) post(x, b.maxZ); }
    for (let z = b.minZ + step; z < b.maxZ; z += step) { if (!SG.gapOK('W', z)) post(b.minX, z); if (!SG.gapOK('E', z)) post(b.maxX, z); }
    postIM.count = tipIM.count = capIM.count = n;
    postIM.instanceMatrix.needsUpdate = tipIM.instanceMatrix.needsUpdate = capIM.instanceMatrix.needsUpdate = true;
    // Ворота: два высоких столба со снежными шапками, балка поверх, а створки — красные, с оранжевой рамой и
    // крестовиной, распахнуты. Строим в локальных координатах (ось x вдоль проёма), потом поворачиваем.
    while (gateGroup.children.length) gateGroup.remove(gateGroup.children[0]);
    const red = mat('#c0392b'), frame = mat('#f0953a'), wood = mat('#7d4f2b'), snow = mat('#ffffff', { flatShading: false }), gold = mat('#ffd23f');
    const gate = (x, z, rotY) => {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY;
      for (const s of [-1, 1]) {
        g.add(mesh(GEO.box, wood, s * 2.45, 1.8, 0, 0.95, 3.6, 0.95));                    // столб
        g.add(mesh(GEO.box, snow, s * 2.45, 3.72, 0, 1.12, 0.28, 1.12));                  // снег сверху
        g.add(mesh(GEO.cone, gold, s * 2.45, 4.1, 0, 0.3, 0.55, 0.3));                    // золотой наконечник
        const leaf = new THREE.Group(); leaf.position.set(s * 1.95, 0, 0); leaf.rotation.y = s * 1.3;  // створка распахнута
        const w = 1.8, h = 2.5, cx = -s * w / 2;
        leaf.add(mesh(GEO.box, red, cx, 1.35, 0, w, h, 0.14));
        for (const yy of [0.1, h + 0.1]) leaf.add(mesh(GEO.box, frame, cx, yy + 0.1, 0, w + 0.12, 0.14, 0.2));
        for (const xx of [-w / 2, w / 2]) leaf.add(mesh(GEO.box, frame, cx + xx, 1.35, 0, 0.14, h, 0.2));
        for (const sg of [-1, 1]) { const br = mesh(GEO.box, frame, cx, 1.35, 0, 2.7, 0.12, 0.18); br.rotation.z = sg * Math.atan2(h, w); leaf.add(br); }
        g.add(leaf);
      }
      g.add(mesh(GEO.box, wood, 0, 3.3, 0, 5.3, 0.5, 0.75));                              // балка над проёмом
      g.add(mesh(GEO.box, snow, 0, 3.66, 0, 5.4, 0.22, 0.85));
      gateGroup.add(g);
    };
    gate((b.minX + b.maxX) / 2, b.minZ, 0);
    gate(b.minX, (b.minZ + b.maxZ) / 2, Math.PI / 2);
    gate(b.maxX, (b.minZ + b.maxZ) / 2, Math.PI / 2);
    gate(SG.GATE_S_X, b.maxZ, 0);
    // Угловые ворота (последний уровень базы): стоят по диагонали поперёк среза угла, створки открыты внутрь базы.
    // Угол поворота подобран так, чтобы ось «вдоль проёма» шла по хорде, а створки смотрели в центр базы.
    if (b.corners) {
      const h = SG.CORNER_C / 2, A = Math.PI / 4;
      gate(b.minX + h, b.minZ + h, A);
      gate(b.maxX - h, b.minZ + h, -A);
      gate(b.minX + h, b.maxZ - h, 3 * A);
      gate(b.maxX - h, b.maxZ - h, -3 * A);
    }
  };

  // ---------- лавки ----------
  const stallV = [];
  function buildStalls() {
    for (const st of SG.G.stalls) {
      if (st.remote) continue; // рыбная лавка строится отдельно (buildFish)
      const g = new THREE.Group();
      // низкая деревянная платформа, на которой лежит поле разгрузки и сам товар
      g.add(mesh(GEO.box, mat('#ee9a62'), st.x, 0.2, 12.0, 3.6, 0.4, 4.6));
      for (const z of [10.6, 11.9, 13.2]) g.add(mesh(GEO.box, mat('#d9824c'), st.x, 0.41, z, 3.6, 0.02, 0.06));
      scene.add(g);
      const items = [];
      for (let i = 0; i < 60; i++) {
        let m;
        if (st.id === 'wood') { m = mesh(GEO.cyl, i % 2 ? MAT.logA : MAT.logB, 0, 0, 0, 0.25, 0.9, 0.25); m.rotation.z = Math.PI / 2; }
        else if (st.id === 'meat') m = mesh(GEO.cyl, MAT.meat, 0, 0, 0, 0.42, 0.14, 0.42);
        else m = mesh(GEO.box, MAT.gold, 0, 0, 0, 0.8, 0.28, 0.4);
        m.visible = false; scene.add(m); items.push(m);
      }
      // тёмный лоток с деньгами рядом
      scene.add(mesh(GEO.box, mat('#3b3b3f'), st.cash.x, 0.1, st.cash.z, 2.8, 0.2, 2.4));
      const cash = [];
      for (let i = 0; i < 36; i++) {
        const m = mesh(GEO.box, MAT.green, st.cash.x + ((i % 3) - 1) * 0.8, 0.32 + Math.floor(i / 6) * 0.26, st.cash.z + (Math.floor((i % 6) / 3) - 0.5) * 0.95, 0.72, 0.24, 0.85);
        m.visible = false; scene.add(m); cash.push(m);
      }
      const lock = new THREE.Group();
      lock.add(mesh(GEO.box, mat('#9aa0a6'), 0, 0, 0, 0.9, 0.8, 0.4));
      lock.add(mesh(new THREE.TorusGeometry(0.3, 0.09, 6, 10), mat('#c9ced3'), 0, 0.55, 0));
      lock.position.set(st.x, 1.3, 13.1); scene.add(lock);
      const b = canvasTex(128, 128);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: b.tex, depthTest: false, transparent: true }));
      sp.scale.set(2.6, 2.6, 1); sp.position.set(st.x, 3.8, 13.1); sp.renderOrder = 10; scene.add(sp);
      // поле разгрузки: коричневый пунктирный прямоугольник (как в рекламе), под ногами зеленеет
      const pad = canvasTex(256, 170);
      const pm = mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: pad.tex, transparent: true, depthWrite: false }), st.pad.x, 0.44, st.pad.z, 3.0, 2.0, 1);
      pm.renderOrder = 3; pm.rotation.x = -Math.PI / 2; scene.add(pm);
      stallV.push({ st, items, cash, lock, bub: b, sp, pad, padM: pm, key: '', pkey: '' });
    }
  }
  function drawBubble(v) {
    const st = v.st, f = SG.G.queues[st.id][0], g = v.bub.g;
    const need = f && f.state === 'queue' ? f.need : 0;
    const key = need + '|' + st.st.stock + '|' + st.unlocked;
    if (key === v.key) return; v.key = key;
    g.clearRect(0, 0, 128, 128);
    v.sp.visible = need > 0 && st.unlocked;
    if (!v.sp.visible) { v.bub.tex.needsUpdate = true; return; }
    g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 58, 50, 0, 7); g.fill();
    g.save(); g.beginPath(); g.arc(64, 58, 48, 0, 7); g.clip();
    g.fillStyle = '#58d26b'; const fh = 96 * Math.min(1, st.st.stock / need); g.fillRect(0, 106 - fh, 128, fh); g.restore();
    SG.drawIcon(g, st.icon, 64, 46, 52);
    g.textAlign = 'center'; g.font = '800 34px system-ui'; g.lineWidth = 6; g.strokeStyle = '#2b2b2b'; g.strokeText(String(Math.max(0, need - st.st.stock)), 64, 98);
    g.fillStyle = '#fff'; g.fillText(String(Math.max(0, need - st.st.stock)), 64, 98);
    v.bub.tex.needsUpdate = true;
  }
  function drawStallPad(v) {
    const on = SG.G.onStall(v.st);
    const key = v.st.unlocked + '|' + on;
    if (key === v.pkey) return; v.pkey = key;
    v.padM.visible = v.st.unlocked;
    const g = v.pad.g; g.clearRect(0, 0, 256, 170);
    g.fillStyle = on ? 'rgba(80,150,70,.78)' : 'rgba(125,80,50,.82)'; g.beginPath(); g.roundRect(8, 8, 240, 154, 26); g.fill();
    g.setLineDash([24, 16]); g.strokeStyle = on ? '#8dff7a' : '#fff'; g.lineWidth = 8; g.stroke();
    v.pad.tex.needsUpdate = true;
  }
  function syncStalls() {
    for (const v of stallV) {
      const st = v.st, stock = Math.floor(st.st.stock);
      v.lock.visible = !st.unlocked;
      const n = st.unlocked ? Math.min(60, stock) : 0;
      v.items.forEach((m, i) => {
        m.visible = i < n;
        if (!m.visible) return;
        if (st.id === 'wood') { const col = i % 6, row = Math.floor(i / 6); m.position.set(st.x - 1.25 + col * 0.5, 0.65 + row * 0.42, 13.2); }
        else if (st.id === 'meat') { const col = i % 4, row = Math.floor(i / 4); m.position.set(st.x - 0.9 + col * 0.6, 0.55 + row * 0.17, 13.2); }
        else { const col = i % 3, row = Math.floor(i / 3); m.position.set(st.x - 0.9 + col * 0.9, 0.6 + row * 0.3, 13.2); }
      });
      const nc = st.st.cash > 0 ? Math.min(36, 1 + Math.floor(st.st.cash / (st.price * 2))) : 0;
      v.cash.forEach((m, i) => (m.visible = i < nc));
      drawBubble(v); drawStallPad(v);
    }
  }


  // ---------- рыбацкая база на берегу ----------
  // Всё стоит в одной группе, которая невидима, пока база не куплена. Куски настила и места рыбаков k = 1..3
  // включаются по уровню «Длины пирса».
  const fishV = { root: null, segs: [], items: [], cash: [] };
  let fishPool = [];
  function makeFish() {
    const g = new THREE.Group(), m = mat('#cfe3ee', { flatShading: false });
    g.add(mesh(GEO.sph, m, 0, 0, 0, 0.62, 0.17, 0.22));
    const tail = mesh(GEO.cone, mat('#8fc3e0'), -0.62, 0, 0, 0.16, 0.36, 0.05); tail.rotation.z = Math.PI / 2; g.add(tail);
    return g;
  }
  function buildFish() {
    const F = SG.FISH, root = new THREE.Group(); root.visible = false;
    const plank = mat('#d9a066'), dark = mat('#6b4426'), wood = mat('#b98550'), snowM = mat('#fff', { flatShading: false }), blue = mat('#3a8fd0');
    const cx = (F.deckX0 + F.deckX1) / 2, dw = F.deckX1 - F.deckX0;
    for (let k = 0; k <= 3; k++) {
      const z0 = k === 0 ? F.northZ : F.endZ(k - 1), z1 = F.endZ(k), g = new THREE.Group();
      g.add(mesh(GEO.box, plank, cx, 0.35, (z0 + z1) / 2, dw, 0.3, z1 - z0));
      for (let z = z0 + 0.9; z < z1 - 0.1; z += 1.0) g.add(mesh(GEO.box, dark, cx, 0.51, z, dw, 0.02, 0.07));
      for (const z of [z0 + 0.7, z1 - 0.7]) g.add(mesh(GEO.box, dark, F.deckX1 - 0.7, -0.45, z, 0.5, 1.6, 0.5)); // опоры в воде
      // место рыбака: деревянный чурбак у кромки воды
      const sz = F.seatZ(k);
      g.add(mesh(GEO.box, wood, F.seatX, 0.58, sz, 0.8, 0.16, 0.8), mesh(GEO.box, dark, F.seatX, 0.4, sz, 0.45, 0.3, 0.45));
      root.add(g); fishV.segs.push(g);
    }
    // прилавок под навесом: на нём лежит пойманная рыба
    const bx = F.x, bz = F.benchZ;
    root.add(mesh(GEO.box, wood, bx, 1.0, bz, 5.6, 1.0, 1.4));
    for (const sx of [-1, 1]) root.add(mesh(GEO.box, dark, bx + sx * 2.9, 2.2, bz, 0.25, 3.4, 0.25));
    root.add(mesh(GEO.box, blue, bx, 4.0, bz, 6.6, 0.25, 2.8), mesh(GEO.box, snowM, bx, 4.2, bz, 6.6, 0.18, 2.8));
    const fm = mat('#cfe3ee', { flatShading: false });
    for (let i = 0; i < 40; i++) { const m = mesh(GEO.sph, fm, 0, 0, 0, 0.55, 0.14, 0.2); m.rotation.y = Math.sin(i * 3.1) * 0.4; m.visible = false; root.add(m); fishV.items.push(m); }
    // лоток с деньгами
    root.add(mesh(GEO.box, mat('#3b3b3f'), F.cash.x, 0.1, F.cash.z, 2.8, 0.2, 2.4));
    for (let i = 0; i < 36; i++) {
      const m = mesh(GEO.box, MAT.green, F.cash.x + ((i % 3) - 1) * 0.8, 0.32 + Math.floor(i / 6) * 0.26, F.cash.z + (Math.floor((i % 6) / 3) - 0.5) * 0.95, 0.72, 0.24, 0.85);
      m.visible = false; root.add(m); fishV.cash.push(m);
    }
    // пузырёк «что заказал покупатель» — тот же, что у остальных лавок
    const b = canvasTex(128, 128);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: b.tex, depthTest: false, transparent: true }));
    sp.scale.set(2.6, 2.6, 1); sp.position.set(bx, 5.2, bz); sp.renderOrder = 10; root.add(sp);
    fishV.bub = { st: SG.G.stalls[3], bub: b, sp, key: '' };
    // поле разгрузки на настиле: сюда игрок выкладывает пойманную рыбу (как у остальных лавок)
    const padC = canvasTex(256, 170);
    const pm = mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: padC.tex, transparent: true, depthWrite: false }), F.pad.x, 0.58, F.pad.z, 3.0, 2.0, 1);
    pm.renderOrder = 3; pm.rotation.x = -Math.PI / 2; root.add(pm);
    fishV.padV = { st: SG.G.stalls[3], pad: padC, padM: pm, pkey: '' };
    scene.add(root); fishV.root = root;
    for (let i = 0; i < 16; i++) { const f = makeFish(); f.visible = false; scene.add(f); fishPool.push(f); }
  }
  function syncFish() {
    const G = SG.G, D = SG.D, st = G.stalls[3];
    fishV.root.visible = D.fishBase;
    if (!D.fishBase) return;
    fishV.segs.forEach((g, k) => (g.visible = k <= D.fishLen));
    const F = SG.FISH, stock = Math.floor(st.st.stock), n = Math.min(40, stock);
    fishV.items.forEach((m, i) => {
      m.visible = i < n; if (!m.visible) return;
      m.position.set(F.x - 2.45 + (i % 8) * 0.7, 1.58 + Math.floor(i / 8) * 0.15, F.benchZ + ((i % 2) - 0.5) * 0.25);
    });
    const nc = st.st.cash > 0 ? Math.min(36, 1 + Math.floor(st.st.cash / (st.price * 2))) : 0;
    fishV.cash.forEach((m, i) => (m.visible = i < nc));
    drawBubble(fishV.bub); drawStallPad(fishV.padV);
  }
  function syncFishFx() {
    const G = SG.G;
    fishPool.forEach((m, i) => {
      const fx = G.fishFx[i]; m.visible = !!fx;
      if (!fx) return;
      const u = Math.min(1, fx.t / fx.dur);
      m.position.set(fx.x0 + (fx.x1 - fx.x0) * u, 0.2 + 3.4 * 4 * u * (1 - u) + 1.4 * u, fx.z0 + (fx.z1 - fx.z0) * u);
      m.rotation.set(0, Math.atan2(fx.x1 - fx.x0, fx.z1 - fx.z0) - Math.PI / 2, u * 9);
    });
  }
  // Удочка: стебель в руке, леска, поплавок и круги на воде. Леска и поплавок живут в сцене (не в группе человека).
  function makeRig(parent, hand) {
    const rod = new THREE.Group(); rod.position.set(hand[0], hand[1], hand[2]);
    const stick = mesh(GEO.cyl, mat('#8a5a2b'), 0, 0, 2.2, 0.05, 4.4, 0.05); stick.rotation.x = Math.PI / 2; rod.add(stick);
    parent.add(rod);
    const line = mesh(GEO.box, mat('#f4f7fa'), 0, 0, 0, 0.03, 0.03, 1), bob = mesh(GEO.sph, mat('#e8392b'), 0, 0, 0, 0.22);
    const rip = mesh(new THREE.RingGeometry(0.5, 0.62, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }), 0, 0.07, 0);
    rip.rotation.x = -Math.PI / 2; rip.renderOrder = 5;
    scene.add(line, bob, rip);
    return { rod, line, bob, rip };
  }
  // Поза удочки по фазе автомата f (state/t/thrown/bx/bz). hx,hy,hz — рука в мире; смотрит в +x. Возвращает угол удочки.
  function poseRig(v, f, hx, hy, hz, t, seat) {
    const ease = u => u * u * (3 - 2 * u);
    let phi;
    if (f.state === 'cast') phi = 1.5 + (0.55 - 1.5) * ease(Math.min(1, f.t / 0.8));
    else if (f.state === 'wait') phi = 0.55 + Math.sin(t * 1.2 + seat) * 0.03;
    else if (f.state === 'bite') phi = 0.55 + Math.sin(f.t * 30) * 0.06;
    else phi = 0.55 + 0.95 * Math.sin(Math.min(1, f.t / 0.55) * Math.PI * 0.9);
    v.rod.rotation.x = -phi;
    const L = 4.4, tipX = hx + L * Math.cos(phi), tipY = hy + L * Math.sin(phi), tipZ = hz;
    // поплавок: при забросе летит дугой к воде, после подсечки пропадает вместе с леской
    let bx = f.bx, by = 0.12, bz = f.bz, show = true;
    if (f.state === 'cast') { const k = Math.min(1, Math.max(0, (f.t - 0.35) / 0.45)); show = f.t > 0.35; bx = tipX + (f.bx - tipX) * k; bz = tipZ + (f.bz - tipZ) * k; by = tipY + (0.12 - tipY) * k + Math.sin(k * Math.PI) * 1.5; }
    else if (f.state === 'bite') by = 0.12 - Math.abs(Math.sin(f.t * 22)) * 0.2;
    else if (f.state === 'pull' && f.thrown) show = false;
    v.bob.visible = show; v.line.visible = show; v.bob.position.set(bx, by, bz);
    const dx = bx - tipX, dy = by - tipY, dz = bz - tipZ, len = Math.hypot(dx, dy, dz) || 1;
    v.line.position.set((bx + tipX) / 2, (by + tipY) / 2, (bz + tipZ) / 2); v.line.lookAt(bx, by, bz); v.line.scale.set(0.03, 0.03, len);
    const rip = f.state === 'bite' || (f.state === 'pull' && !f.thrown);
    v.rip.visible = rip;
    if (rip) { const u = f.state === 'bite' ? f.t / 0.5 : 1; v.rip.position.set(f.bx, 0.07, f.bz); v.rip.scale.setScalar(0.6 + u * 1.6); v.rip.material.opacity = 0.7 * (1 - u * 0.8); }
    return phi;
  }
  function hideRig(v) { v.rod.visible = false; v.line.visible = false; v.bob.visible = false; v.rip.visible = false; }
  function syncFishers() {
    const G = SG.G, F = SG.FISH, t = G.t;
    syncMap(maps.fishers, G.fishers, f => {
      const h = makeHuman('#3b7bd4', '#f3efe6', false, '#e8c34a');
      const g = new THREE.Group(); g.add(h);
      h.userData.legs.forEach(l => (l.rotation.x = -1.35)); h.userData.body.position.y = -0.38; // сидит на чурбаке
      scene.add(g);
      return Object.assign({ root: g, h }, makeRig(g, [0.3, 1.25, 0.5]));
    }, (f, v) => {
      const sz = F.seatZ(f.seat), gx = F.seatX - 0.2;
      v.root.position.set(gx, 0.5, sz); v.root.rotation.y = Math.PI / 2;
      const phi = poseRig(v, f, gx + 0.5, 1.75, sz - 0.3, t, f.seat);
      v.h.userData.arms.forEach(a => (a.rotation.x = -(0.9 + (phi - 0.55) * 0.8)));
    });
  }

  // ---------- корабль ----------
  let shipG, shipRig;
  function buildShip() {
    const g = new THREE.Group(), hull = mat('#2f5f8f'), trim = mat('#f4f1ea'), wood = mat('#b98550'), dark = mat('#6b4426');
    g.add(mesh(GEO.box, hull, 0, 0.55, -0.6, 3.8, 1.3, 7.6));
    const bow = mesh(GEO.box, hull, 0, 0.55, 3.2, 2.69, 1.3, 2.69); bow.rotation.y = Math.PI / 4; g.add(bow);   // острый нос
    g.add(mesh(GEO.box, trim, 0, 0.98, -0.6, 3.9, 0.16, 7.7));                                                  // белая полоса по борту
    g.add(mesh(GEO.box, wood, 0, 1.22, -0.6, 3.3, 0.1, 7.0));                                                   // палуба
    g.add(mesh(GEO.box, trim, 0, 2.05, -3.0, 2.6, 1.5, 2.0), mesh(GEO.box, dark, 0, 2.9, -3.0, 2.9, 0.18, 2.3)); // рубка и крыша
    g.add(mesh(GEO.box, mat('#9fd0ee'), 0, 2.2, -1.98, 2.0, 0.5, 0.06));                                         // окно
    g.add(mesh(GEO.box, dark, 1.4, 2.4, 1.0, 0.1, 2.4, 0.1), mesh(GEO.box, mat('#e8392b'), 1.4, 3.4, 1.55, 0.04, 0.6, 1.1)); // флагшток и флаг
    // гарпунная установка на носу: поворачивается на цель
    const gun = new THREE.Group(); gun.position.set(0, 1.5, 2.3);
    gun.add(mesh(GEO.cyl, dark, 0, 0, 0, 0.45, 0.5, 0.45));
    gun.add(mesh(GEO.box, dark, 0, 0.45, 0.7, 0.22, 0.22, 1.7), mesh(GEO.cone, mat('#d5dce2'), 0, 0.45, 1.7, 0.2, 0.55, 0.2));
    gun.children[2].rotation.x = Math.PI / 2;
    g.add(gun); g.userData.gun = gun;
    g.visible = false; scene.add(g); shipG = g;
    shipRig = { harps: [] };
    for (let i = 0; i < 8; i++) {
      const h = new THREE.Group(); h.add(mesh(GEO.box, dark, 0, 0, 0, 0.12, 0.12, 1.8), mesh(GEO.cone, mat('#d5dce2'), 0, 0, 1.0, 0.18, 0.5, 0.18));
      h.children[1].rotation.x = Math.PI / 2; h.visible = false; scene.add(h); shipRig.harps.push(h);
    }
  }
  function syncShip() {
    const G = SG.G, D = SG.D, sh = G.ship, t = G.t;
    shipG.visible = D.shipOwned;
    if (D.shipOwned) {
      shipG.position.set(sh.x, 0.12 + Math.sin(t * 2 + sh.x) * 0.07, sh.z);
      shipG.rotation.set(Math.sin(t * 1.6) * 0.025, sh.rot, Math.sin(t * 1.3 + 1) * 0.03);
      shipG.userData.gun.rotation.y = sh.boarded && sh.tgt ? sh.aim - sh.rot : 0;
    }
    shipRig.harps.forEach((m, i) => {
      const h = G.harps[i]; m.visible = !!h;
      if (h) { m.position.set(h.x, h.y, h.z); m.rotation.set(0, h.dir || 0, 0); }
    });
  }

  // ---------- большая рыба ----------
  const seaV = [];
  let seaBar;
  function buildSea() {
    for (const f of SG.G.sea) {
      const g = new THREE.Group(), bm = mat('#5fa8d3', { flatShading: false });
      g.add(mesh(GEO.sph, bm, 0, 0, 0, 0.8, 0.26, 0.3));
      const tail = new THREE.Group(); tail.position.set(-0.75, 0, 0);
      const tc = mesh(GEO.cone, bm, -0.25, 0, 0, 0.3, 0.55, 0.06); tc.rotation.z = Math.PI / 2; tail.add(tc);
      g.add(tail, mesh(GEO.cone, bm, 0.0, 0.3, 0, 0.12, 0.34, 0.05), mesh(GEO.sph, mat('#10202c'), 0.55, 0.08, 0.2, 0.06), mesh(GEO.sph, mat('#10202c'), 0.55, 0.08, -0.2, 0.06));
      g.visible = false; scene.add(g);
      seaV.push({ f, g, bm, tail, hue: -1 });
    }
    const mk = (c, o) => new THREE.Sprite(new THREE.SpriteMaterial({ color: c, depthTest: false, transparent: true, opacity: o }));
    seaBar = { bg: mk(0x1a1a1a, 0.7), fg: mk(0xff4d4d, 1) }; seaBar.bg.renderOrder = 11; seaBar.fg.renderOrder = 12;
    seaBar.bg.visible = seaBar.fg.visible = false; scene.add(seaBar.bg, seaBar.fg);
  }
  function syncSea() {
    const G = SG.G, t = G.t, p = G.p;
    for (const v of seaV) {
      const f = v.f, near = !f.dead && Math.abs(f.x - p.x) < 110 && Math.abs(f.z - p.z) < 110; // дальние всё равно в тумане
      v.g.visible = near;
      if (!near) continue;
      const k = Math.min(1, (f.s - 0.8) / 5.5);
      if (v.hue !== k) { v.hue = k; v.bm.color.setRGB(0.37 - 0.2 * k, 0.66 - 0.35 * k, 0.83 - 0.3 * k); } // чем крупнее, тем темнее
      v.bm.emissive.setRGB(f.flash > 0 ? 0.6 : 0, f.flash > 0 ? 0.6 : 0, f.flash > 0 ? 0.6 : 0);
      const sc = 1.3 * Math.pow(f.s, 0.92);
      v.g.scale.setScalar(sc); v.g.position.set(f.x, 0.08 * sc + Math.sin(t * 2 + f.ph) * 0.05, f.z); v.g.rotation.y = f.a - Math.PI / 2;
      v.tail.rotation.y = Math.sin(t * 6 + f.ph) * 0.45;
    }
    const tg = G.ship.boarded ? G.ship.tgt : null;
    const show = !!tg && !tg.dead && tg.hp < tg.max;
    seaBar.bg.visible = seaBar.fg.visible = show;
    if (show) {
      const k = Math.max(0.001, tg.hp / tg.max), y = 0.8 * 1.3 * Math.pow(tg.s, 0.92) + 1.6;
      seaBar.bg.position.set(tg.x, y, tg.z); seaBar.bg.scale.set(3.2, 0.4, 1);
      seaBar.fg.position.set(tg.x - 1.55 * (1 - k), y, tg.z); seaBar.fg.scale.set(3.1 * k, 0.3, 1);
    }
  }

  // ---------- плитки покупок ----------
  // Дизайн как в рекламе: серая плитка с точечным узором, белые уголки, иконка и цена. Без подписей —
  // название и уровень показываются подсказкой снизу экрана, когда стоишь на плитке.
  const padV = [];
  function buildPads() {
    for (const pad of SG.G.pads) {
      const cv = canvasTex(256, 256);
      const piv = new THREE.Group(); piv.rotation.y = (pad.rot || 0) * Math.PI / 2; piv.position.set(pad.x, 0.1, pad.z);
      const m = mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: cv.tex, transparent: true, depthWrite: false }), 0, 0.02, 0, 3.0, 3.0, 1);
      m.renderOrder = 3; m.rotation.x = -Math.PI / 2; piv.add(m); scene.add(piv);
      padV.push({ pad, cv, piv, key: '' });
    }
  }
  function drawPad(v) {
    const pad = v.pad, G = SG.G, S = SG.S;
    const vis = G.padVisible(pad); v.piv.visible = vis;
    if (!vis) return;
    v.piv.position.set(pad.x, 0.1, pad.z);
    const L = S.lv[pad.id] || 0, maxed = G.padMaxed(pad), cost = G.padCost(pad), prog = S.prog[pad.id] || 0;
    const ok = S.cash >= cost - prog;
    const wood = maxed ? 0 : G.padWood(pad), woodOk = S.wood >= wood;
    const key = [L, cost, ok, Math.floor(prog / cost * 40), wood, woodOk].join('|');
    if (key === v.key) return; v.key = key;
    const g = v.cv.g, d = pad.def;
    g.clearRect(0, 0, 256, 256);
    g.fillStyle = 'rgba(104,106,112,.93)'; g.beginPath(); g.roundRect(14, 14, 228, 228, 30); g.fill();
    g.fillStyle = 'rgba(0,0,0,.14)';
    for (let y = 30; y < 232; y += 13) for (let x = 30 + ((y / 13) % 2) * 6; x < 232; x += 13) { g.beginPath(); g.arc(x, y, 2.3, 0, 7); g.fill(); }
    g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 10; g.lineCap = 'round';
    for (const [cx, cy, sx, sy] of [[10, 10, 1, 1], [246, 10, -1, 1], [10, 246, 1, -1], [246, 246, -1, -1]]) {
      g.beginPath(); g.moveTo(cx, cy + sy * 46); g.lineTo(cx, cy + sy * 12); g.quadraticCurveTo(cx, cy, cx + sx * 12, cy); g.lineTo(cx + sx * 46, cy); g.stroke();
    }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    SG.drawIcon(g, 'cash', 56, 62, 54);
    SG.drawIcon(g, d.icon, 84, 142, 100);
    if (wood > 0) { // цена в дереве — справа сверху, красная, пока не хватает
      SG.drawIcon(g, 'log', 128, 62, 46);
      g.font = '800 44px system-ui'; g.lineWidth = 8; g.lineJoin = 'round'; g.strokeStyle = '#1b1b1f';
      g.strokeText(SG.fmt(wood), 196, 66); g.fillStyle = woodOk ? '#b8ffbf' : '#ff9d9d'; g.fillText(SG.fmt(wood), 196, 66);
    }
    const txt = maxed ? 'МАКС' : SG.fmt(Math.max(0, Math.ceil(cost - prog)));
    let fs = maxed ? 40 : 64; g.font = '800 ' + fs + 'px system-ui';
    while (g.measureText(txt).width > 108 && fs > 22) { fs -= 4; g.font = '800 ' + fs + 'px system-ui'; }
    g.lineWidth = 9; g.lineJoin = 'round'; g.strokeStyle = '#1b1b1f'; g.strokeText(txt, 188, 150);
    g.fillStyle = maxed ? '#ffe27a' : (ok || prog > 0 ? '#b8ffbf' : '#fff'); g.fillText(txt, 188, 150);
    if (!maxed) {
      g.fillStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.roundRect(34, 206, 188, 16, 8); g.fill();
      const pct = Math.min(1, prog / cost);
      if (pct > 0) { g.fillStyle = '#4fd05a'; g.beginPath(); g.roundRect(34, 206, Math.max(16, 188 * pct), 16, 8); g.fill(); }
    }
    v.cv.tex.needsUpdate = true;
  }

  // ---------- костёр ----------
  let flames = [];
  function buildFire() {
    const f = SG.G.fire, g = new THREE.Group(); g.position.set(f.x, 0, f.z);
    g.add(mesh(GEO.cyl, mat('#555'), 0, 0.15, 0, 1.7, 0.3, 1.7));
    for (const a of [0, 1.05, 2.1]) { const l = mesh(GEO.cyl, mat('#6b4426'), 0, 0.5, 0, 0.2, 2.0, 0.2); l.rotation.z = Math.PI / 2; l.rotation.y = a; g.add(l); }
    for (const [h, r, c] of [[2.6, 0.9, '#e8420f'], [2.0, 0.65, '#ff8a1f'], [1.3, 0.4, '#ffd23f']]) {
      const fl = mesh(GEO.cone, new THREE.MeshBasicMaterial({ color: c }), 0, h / 2 + 0.4, 0, r, h, r); fl.userData.h = h; g.add(fl); flames.push(fl);
    }
    scene.add(g);
  }

  // ---------- игрок и его вещи ----------
  let player, axeMeshes = [], ring, stacks, playerShadow, arrowG, playerRigG, playerRig;
  function buildPlayer() {
    player = new THREE.Group();
    player.add(makeHuman('#2a93dc', '#f6f1e7', true));
    scene.add(player);
    playerShadow = shadow(1.0); scene.add(playerShadow);
    ring = mesh(new THREE.RingGeometry(0.95, 1.0, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }), 0, 0.2, 0);
    ring.renderOrder = 4; ring.rotation.x = -Math.PI / 2; scene.add(ring);
    // Маленький кружок у ног со стрелкой на базу (стрелка лежит в плоскости земли и смотрит вдоль +x группы)
    arrowG = new THREE.Group();
    const am = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false });
    const circ = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.2, 40), am); circ.rotation.x = -Math.PI / 2; circ.renderOrder = 4;
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute([2.75, 0, 0, 1.55, 0, 0.65, 1.55, 0, -0.65], 3));
    const tri = new THREE.Mesh(tg, am); tri.renderOrder = 4;
    arrowG.add(circ, tri); arrowG.scale.setScalar(0.5); scene.add(arrowG);
    // своя удочка на пирсе: группа смотрит на воду (+x) независимо от поворота героя
    playerRigG = new THREE.Group(); playerRigG.rotation.y = Math.PI / 2; scene.add(playerRigG);
    playerRig = makeRig(playerRigG, [0.3, 1.25, 0.5]); hideRig(playerRig);
    for (let i = 0; i < 10; i++) {
      const a = new THREE.Group(), hm = mat('#fff');
      a.userData.handle = mesh(GEO.box, mat('#8a5a30'), 0.5, 0, 0, 1, 0.14, 0.14);
      a.userData.head = mesh(GEO.box, hm, 0, 0, 0, 0.7, 0.14, 1.25);
      a.userData.head.userData.mat = hm;
      a.add(a.userData.handle, a.userData.head);
      a.visible = false; scene.add(a); axeMeshes.push(a);
    }
    // Башни на спине: брёвна, мясо, золото и деньги. Без рюкзака они растут почти без предела (как в рекламе),
    // каждая — один InstancedMesh, чтобы сотни предметов не стоили кадров.
    const mk = (geo, m, n) => { const im = new THREE.InstancedMesh(geo, m, n); im.count = 0; im.frustumCulled = false; scene.add(im); return im; };
    stacks = { wood: mk(GEO.cyl, MAT.logA, 300), meat: mk(GEO.sph, MAT.meat, 200), gold: mk(GEO.box, MAT.gold, 100), fish: mk(GEO.sph, MAT.fish, 200), cash: mk(GEO.box, MAT.cashMats, 300) };
  }
  let lastTier = -1;
  function syncPlayer(dt) {
    const G = SG.G, p = G.p, D = SG.D, S = SG.S;
    player.visible = !p.dead; playerShadow.visible = !p.dead;
    const yo = G.ship.boarded ? 1.2 : 0; // на корабле герой стоит на палубе
    player.position.set(p.x, yo, p.z); player.rotation.y = p.face;
    animHuman(player.children[0], p.walk, G.t);
    // на пирсе: удочка в руках; на корабле — руки опущены, гарпун стреляет сам
    if (G.fishMode === 'rod') {
      playerRigG.position.set(p.x, 0.25, p.z); playerRig.rod.visible = true;
      const phi = poseRig(playerRig, G.pf, p.x + 0.5, 1.5, p.z - 0.3, G.t, 0);
      player.children[0].userData.arms.forEach(a => (a.rotation.x = -(0.9 + (phi - 0.55) * 0.8)));
    } else hideRig(playerRig);
    playerShadow.position.set(p.x, 0.06, p.z); playerShadow.visible = !p.dead && !G.ship.boarded;
    const bd = G.bounds, adx = (bd.minX + bd.maxX) / 2 - p.x, adz = (bd.minZ + bd.maxZ) / 2 - p.z;
    arrowG.visible = !p.dead && !G.inBase(p.x, p.z, 1); // на самой базе стрелка не нужна
    arrowG.position.set(p.x, 0.22, p.z); arrowG.rotation.y = Math.atan2(-adz, adx);
    ring.visible = !p.dead && !G.fishMode; ring.position.set(p.x, 0.2, p.z); ring.scale.set(D.axeR, D.axeR, D.axeR);
    if (lastTier !== D.tier) {
      lastTier = D.tier;
      const col = new THREE.Color(SG.TIERS[D.tier].c);
      for (const a of axeMeshes) {
        const hm = a.userData.head.userData.mat; hm.color.copy(col);
        if (D.tier >= 7) { hm.emissive = col.clone().multiplyScalar(0.45); } else hm.emissive = new THREE.Color(0x000000);
      }
    }
    axeMeshes.forEach((a, i) => {
      const on = i < D.axeCount && !p.dead && !G.fishMode; a.visible = on; if (!on) return;
      const ang = p.axeAng + i * Math.PI * 2 / D.axeCount;
      a.position.set(p.x, 1.0, p.z); a.rotation.y = -ang;
      a.userData.handle.scale.x = D.axeR; a.userData.handle.position.x = D.axeR / 2;
      a.userData.head.position.x = D.axeR;
    });
    // башни на спине (смещения — вдоль правой/левой стороны экрана)
    const bob = p.walk ? Math.abs(Math.sin(G.t * 14)) * 0.08 : 0, show = !p.dead;
    const cashN = S.cash > 0 ? Math.min(300, 1 + Math.floor(8 * Math.sqrt(S.cash / 10))) : 0;
    fillStack(stacks.fish, show ? Math.min(200, Math.floor(S.fish)) : 0, p.x + 1.7, p.z - 0.2, 2.3 + bob + yo, 0.12, 0.6, 0.12, 0.22, false);
    fillStack(stacks.wood, show ? Math.min(300, Math.floor(S.wood)) : 0, p.x, p.z, 2.4 + bob + yo, 0.2, 0.3, 0.95, 0.3, true);
    fillStack(stacks.meat, show ? Math.min(200, Math.floor(S.meat)) : 0, p.x + 0.85, p.z - 0.85, 2.3 + bob + yo, 0.17, 0.5, 0.13, 0.42, false);
    fillStack(stacks.cash, show ? cashN : 0, p.x - 0.85, p.z + 0.85, 2.3 + bob + yo, 0.13, 0.8, 0.12, 0.5, false);
    fillStack(stacks.gold, show ? Math.min(100, Math.floor(S.gold)) : 0, p.x - 1.5, p.z - 0.3, 2.3 + bob + yo, 0.3, 0.85, 0.3, 0.45, false);
  }
  const _sm = new THREE.Matrix4(), _sq = new THREE.Quaternion(), _sq2 = new THREE.Quaternion(), _sp = new THREE.Vector3(), _ss = new THREE.Vector3();
  const _ax = new THREE.Vector3(0, 0, 1), _ay = new THREE.Vector3(0, 1, 0);
  function fillStack(im, n, x, z, y0, step, sx, sy, sz, logs) {
    im.count = n;
    for (let i = 0; i < n; i++) {
      _sp.set(x + Math.sin(i * 12.9) * 0.04, y0 + i * step, z + Math.cos(i * 7.3) * 0.04);
      if (logs) { _sq.setFromAxisAngle(_ax, Math.PI / 2); _sq2.setFromAxisAngle(_ay, i % 2 ? Math.PI / 2 : 0); _sq.premultiply(_sq2); } // брёвна крест-накрест
      else _sq.identity();
      _ss.set(sx, sy, sz); _sm.compose(_sp, _sq, _ss); im.setMatrixAt(i, _sm);
    }
    im.instanceMatrix.needsUpdate = true;
  }

  // ---------- пулы и динамические объекты ----------
  const maps = { bears: new Map(), workers: new Map(), collectors: new Map(), miners: new Map(), fishers: new Map(), customers: new Map(), turrets: new Map() };
  let dropPool = [], shotPool = [], DROP;
  function buildPools() {
    for (const b of SG.G.bears) {
      const g = makeBear(b.kind);
      const bg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x1a1a1a, depthTest: false, transparent: true, opacity: 0.7 }));
      const fg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xff4d4d, depthTest: false, transparent: true }));
      bg.renderOrder = 11; fg.renderOrder = 12; bg.scale.set(3.2, 0.4, 1); scene.add(bg, fg, g);
      let name = null;
      if (b.kind === 4) {
        const nc = canvasTex(256, 64), ng = nc.g;
        ng.textAlign = 'center'; ng.font = '800 46px system-ui, sans-serif'; ng.lineWidth = 8; ng.strokeStyle = '#3a2a00'; ng.strokeText(SG.VERITE_NAME, 128, 46); ng.fillStyle = '#ffd23f'; ng.fillText(SG.VERITE_NAME, 128, 46);
        name = new THREE.Sprite(new THREE.SpriteMaterial({ map: nc.tex, depthTest: false, transparent: true })); name.scale.set(5, 1.25, 1); name.renderOrder = 13; scene.add(name);
      }
      maps.bears.set(b, { g, bg, fg, name });
    }
    DROP = {
      wood: { g: GEO.cyl, m: MAT.logA, s: [0.28, 0.9, 0.28], rz: Math.PI / 2 },
      meat: { g: GEO.sph, m: MAT.meat, s: [0.55, 0.22, 0.42], rz: 0 },
      gold: { g: GEO.box, m: MAT.gold, s: [0.8, 0.28, 0.45], rz: 0 },
      cash: { g: GEO.box, m: MAT.green, s: [0.8, 0.2, 0.5], rz: 0 },
      fish: { g: GEO.sph, m: MAT.fish, s: [0.7, 0.18, 0.28], rz: 0 }
    };
    for (let i = 0; i < 200; i++) {
      const m = mesh(GEO.sph, MAT.meat, 0, 0, 0, 0.55, 0.22, 0.42); m.visible = false; scene.add(m); dropPool.push(m);
    }
    for (let i = 0; i < 40; i++) {
      const m = mesh(GEO.box, mat('#ffb347', { emissive: new THREE.Color('#aa6a00') }), 0, 0, 0, 0.12, 0.12, 1.2); m.visible = false; scene.add(m); shotPool.push(m);
    }
  }
  function syncBears() {
    const t = SG.G.t;
    for (const [b, o] of maps.bears) {
      const show = !b.dead; o.g.visible = show; if (o.name) o.name.visible = show;
      const hpShow = show && b.hp < b.max; o.bg.visible = hpShow; o.fg.visible = hpShow;
      if (!show) continue;
      const K = SG.KINDS[b.kind];
      o.g.position.set(b.x, 0, b.z); o.g.rotation.y = b.kind === 4 ? Math.PI / 4 : b.face; // смайлик всегда лицом к камере
      const w = b.moving ? Math.sin(t * 10 + b.ph) * 0.5 : 0;
      o.g.userData.legs.forEach((l, i) => (l.rotation.x = i % 2 ? -w : w));
      const pulse = b.flash > 0 ? 1.08 : 1;
      o.g.userData.inner.scale.setScalar(K.scale * pulse);
      o.g.userData.inner.position.y = b.kind === 4 ? (b.moving ? Math.abs(Math.sin(t * 9)) * 1.1 : Math.sin(t * 2) * 0.05) : Math.sin(t * 2 + b.ph) * 0.04; // убегая, подпрыгивает
      if (o.name) o.name.position.set(b.x, 4.5 * K.scale, b.z);
      if (hpShow) {
        const y = (b.kind === 4 ? 3.9 : 3.8) * K.scale, k = Math.max(0.001, b.hp / b.max);
        o.bg.position.set(b.x, y, b.z); o.fg.position.set(b.x - 1.55 * (1 - k), y, b.z);
        o.fg.scale.set(3.1 * k, 0.3, 1);
      }
    }
  }
  function syncMap(map, list, make, upd) {
    for (const [k, v] of map) if (list.indexOf(k) < 0) { scene.remove(v.root || v); map.delete(k); }
    for (const it of list) {
      let v = map.get(it);
      if (!v) { v = make(it); map.set(it, v); }
      upd(it, v);
    }
  }
  function syncWorkers() {
    const t = SG.G.t;
    syncMap(maps.workers, SG.G.workers, w => {
      const h = makeHuman('#2fb7a0', '#e9fffb', false, '#ffcf4a');
      const g = new THREE.Group(); g.add(h);
      const logs = []; for (let i = 0; i < 6; i++) { const m = mesh(GEO.cyl, i % 2 ? MAT.logA : MAT.logB, 0, 2.3 + i * 0.2, 0, 0.25, 0.8, 0.25); m.rotation.z = Math.PI / 2; m.visible = false; g.add(m); logs.push(m); }
      const axe = mesh(GEO.box, mat('#cfd6db'), 0.5, 1.2, 0.5, 0.15, 0.7, 0.4); g.add(axe);
      g.userData = { h, logs, axe }; scene.add(g); return g;
    }, (w, g) => {
      g.position.set(w.x, 0, w.z); g.rotation.y = w.face;
      animHuman(g.userData.h, w.walk, t + w.x);
      g.userData.axe.rotation.x = w.swing > 0 ? -1.4 + (1 - w.swing) * 2.2 : -0.3;
      g.userData.logs.forEach((m, i) => (m.visible = i < Math.min(6, w.carry)));
    });
  }
  function syncCollectors() {
    const t = SG.G.t;
    syncMap(maps.collectors, SG.G.collectors, c => {
      const h = makeHuman('#e8913a', '#fff3e0', false, '#c0392b');
      const g = new THREE.Group(); g.add(h);
      // плетёная корзина на спине и стопка мяса над головой
      h.userData.body.add(mesh(GEO.box, mat('#b8884a'), 0, 1.25, -0.55, 0.7, 0.7, 0.35));
      const meat = []; for (let i = 0; i < 6; i++) { const m = mesh(GEO.sph, MAT.meat, 0, 2.55 + i * 0.17, 0, 0.5, 0.13, 0.42); m.visible = false; g.add(m); meat.push(m); }
      g.userData = { h, meat }; scene.add(g); return g;
    }, (c, g) => {
      g.position.set(c.x, 0, c.z); g.rotation.y = c.face;
      animHuman(g.userData.h, c.walk, t + c.x);
      g.userData.meat.forEach((m, i) => (m.visible = i < Math.min(6, Math.ceil(6 * c.carry / SG.D.cCarry))));
    });
  }
  function syncMiners() {
    const t = SG.G.t;
    syncMap(maps.miners, SG.G.miners, m => {
      const h = makeHuman('#7d8a99', '#ffe9c2', false, '#ff9f1c');
      const g = new THREE.Group(); g.add(h);
      // кирка в руке и стопка слитков над головой
      const pick = new THREE.Group(); pick.position.set(0.5, 1.2, 0.5);
      pick.add(mesh(GEO.box, mat('#8a5a2b'), 0, 0.2, 0, 0.12, 1.0, 0.12), mesh(GEO.box, mat('#cfd6db'), 0, 0.75, 0, 0.9, 0.14, 0.14)); g.add(pick);
      const bars = []; for (let i = 0; i < 5; i++) { const b = mesh(GEO.box, MAT.gold, 0, 2.5 + i * 0.22, 0, 0.7, 0.2, 0.4); b.visible = false; g.add(b); bars.push(b); }
      g.userData = { h, pick, bars }; scene.add(g); return g;
    }, (m, g) => {
      g.position.set(m.x, 0, m.z); g.rotation.y = m.face;
      animHuman(g.userData.h, m.walk, t + m.x);
      g.userData.pick.rotation.x = m.swing > 0 ? -1.4 + (1 - m.swing) * 2.2 : -0.3;
      g.userData.bars.forEach((b, i) => (b.visible = i < Math.min(5, m.carry)));
    });
  }
  function syncCustomers() {
    const t = SG.G.t;
    syncMap(maps.customers, SG.G.customers, c => {
      const col = new THREE.Color().setHSL(0.55, 0.65, 0.42 + c.shade * 0.1);
      const h = makeHuman(col.getStyle(), '#e8f4ff', false);
      const g = new THREE.Group(); g.add(h); g.userData = { h }; scene.add(g); return g;
    }, (c, g) => {
      g.position.set(c.x, 0, c.z); g.rotation.y = c.face; animHuman(g.userData.h, c.walk, t + c.shade * 9);
    });
  }
  function syncTurrets() {
    syncMap(maps.turrets, SG.G.turrets, tr => {
      const g = makeTurret(); g.position.set(tr.x, 0, tr.z); scene.add(g); return g;
    }, (tr, g) => { g.position.set(tr.x, 0, tr.z); g.userData.bow.rotation.y = tr.aim; g.userData.bow.scale.setScalar(tr.flash > 0 ? 1.12 : 1); });
  }
  function syncDropsShots() {
    const G = SG.G, t = G.t;
    dropPool.forEach((m, i) => {
      const d = G.drops[i]; m.visible = !!d;
      if (!d) return;
      const T = DROP[d.type], k = d.n > 1 ? 1.35 : 1;
      m.geometry = T.g; m.material = T.m; m.scale.set(T.s[0] * k, T.s[1] * k, T.s[2] * k); m.rotation.z = T.rz;
      m.position.set(d.x, 0.5 + Math.sin(t * 4 + d.x) * 0.1, d.z);
    });
    shotPool.forEach((m, i) => {
      const s = G.shots[i]; m.visible = !!s;
      if (s) { m.position.set(s.x, s.y, s.z); m.rotation.y = s.dir || 0; }
    });
  }

  // ---------- кадр ----------
  R.frame = function (dt) {
    const G = SG.G, p = G.p;
    syncTrees(); syncGiants(); syncOres(); syncPlayer(dt); syncBears(); syncWorkers(); syncCollectors(); syncMiners(); syncFishers(); syncFish(); syncFishFx(); syncShip(); syncSea(); syncCustomers(); syncTurrets(); syncDropsShots(); syncStalls();
    for (const v of padV) drawPad(v);
    flames.forEach((f, i) => { f.scale.y = f.userData.h * (1 + Math.sin(G.t * (12 + i * 3) + i) * 0.12); });
    // камера плавно едет за игроком
    const k = Math.min(1, dt * 8);
    camTarget.x += (p.x - camTarget.x) * k; camTarget.z += (p.z - camTarget.z) * k;
    const sh = R.shakeT > 0 ? (R.shakeT -= dt, (Math.random() - 0.5) * 0.8) : 0;
    const pr = SG.CAM.pitch * Math.PI / 180, hd = camDist * Math.cos(pr) / Math.SQRT2;
    camera.position.set(camTarget.x + hd + sh, camDist * Math.sin(pr), camTarget.z + hd + sh * 0.5);
    camera.lookAt(camTarget.x, 0, camTarget.z);
    syncSnow(dt);
    if (waterTex) { waterTex.offset.x += dt * 0.012; waterTex.offset.y += dt * 0.006; }
    renderer.render(scene, camera);
  };
  R.shakeT = 0;
})();
