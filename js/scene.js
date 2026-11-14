/* Сцена: сетка, существа, цикл кадров, смена вида, адаптация качества. */
(function (GP) {
  'use strict';

  var CFG = GP.config, U = GP.util, C = GP.color;
  var A = GP.Atlas, R = GP.Raster, Pt = GP.Particles, Db = GP.Debris, Pal = GP.Palette, Cr = GP.Creature;
  var Am = GP.Ambient;

  var canvas, ctx;
  var grid = { cell: CFG.CELL, cd: CFG.CELL, dpr: 1, cols: 0, rows: 0, gap: 1, W: 0, H: 0 };
  var bg = document.createElement('canvas');
  var bgOld = document.createElement('canvas'), bgFade = 1;   // прежний фон тает при смене вида
  var halos = [];                        // подсветка сетки вокруг существ, три размера
  var HALO_SIZES = [10, 16, 24];

  var list = [];
  var rnd = U.rng((Date.now() ^ (Math.random() * 1e9)) >>> 0);
  var current = null;
  var opts = {
    cell: CFG.CELL, countScale: 1, density: CFG.GLYPH_DENSITY,
    paused: false, saver: false, adapt: true, wallpaper: false, fps: 0, ambient: true
  };
  var autoCell = 0, particleScale = 1, ambientScale = 1;
  var reduced = false;
  var time = 0, last = 0, raf = 0, dirty = true, running = false;
  var windowActive = true;
  var perfT = 0, perfN = 0, perfSkip = 1.5;

  var env = {
    W: 0, H: 0, cell: CFG.CELL, time: 0,
    mouse: { x: 0, y: 0, active: false },
    zone: null, list: list, reduced: false,
    dust: function (x, y, vx, vy, life, glyph, shade, alpha) {
      Pt.spawn(x, y, vx, vy, life, glyph, shade, alpha);
    },
    rnd: rnd
  };

  var S = GP.Scene = { env: env, grid: grid, stats: { fps: 0, ms: 0, creatures: 0, frames: 0, degraded: 0 } };

  // ---------------------------------------------------------------- сетка

  function rebuildBg() {
    bg.width = canvas.width; bg.height = canvas.height;
    var b = bg.getContext('2d');
    b.fillStyle = C.css(Pal.bg());
    b.fillRect(0, 0, bg.width, bg.height);
    b.fillStyle = 'rgba(' + CFG.GRID_RGB.join(',') + ',' + CFG.GRID_ALPHA_BASE + ')';
    var cd = grid.cd, gap = grid.gap, k;
    for (k = 1; k <= grid.cols; k++) b.fillRect(k * cd - gap, 0, gap, bg.height);
    for (k = 1; k <= grid.rows; k++) b.fillRect(0, k * cd - gap, bg.width, gap);
    if (current) Am.bake(b, grid);          // детали пространства
  }

  function rebuildHalos() {
    var cd = grid.cd, gap = grid.gap;
    halos = HALO_SIZES.map(function (rc) {
      var cv = document.createElement('canvas');
      var size = rc * 2 * cd;
      cv.width = cv.height = size;
      var h = cv.getContext('2d');
      h.fillStyle = 'rgb(' + CFG.GRID_RGB.join(',') + ')';
      for (var k = 1; k <= rc * 2; k++) {
        h.fillRect(k * cd - gap, 0, gap, size);
        h.fillRect(0, k * cd - gap, size, gap);
      }
      var g = h.createRadialGradient(size / 2, size / 2, size * 0.12, size / 2, size / 2, size / 2);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(0.55, 'rgba(0,0,0,0.45)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      h.globalCompositeOperation = 'destination-in';
      h.fillStyle = g;
      h.fillRect(0, 0, size, size);
      return { rc: rc, canvas: cv };
    });
  }

  function rebuildGrid() {
    var dpr = Math.min(CFG.DPR_MAX, window.devicePixelRatio || 1);
    var W = window.innerWidth, H = window.innerHeight;
    var want = U.clamp(opts.cell + autoCell, CFG.CELL_MIN, CFG.CELL_MAX);
    grid.dpr = dpr;
    grid.cd = Math.max(3, Math.round(want * dpr));   // целое число пикселей устройства
    grid.cell = grid.cd / dpr;
    grid.gap = grid.cd >= 14 ? 2 : 1;
    grid.W = W; grid.H = H;
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    grid.cols = Math.ceil(canvas.width / grid.cd);
    grid.rows = Math.ceil(canvas.height / grid.cd);
    env.W = W; env.H = H; env.cell = grid.cell;
    Am.resize(W, H, grid.cell);
    bgFade = 1;
    A.build(grid.cd);
    if (current) A.buildColored(Pal.dustColors(current));
    rebuildBg();
    rebuildHalos();
    R.setup(ctx, grid);
    perfSkip = 1.5; perfT = 0; perfN = 0;
    dirty = true;
  }

  // ------------------------------------------------------------- существа

  function inZone(x, y) {
    var z = env.zone;
    if (!z) return false;
    var dx = (x - z.x) / z.rx, dy = (y - z.y) / z.ry;
    return dx * dx + dy * dy < 1;
  }

  function freeSpot(x, y) {
    // центр с приветствием и полем ввода населён реже
    for (var n = 0; n < 8 && inZone(x, y) && rnd() < 0.9; n++) {
      x = rnd.range(-30, env.W + 30); y = rnd.range(-30, env.H + 30);
    }
    return [x, y];
  }

  function targetCount(def) {
    var area = U.clamp(env.W * env.H / CFG.REF_AREA, 0.3, 1.8);
    var n = def.count * opts.countScale * area * (reduced ? 0.5 : 1);
    return Math.max(1, Math.round(n));
  }

  function add(def, x, y, delay) {
    var c = def.create(env, rnd, x, y);
    c.asmDelay = delay;
    c.ramps = Pal.rampsFor(def.id, c.hue); c.palVer = Pal.version;
    c.update(0, env);
    list.push(c);
    return c;
  }

  function spawn(def, n, delay) {
    // существа заполняют весь экран, но неравномерно: где-то группы по 3–5, где-то одиночки
    var anchors = [], born = [], left = n, i, t, p;
    while (left > 0) {
      var best = null, bd = -1;
      for (t = 0; t < 12; t++) {
        p = [rnd.range(-30, env.W + 30), rnd.range(-30, env.H + 30)];
        if (inZone(p[0], p[1]) && rnd() < 0.9) continue;      // центр с приветствием населён реже
        var d = 1e12;
        for (i = 0; i < anchors.length; i++) {
          var ddx = anchors[i][0] - p[0], ddy = anchors[i][1] - p[1];
          d = Math.min(d, ddx * ddx + ddy * ddy);
        }
        if (d > bd) { bd = d; best = p; }
      }
      if (!best) best = [rnd.range(0, env.W), rnd.range(0, env.H)];
      anchors.push(best);
      var group = left >= 3 && rnd() < 0.3 ? Math.min(left, 3 + Math.floor(rnd() * 3)) : 1;
      var first = add(def, best[0], best[1], delay + rnd() * 0.25);
      born.push(first);
      for (i = 1; i < group; i++) {
        var a = rnd() * U.TAU, dist = first.radius * 2 + rnd.range(20, 90);
        p = freeSpot(best[0] + Math.cos(a) * dist, best[1] + Math.sin(a) * dist);
        born.push(add(def, p[0], p[1], delay + rnd() * 0.25));
      }
      left -= group;
    }
    if (def.arrange) def.arrange(born, env, rnd);
    list.sort(function (a2, b2) { return a2.depth - b2.depth; });   // мелкие — дальше
  }

  function dissolve(c) {
    var cells = [];
    R.draw(c, cells);
    Db.add(cells, (c.hx == null ? c.x : c.hx) * grid.dpr, (c.hy == null ? c.y : c.hy) * grid.dpr, rnd, grid.dpr);
  }

  /** Смена вида: старые распадаются на ячейки, из ячеек собираются новые. */
  S.setSpecies = function (id, instant) {
    var def = GP.species[id];
    if (!def || id === current) return;
    R.frame(time, opts.density);
    for (var i = 0; i < list.length; i++) dissolve(list[i]);
    list.length = 0;
    Pt.clear();
    current = id;
    A.buildColored(Pal.dustColors(id));
    // среда нового вида; прежний фон плавно тает
    if (bg.width > 0 && !instant) { var old = bgOld; bgOld = bg; bg = old; bgFade = 0; }
    Am.setSpecies(id);
    rebuildBg();
    spawn(def, targetCount(def), instant ? 0 : CFG.ASSEMBLE_DELAY_MS / 1000);
    if (instant) list.forEach(function (c) { c.asm = 1; c.asmDelay = 0; });
    dirty = true;
  };

  S.species = function () { return current; };
  S.count = function () { return current ? targetCount(GP.species[current]) : 0; };

  function fitCount() {
    if (!current) return;
    var def = GP.species[current], n = targetCount(def);
    while (list.length > n) {
      var c = list.splice((rnd() * list.length) | 0, 1)[0];
      R.frame(time, opts.density);
      dissolve(c);
    }
    if (list.length < n) spawn(def, n - list.length, 0);
    dirty = true;
  }

  // ------------------------------------------------------------ настройки

  S.set = function (o) {
    var regrid = false, recount = false;
    if (o.cell != null && o.cell !== opts.cell) { opts.cell = o.cell; autoCell = 0; regrid = true; }
    if (o.countScale != null && o.countScale !== opts.countScale) { opts.countScale = o.countScale; recount = true; }
    if (o.density != null) opts.density = o.density;
    if (o.paused != null) opts.paused = o.paused;
    if (o.saver != null) opts.saver = o.saver;
    if (o.adapt != null) opts.adapt = o.adapt;
    if (o.wallpaper != null) opts.wallpaper = o.wallpaper;
    if (o.fps != null) opts.fps = o.fps;
    var reAmbient = o.ambient != null && o.ambient !== opts.ambient;
    if (reAmbient) opts.ambient = o.ambient;
    Am.enabled = opts.ambient;
    Am.level = (reduced ? 0.4 : opts.saver ? 0.6 : 1) * ambientScale;
    if (canvas) {
      if (regrid) rebuildGrid();
      else if (reAmbient) rebuildBg();
      if (recount) fitCount();
      Pt.cap = Math.round(CFG.PARTICLES_MAX * particleScale * (opts.saver ? 0.5 : 1));
    }
    dirty = true;
  };

  S.setZone = function (z) { env.zone = z; };

  /** Клик по фону: импульс от точки и всплеск «пыли». */
  S.scatter = function (x, y) {
    if (reduced || opts.wallpaper) return;
    var i;
    Am.ripple(x, y, 10);
    for (i = 0; i < list.length; i++) Cr.impulse(list[i], x, y, CFG.CLICK_IMPULSE * rnd.range(0.75, 1.25));
    var rows = A.coloredRows || 1;
    for (i = 0; i < 30; i++) {
      var a = rnd() * U.TAU, sp = rnd.range(50, 260);
      Pt.spawn(x + Math.cos(a) * 6, y + Math.sin(a) * 6, Math.cos(a) * sp, Math.sin(a) * sp,
        rnd.range(0.5, 1.2), CFG.DUST[(rnd() * CFG.DUST.length) | 0], (rnd() * rows) | 0, 0.85);
    }
  };

  S.pointer = function (x, y, active) {
    env.mouse.x = x; env.mouse.y = y;
    env.mouse.active = active && !opts.wallpaper;
    if (active) windowActive = true;
  };

  // ------------------------------------------------------------------ кадр

  function step(dt) {
    time += dt; env.time = time;
    var i, j, c;
    for (i = 0; i < list.length; i++) {
      c = list[i];
      if (c.asmDelay > 0) c.asmDelay -= dt;
      else if (c.asm < 1) c.asm = Math.min(1, c.asm + dt / c.asmDur);
      c.update(dt, env);
    }
    // лёгкое отталкивание, чтобы существа не сливались в одно пятно
    for (i = 0; i < list.length; i++) {
      var a = list[i];
      for (j = i + 1; j < list.length; j++) {
        var b = list[j];
        var dx = b.x - a.x, dy = b.y - a.y;
        var rr = (a.radius + b.radius) * 0.8 * (a.species.separation == null ? 1 : a.species.separation);
        var d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 < 0.01) continue;
        var d = Math.sqrt(d2), f = (1 - d / rr) * CFG.SEPARATION * dt / d;
        a.pushX -= dx * f; a.pushY -= dy * f;
        b.pushX += dx * f; b.pushY += dy * f;
      }
    }
    Am.update(dt, env);
    var carry = Am.water ? 0.4 : 0.9;       // «пыль» сносит ветром или течением
    Pt.update(dt, Am.flow.x * carry, Am.flow.y * carry);
    Db.update(dt);
    if (bgFade < 1) bgFade = Math.min(1, bgFade + dt / 0.7);
  }

  function render() {
    var cd = grid.cd, i, c;
    ctx.globalAlpha = 1;
    ctx.drawImage(bg, 0, 0);
    if (bgFade < 1 && bgOld.width === bg.width) { ctx.globalAlpha = 1 - bgFade; ctx.drawImage(bgOld, 0, 0); ctx.globalAlpha = 1; }
    Am.draw(ctx, grid);

    // сетка проявляется только рядом с существами
    for (i = 0; i < list.length; i++) {
      c = list[i];
      var vis = c.alpha * (c.asm > 0.999 ? 1 : c.asm);
      if (vis <= 0.01) continue;
      var need = c.radius / grid.cell + CFG.HALO_CELLS;
      var h = need <= HALO_SIZES[0] ? halos[0] : need <= HALO_SIZES[1] ? halos[1] : halos[2];
      var hx = c.hx == null ? c.x : c.hx, hy = c.hy == null ? c.y : c.hy;
      ctx.globalAlpha = CFG.GRID_ALPHA_NEAR * vis * (0.6 + 0.4 * c.depth);
      ctx.drawImage(h.canvas, (Math.round(hx / grid.cell) - h.rc) * cd, (Math.round(hy / grid.cell) - h.rc) * cd);
    }

    R.frame(time, opts.density);
    Pt.draw(ctx, grid);
    for (i = 0; i < list.length; i++) {
      c = list[i];
      if (c.palVer !== Pal.version) { c.ramps = Pal.rampsFor(c.species.id, c.hue); c.palVer = Pal.version; }
      R.draw(c, null);
    }
    Db.draw(ctx, grid);
    ctx.globalAlpha = 1;
  }

  function degrade() {
    // качество снижается автоматически: крупнее ячейка, меньше частиц
    var changed = false;
    if (opts.cell + autoCell < CFG.CELL_MAX) { autoCell++; changed = true; }
    if (particleScale > 0.3) { particleScale *= 0.7; ambientScale *= 0.75; changed = true; }
    if (changed) {
      Am.level = (reduced ? 0.4 : opts.saver ? 0.6 : 1) * ambientScale;
      rebuildGrid();
      Pt.cap = Math.round(CFG.PARTICLES_MAX * particleScale * (opts.saver ? 0.5 : 1));
      S.stats.degraded++;
    }
  }

  function frameCap() {
    if (opts.fps) return opts.fps;
    if (opts.wallpaper) return CFG.FPS_WALLPAPER;
    if (opts.saver || !windowActive) return CFG.FPS_SAVER;
    return 0;
  }

  function frame(ts) {
    raf = requestAnimationFrame(frame);
    if (!last) { last = ts; return; }
    var cap = frameCap();
    if (cap && ts - last < 1000 / cap - 3) return;
    var real = (ts - last) / 1000;
    last = ts;

    var fading = Pal.tick(Math.min(real, 0.1));
    if (fading) { rebuildBg(); if (current) A.buildColored(Pal.dustColors(current)); dirty = true; }

    var busy = Db.count() > 0 || bgFade < 1;
    if (opts.paused && !dirty && !busy) return;

    var t0 = performance.now();
    var dt = Math.min(real, 0.05);
    if (!opts.paused) step(dt * (reduced ? 0.5 : 1));
    else { Db.update(dt); if (bgFade < 1) bgFade = Math.min(1, bgFade + dt / 0.7); }
    render();
    dirty = false;
    S.stats.ms = S.stats.ms * 0.9 + (performance.now() - t0) * 0.1;
    S.stats.creatures = list.length;
    S.stats.frames++;

    // счётчик кадров: средний fps ниже 45 в течение 3 секунд — снижаем качество
    if (perfSkip > 0) { perfSkip -= real; return; }
    perfT += real; perfN++;
    if (perfT >= CFG.FPS_WINDOW) {
      var fps = perfN / perfT;
      S.stats.fps = fps;
      if (opts.adapt && !cap && !opts.paused && fps < CFG.FPS_LOW) degrade();
      perfT = 0; perfN = 0;
    }
  }

  S.start = function () {
    if (running) return;
    running = true; last = 0; perfSkip = 1.5; perfT = 0; perfN = 0;
    raf = requestAnimationFrame(frame);
  };

  S.stop = function () {
    running = false;
    cancelAnimationFrame(raf);
  };

  S.refresh = function () { dirty = true; };
  S.paletteChanged = function () {
    if (!canvas) return;
    rebuildBg();
    if (current) A.buildColored(Pal.dustColors(current));
    dirty = true;
  };

  S.init = function (cv, o) {
    canvas = cv;
    ctx = canvas.getContext('2d', { alpha: false });
    var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    reduced = !!(mq && mq.matches);
    env.reduced = reduced;
    if (mq && mq.addEventListener) {
      mq.addEventListener('change', function (e) { reduced = env.reduced = e.matches; S.set({}); fitCount(); });
    }
    S.set(o || {});
    rebuildGrid();
    Pt.cap = Math.round(CFG.PARTICLES_MAX * (opts.saver ? 0.5 : 1));

    var resizeT = 0;
    window.addEventListener('resize', function () {
      clearTimeout(resizeT);
      resizeT = setTimeout(function () { rebuildGrid(); fitCount(); }, 80);
    });
    // вкладка скрыта — анимация стоит
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) S.stop(); else S.start();
    });
    // окно неактивно — 30 fps
    window.addEventListener('blur', function () { windowActive = false; env.mouse.active = false; });
    window.addEventListener('focus', function () { windowActive = true; });
  };
})(window.GP);
