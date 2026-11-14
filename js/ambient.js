/* Среда вокруг существ: вода — волны, круги и пузырьки; воздух — порывы ветра,
 * пыльца и облака. Плюс неподвижные детали пространства (звёзды, песок, листья
 * кувшинок), которые запекаются в фон.
 *
 * Какая среда у вида — задаёт константа ENV в файле существа. Цвет среды —
 * последний материал его палитры, поэтому он следует за режимом Adaptive. */
(function (GP) {
  'use strict';

  var CFG = GP.config, U = GP.util, A = GP.Atlas, Pal = GP.Palette, C = GP.color;

  // ------------------------------------------------------------ параметры
  var FIELD_HZ = 8;          // как часто пересчитывается поле волн / облаков
  var FADE_IN = 1.4;         // сек — проявление среды после смены вида
  var RING_SPEED = 22;       // px/с — расхождение кругов на воде

  var PRESETS = {
    // луг: ветер волнами проходит по траве, летит пыльца
    meadow: {
      scene: {
        grass: { n: 50, h: [2, 7], colors: ['#2c7a38', '#3e9a4a', '#5cba5e'] },
        flowers: { n: 11, h: [4, 10], stem: '#3e9a4a', heads: ['#ee78ad', '#f5c542', '#ece9f4', '#b891f2', '#ff8f6b'] }
      },
      medium: 'air', specks: { d: 0.012, glyphs: "',.\"*v", a: [0.05, 0.13] },
      field: { type: 'bands', thr: 0.80, a: 0.045, k: 0.020 },
      wind: { base: 10, gust: 42, streaks: 10 }, motes: { n: 30, glyphs: ".'*", a: 0.28, fall: 0 }
    },
    // камыши над водой: ветер и редкие круги внизу
    reeds: {
      scene: {
        grass: { n: 34, h: [2, 6], colors: ['#27705a', '#35907a', '#58b89c'] },
        reeds: { n: 15, h: [8, 18], colors: ['#3c7a54', '#57986c'], head: '#96633a' }
      },
      medium: 'air', specks: { d: 0.014, glyphs: "|',.:", a: [0.05, 0.12] },
      field: { type: 'bands', thr: 0.82, a: 0.04, k: 0.018 },
      wind: { base: 8, gust: 34, streaks: 7 }, motes: { n: 16, glyphs: ".'", a: 0.2, fall: 0 },
      rings: { every: [2.5, 6] }
    },
    // ночное небо: звёзды, облака, длинные струи ветра
    sky: {
      scene: { ridge: { h: [4, 13], color: '#2b3548', edge: '#5d6b85' } },
      medium: 'air', specks: { d: 0.006, glyphs: ".+*.'", a: [0.06, 0.2] },
      field: { type: 'clouds', thr: 0.60, a: 0.055, k: 0.0042 },
      wind: { base: 14, gust: 30, streaks: 6, long: true }, motes: { n: 8, glyphs: ".", a: 0.18, fall: 0 }
    },
    // пруд сверху: блики, волны, круги, пузырьки
    pond: {
      scene: {
        sand: { rows: 4, color: '#b99c64' }, stones: { n: 8 },
        weeds: { n: 15, h: [5, 14], colors: ['#1d7a5a', '#2f9c72', '#55c28e'] }
      },
      medium: 'water', specks: { d: 0.010, glyphs: ".,:", a: [0.04, 0.10] },
      field: { type: 'caustic', thr: 0.42, a: 0.06, k: 0.030 },
      current: 5, arcs: { n: 10, len: [7, 18], speed: [6, 14] },
      bubbles: { rate: 1.3 }, rings: { every: [1.4, 3.5] }, motes: { n: 12, glyphs: ".,", a: 0.2, fall: 0 }
    },
    // пруд с листьями кувшинок
    lily: {
      scene: {
        reeds: { n: 9, h: [6, 14], colors: ['#3c7a54', '#57986c'], head: '#96633a' },
        weeds: { n: 8, h: [3, 8], colors: ['#1d7a5a', '#2f9c72', '#55c28e'] }, lotus: '#f08ab8'
      },
      medium: 'water', specks: { d: 0.014, glyphs: ".,\"o", a: [0.04, 0.10] }, pads: { n: 11, r: [2, 4.2], a: 0.06 },
      field: { type: 'caustic', thr: 0.46, a: 0.055, k: 0.028 },
      current: 4, arcs: { n: 5, len: [6, 14], speed: [6, 14] },
      bubbles: { rate: 0.5 }, rings: { every: [2, 5] }, motes: { n: 8, glyphs: ".,", a: 0.15, fall: 0 }
    },
    // толща воды сбоку: пузырьки поднимаются, течения, «морской снег»
    deep: {
      scene: {
        sand: { rows: 5, color: '#8f8b6c' }, stones: { n: 11 },
        weeds: { n: 12, h: [9, 24], colors: ['#1f6470', '#2f8d84', '#5abc9e'] },
        corals: { n: 7, colors: ['#dc647e', '#ea8c4c', '#c86cd2'] }
      },
      medium: 'water', side: true, specks: { d: 0.008, glyphs: ".:'", a: [0.04, 0.10] },
      field: { type: 'bands', thr: 0.84, a: 0.035, k: 0.016, flat: true },
      current: 6, arcs: { n: 6, len: [10, 26], speed: [10, 22], along: true },
      bubbles: { rate: 2.2 }, motes: { n: 46, glyphs: ".':", a: 0.2, fall: 9 }
    },
    // берег: песок, камешки, длинные волны прибоя
    shore: {
      scene: {
        stones: { n: 12 }, shells: { n: 12, colors: ['#f0a070', '#f2d6c2', '#e87a8c'] },
        weeds: { n: 5, h: [2, 5], colors: ['#3d7a58', '#5a9a70'] }
      },
      medium: 'water', specks: { d: 0.035, glyphs: ".,:;.", a: [0.05, 0.13] }, pads: { n: 14, r: [0.9, 1.8], a: 0.05 },
      field: { type: 'caustic', thr: 0.46, a: 0.055, k: 0.022 },
      current: 4, arcs: { n: 6, len: [16, 34], speed: [10, 20], same: true },
      bubbles: { rate: 0.4 }, motes: { n: 6, glyphs: ".", a: 0.14, fall: 0 }
    }
  };
  // ----------------------------------------------------------------------

  var Am = GP.Ambient = {
    flow: { x: 0, y: 0 },    // ветер или течение, px/с — сносит «пыль» и существ
    water: false,
    enabled: true,
    level: 1                 // 0..1: меньше при экономии и reduced-motion
  };

  var preset = null, species = null, rnd = U.rng(1234567);
  var W = 0, H = 0, cell = 9, t = 0, fade = 0, seed = 1;
  var row = 0;               // строка цветного атласа: средний тон среды (row + 1 — светлый)
  var dir = 0, dirBase = 0, strength = 0, gust = 0, gustT = 2, gustDur = 0, gustP = 1, bandPhase = 0;
  var streaks = [], motes = [], bubbles = [], rings = [], arcs = [];
  var ringT = 1, bubbleT = 0, streakT = 0;
  var fieldT = 0, fieldCells = [[], [], []];
  var arcDir = 0;
  var plants = [], sceneCss = {};       // растения у нижнего края и кэш их цветов

  Am.setSpecies = function (id) {
    species = GP.species[id];
    preset = PRESETS[species.env] || PRESETS.meadow;
    Am.water = preset.medium === 'water';
    seed = (Math.random() * 1e9) | 0;
    rnd = U.rng(seed);
    streaks.length = motes.length = bubbles.length = rings.length = arcs.length = 0;
    fieldCells[0].length = fieldCells[1].length = fieldCells[2].length = 0;
    fade = 0; fieldT = 0; gust = 0; gustP = 1; gustT = rnd.range(1, 3);
    dirBase = (rnd() < 0.5 ? 0 : Math.PI) + rnd.range(-0.22, 0.22);
    if (preset.side) dirBase = rnd() < 0.5 ? 0 : Math.PI;
    arcDir = rnd.range(-0.35, 0.35);            // гребни почти горизонтальны: «~» читается как волна
    buildPlants();
    Am.flow.x = Am.flow.y = 0;
    Am.colors();
  };

  /** Вызывается при смене палитры: строки атласа могли сдвинуться. */
  Am.colors = function () {
    if (species) row = (species.palette.materials.length - 1) * 2;
    sceneCss = {};
  };

  Am.resize = function (w, h, c) { W = w; H = h; cell = c; if (preset) buildPlants(); };

  /** Круг на воде (клик, приземление лягушки, рывок рыбы). */
  Am.ripple = function (x, y, cells) {
    if (!preset || !Am.enabled || !Am.water || preset.side || rings.length > 14) return;
    rings.push({ x: x, y: y, r: cell * 0.6, max: (cells || 7) * cell });
  };

  // ------------------------------------------------------------ декорации

  /** Цвет декорации; в режиме Adaptive оттенок тянется к цвету среды из палитры. */
  function sceneColor(hex) {
    var css = sceneCss[hex];
    if (css) return css;
    var c = C.hex(hex);
    if (Pal.active === 'adaptive') {
      var a = C.toHsl(Pal.ambient(species.id)[1]), h = C.toHsl(c);
      c = C.fromHsl(a[0] + (h[0] - a[0]) * 0.25, Math.min(h[1], Math.max(a[1], 0.25)), h[2]);
    }
    return (sceneCss[hex] = C.css(c));
  }

  /** Растения у нижнего края: трава, цветы, камыши, водоросли. Их число задано на 100 столбцов. */
  function buildPlants() {
    plants.length = 0;
    var sc = preset.scene;
    if (!sc || !W) return;
    var pr = U.rng(seed + 500), cols = Math.ceil(W / cell);
    function add(kind, def, extra) {
      var n = Math.round(def.n * cols / 100);
      for (var i = 0; i < n; i++) {
        var p = {
          kind: kind, col: pr() * cols, h: Math.round(pr.range(def.h[0], def.h[1])),
          css: (def.colors || [def.stem])[(pr() * (def.colors || [0]).length) | 0],
          ph: pr() * U.TAU, w: pr.range(0.6, 1.3), amp: pr.range(0.5, 1.2), a: pr.range(0.3, 0.5)
        };
        if (extra) extra(p, pr);
        plants.push(p);
      }
    }
    if (sc.grass) add('grass', sc.grass);
    if (sc.weeds) add('weed', sc.weeds, function (p) { p.amp *= 1.5; p.w *= 0.55; });
    if (sc.reeds) add('reed', sc.reeds, function (p) { p.head = sc.reeds.head; p.amp *= 0.6; });
    if (sc.flowers) add('flower', sc.flowers, function (p, r) { p.head = sc.flowers.heads[(r() * sc.flowers.heads.length) | 0]; p.amp *= 0.8; });
    plants.sort(function (a, b) { return a.h - b.h; });        // высокие рисуются поверх низких
  }

  function tile(ctx, grid, i, j, css, alpha, gi) {
    if (i < 0 || j < 0 || i >= grid.cols || j >= grid.rows) return;
    var cd = grid.cd;
    ctx.fillStyle = css;
    ctx.globalAlpha = alpha;
    ctx.fillRect(i * cd, j * cd, cd - grid.gap, cd - grid.gap);
    if (gi >= 0) {
      ctx.globalAlpha = Math.min(1, alpha * 1.3);
      ctx.drawImage(A.overlay, gi * cd, cd, cd, cd, i * cd, j * cd, cd, cd);
    }
  }

  /** Растения качаются: сами по себе и сильнее — от ветра или течения. */
  function drawPlants(ctx, grid, vis) {
    var bottom = grid.rows - 1, i, j, p;
    var lean = U.clamp(Am.flow.x / (Am.water ? 9 : 16), -3.2, 3.2);
    var gUp = A.strokes[2], gR = A.strokes[1], gL = A.strokes[3], gStar = A.index['*'], gAt = A.ramp[A.ramp.length - 1];
    for (i = 0; i < plants.length; i++) {
      p = plants[i];
      var css = sceneColor(p.css), prev = 0, x = 0, y = bottom;
      for (j = 0; j < p.h; j++) {
        var f = (j + 1) / p.h, bend = f * f;
        var sway = (Math.sin(t * p.w + p.ph + j * 0.38) * p.amp + lean) * bend;
        if (p.kind === 'weed') sway += Math.sin(j * 0.75 + p.ph) * 0.9;     // водоросль волнистая сама по себе
        x = Math.round(p.col + sway); y = bottom - j;
        var slope = sway - prev;
        prev = sway;
        var a = p.a * (1 - 0.3 * f) * vis;
        tile(ctx, grid, x, y, css, a, slope > 0.34 ? gR : slope < -0.34 ? gL : gUp);
        // листья водоросли — через одну ячейку по сторонам
        if (p.kind === 'weed' && j > 1 && j % 3 === 0) tile(ctx, grid, x + ((j / 3) % 2 ? 1 : -1), y, css, a * 0.6, -1);
      }
      if (p.kind === 'flower') {
        var hc = sceneColor(p.head), ha = Math.min(0.8, p.a * 1.5) * vis;
        tile(ctx, grid, x, y, hc, ha, gAt);
        if (p.h >= 6) {                                   // у высоких цветов — лепестки
          tile(ctx, grid, x - 1, y, hc, ha * 0.6, gStar); tile(ctx, grid, x + 1, y, hc, ha * 0.6, gStar);
          tile(ctx, grid, x, y - 1, hc, ha * 0.6, gStar);
        }
      } else if (p.kind === 'reed') {
        var rc = sceneColor(p.head);                      // бархатный початок камыша
        for (j = 0; j < 3; j++) tile(ctx, grid, x, y - j, rc, Math.min(0.75, p.a * 1.5) * vis, gAt);
      }
    }
  }

  /** Неподвижные декорации запекаются в фон: песок, камни, кораллы, горы, ракушки. */
  function bakeScene(b, grid) {
    var sc = preset.scene;
    if (!sc) return;
    var cd = grid.cd, cols = grid.cols, rows = grid.rows, pr = U.rng(seed + 900), i, j, k;
    function cellAt(ci, cj, css, alpha) {
      if (ci < 0 || cj < 0 || ci >= cols || cj >= rows) return;
      b.fillStyle = css; b.globalAlpha = alpha;
      b.fillRect(ci * cd, cj * cd, cd - grid.gap, cd - grid.gap);
    }
    b.font = '600 ' + Math.max(5, Math.round(cd * CFG.GLYPH_SCALE)) + 'px ' + CFG.FONT_MONO;
    b.textAlign = 'center'; b.textBaseline = 'middle';
    function glyphAt(ci, cj, ch, css, alpha) {
      b.fillStyle = css; b.globalAlpha = alpha;
      b.fillText(ch, ci * cd + cd / 2, cj * cd + cd / 2 + cd * 0.04);
    }

    if (sc.ridge) {
      // силуэт гор на горизонте
      var rc = sceneColor(sc.ridge.color), re = sceneColor(sc.ridge.edge);
      for (i = 0; i < cols; i++) {
        var hh = Math.round(U.lerp(sc.ridge.h[0], sc.ridge.h[1], U.noise1(i * 0.045, seed + 31)) +
          3 * U.noise1(i * 0.21, seed + 32) - 1.5);
        for (j = 0; j < hh; j++) {
          var top = j === hh - 1;
          cellAt(i, rows - 1 - j, top ? re : rc, top ? 0.42 : 0.5 - 0.22 * (j / hh) + 0.08 * U.hash(i, j, seed));
        }
        if (hh > 9 && U.hash(i, 3, seed + 33) < 0.5) glyphAt(i, rows - hh, '^', re, 0.5);     // снежные вершины
      }
    }
    if (sc.sand) {
      var sand = sceneColor(sc.sand.color);
      for (i = 0; i < cols; i++) {
        var dune = sc.sand.rows + Math.round(2.2 * U.noise1(i * 0.07, seed + 41) - 1);
        for (j = 0; j < dune; j++) {
          cellAt(i, rows - 1 - j, sand, (0.2 - 0.14 * (j / dune)) * (0.7 + 0.6 * U.hash(i, j, seed + 42)));
          if (U.hash(i, j, seed + 43) < 0.3) glyphAt(i, rows - 1 - j, '.:,'[(U.hash(i, j, seed + 44) * 3) | 0], sand, 0.4);
        }
      }
    }
    if (sc.stones) {
      var n = Math.round(sc.stones.n * cols / 100);
      for (k = 0; k < n; k++) {
        var sx = pr() * cols, rx = pr.range(1.3, 3.6), ry = rx * pr.range(0.5, 0.8), base = rows - pr.range(0, 1.5);
        for (j = Math.floor(base - ry * 2); j <= rows; j++) {
          for (i = Math.floor(sx - rx); i <= sx + rx; i++) {
            var ex = (i + 0.5 - sx) / rx, ey = (j + 0.5 - (base - ry * 0.4)) / ry;
            if (ex * ex + ey * ey > 1) continue;
            cellAt(i, j, ey < -0.45 ? '#8b93a0' : '#59606c', 0.34 + 0.12 * U.hash(i, j, seed + 51));   // верх камня светлее
          }
        }
      }
    }
    if (sc.corals) {
      var nc = Math.round(sc.corals.n * cols / 100);
      for (k = 0; k < nc; k++) {
        var cc = sceneColor(sc.corals.colors[(pr() * sc.corals.colors.length) | 0]);
        var bx = Math.floor(pr() * cols), arms = 2 + ((pr() * 3) | 0);
        for (var arm = 0; arm < arms; arm++) {
          var ax = bx, ay = rows - 1, hgt = 3 + ((pr() * 5) | 0);
          for (j = 0; j < hgt; j++) {
            cellAt(ax, ay, cc, 0.5 - 0.2 * (j / hgt));
            glyphAt(ax, ay, j === hgt - 1 ? '*' : '#', cc, 0.55);
            ay--;
            if (pr() < 0.45) ax += pr() < 0.5 ? -1 : 1;
          }
        }
      }
    }
    if (sc.shells) {
      // ракушки и морские звёзды по всему берегу
      var ns = Math.round(sc.shells.n * cols / 100);
      for (k = 0; k < ns; k++) {
        var hx = Math.floor(pr() * cols), hy = Math.floor(pr() * rows);
        var hc = sceneColor(sc.shells.colors[(pr() * sc.shells.colors.length) | 0]);
        if (pr() < 0.45) {                                   // звезда: крестик из пяти ячеек
          cellAt(hx, hy, hc, 0.42); glyphAt(hx, hy, '*', hc, 0.6);
          cellAt(hx - 1, hy, hc, 0.24); cellAt(hx + 1, hy, hc, 0.24); cellAt(hx, hy - 1, hc, 0.24); cellAt(hx, hy + 1, hc, 0.24);
        } else {
          cellAt(hx, hy, hc, 0.36); glyphAt(hx, hy, '@', hc, 0.55);
          if (pr() < 0.5) { cellAt(hx + 1, hy, hc, 0.22); glyphAt(hx + 1, hy, ')', hc, 0.45); }
        }
      }
    }
    b.globalAlpha = 1;
  }

  // ------------------------------------------------- неподвижные детали

  /** Запекает детали пространства в фон (вызывается при пересборке фона). */
  Am.bake = function (b, grid) {
    if (!preset || !Am.enabled) return;
    var cd = grid.cd, cols = grid.cols, rows = grid.rows, i, j, k;
    var stops = Pal.ambient(species.id);
    var mid = C.css(stops[1]), light = C.css(stops[stops.length - 1]);

    // пятна глубины: едва заметные области чуть светлее фона
    b.fillStyle = mid;
    for (j = 0; j < rows; j++) {
      for (i = 0; i < cols; i++) {
        var n = U.noise2(i * 0.055, j * 0.055, seed + 21);
        if (n > 0.6) {
          b.globalAlpha = Math.min(0.03, (n - 0.6) * 0.12) * (0.6 + 0.8 * U.hash(i, j, seed + 5));
          b.fillRect(i * cd, j * cd, cd - grid.gap, cd - grid.gap);
        }
      }
    }

    // листья кувшинок, камешки
    if (preset.pads) {
      var pr = U.rng(seed + 77);
      for (k = 0; k < preset.pads.n; k++) {
        var cx = pr() * cols, cy = pr() * rows, r = pr.range(preset.pads.r[0], preset.pads.r[1]);
        var notch = pr() * U.TAU;
        for (j = Math.floor(cy - r); j <= cy + r; j++) {
          for (i = Math.floor(cx - r); i <= cx + r; i++) {
            var dx = i + 0.5 - cx, dy = j + 0.5 - cy, d = Math.sqrt(dx * dx + dy * dy) / r;
            if (d > 1) continue;
            // вырез у листа кувшинки
            if (r > 2 && Math.abs(U.angDiff(Math.atan2(dy, dx), notch)) < 0.35 && d > 0.25) continue;
            b.globalAlpha = preset.pads.a * (0.55 + 0.6 * U.hash(i, j, seed + 9)) * (d > 0.75 ? 1.35 : 1);
            b.fillRect(i * cd, j * cd, cd - grid.gap, cd - grid.gap);
          }
        }
        // на части больших листьев — цветок лотоса
        if (preset.scene && preset.scene.lotus && r > 3 && pr() < 0.55) {
          var lx = Math.floor(cx), ly = Math.floor(cy);
          b.fillStyle = sceneColor(preset.scene.lotus);
          b.globalAlpha = 0.5; b.fillRect(lx * cd, ly * cd, cd - grid.gap, cd - grid.gap);
          b.globalAlpha = 0.26;
          b.fillRect((lx - 1) * cd, ly * cd, cd - grid.gap, cd - grid.gap); b.fillRect((lx + 1) * cd, ly * cd, cd - grid.gap, cd - grid.gap);
          b.fillRect(lx * cd, (ly - 1) * cd, cd - grid.gap, cd - grid.gap); b.fillRect(lx * cd, (ly + 1) * cd, cd - grid.gap, cd - grid.gap);
          b.fillStyle = mid;
        }
      }
    }

    // россыпь символов: трава, звёзды, песок — гуще в отдельных пятнах
    var sp = preset.specks, glyphs = sp.glyphs;
    b.font = '600 ' + Math.max(5, Math.round(cd * CFG.GLYPH_SCALE)) + 'px ' + CFG.FONT_MONO;
    b.textAlign = 'center'; b.textBaseline = 'middle';
    for (j = 0; j < rows; j++) {
      for (i = 0; i < cols; i++) {
        var h = U.hash(i, j, seed);
        var dens = sp.d * (0.35 + 1.9 * U.noise2(i * 0.09, j * 0.09, seed + 3));
        if (h >= dens) continue;
        var h2 = U.hash(i, j, seed + 1);
        b.fillStyle = h2 > 0.8 ? light : mid;
        b.globalAlpha = U.lerp(sp.a[0], sp.a[1], U.hash(i, j, seed + 2));
        b.fillText(glyphs[(h2 * glyphs.length) | 0], i * cd + cd / 2, j * cd + cd / 2 + cd * 0.04);
      }
    }
    b.globalAlpha = 1;
    bakeScene(b, grid);
  };

  // ---------------------------------------------------------- обновление

  function spawnStreak() {
    var long = preset.wind.long;
    var cx = Math.cos(dir), sx = Math.sin(dir);
    streaks.push({
      // появляются с наветренной стороны и по всему экрану
      x: rnd() < 0.5 ? (cx > 0 ? -40 : W + 40) : rnd() * W,
      y: rnd() * H,
      v: rnd.range(150, 280) * (0.6 + 0.4 * gust),
      len: Math.round(rnd.range(5, 12) * (long ? 1.7 : 1)),
      life: 0, span: rnd.range(0.9, 1.9), ph: rnd() * U.TAU,
      amp: rnd.range(0.3, 0.9), dx: cx, dy: sx
    });
  }

  function spawnArc() {
    var a = preset.arcs;
    var ang = a.along ? 0 : a.same ? arcDir : arcDir + rnd.range(-0.3, 0.3);
    arcs.push({
      x: rnd() * W, y: rnd() * H, ang: ang,
      len: Math.round(rnd.range(a.len[0], a.len[1])),
      v: rnd.range(a.speed[0], a.speed[1]) * (a.along ? (Math.cos(dirBase) >= 0 ? 1 : -1) : a.same ? 1 : rnd.sign()),
      along: !!a.along, life: 0, span: rnd.range(3.5, 7), ph: rnd() * U.TAU
    });
  }

  function spawnBubbles() {
    if (preset.side) {
      // поднимаются со дна короткой цепочкой
      var x = rnd() * W, n = 1 + ((rnd() * 3) | 0);
      for (var k = 0; k < n; k++) {
        bubbles.push({ x: x + rnd.range(-8, 8), y: H + 10 + k * rnd.range(14, 30), vy: -rnd.range(18, 38),
          life: 0, span: rnd.range(6, 12), ph: rnd() * U.TAU, rise: true });
      }
    } else {
      var bx = rnd() * W, by = rnd() * H, m = 1 + ((rnd() * 3) | 0);
      for (var q = 0; q < m; q++) {
        bubbles.push({ x: bx + rnd.range(-2, 2) * cell, y: by + rnd.range(-2, 2) * cell, vy: 0,
          life: -q * 0.25, span: rnd.range(1.6, 3.2), ph: 0, rise: false });
      }
    }
  }

  Am.update = function (dt, env) {
    if (!preset) return;
    t += dt;
    fade = Math.min(1, fade + dt / FADE_IN);
    var i, o, lvl = Am.level;

    // --- ветер / течение: спокойный фон и порывы
    dir = dirBase + (U.noise1(t * 0.05, seed + 4) - 0.5) * (Am.water ? 2.4 : 0.5);
    if (preset.wind) {
      gustT -= dt;
      if (gustT <= 0 && gustP >= 1) { gustP = 0; gustDur = rnd.range(1.6, 3.4); gustT = rnd.range(3.5, 8) + gustDur; }
      if (gustP < 1) gustP = Math.min(1, gustP + dt / gustDur);
      gust = gustP < 1 ? Math.pow(Math.sin(Math.PI * gustP), 2) : 0;
      strength = preset.wind.base + preset.wind.gust * gust;
    } else {
      gust = 0;
      strength = preset.current * (0.6 + 0.8 * U.noise1(t * 0.08, seed + 6));
    }
    Am.flow.x = Math.cos(dir) * strength * lvl; Am.flow.y = Math.sin(dir) * strength * lvl;
    if (preset.side) Am.flow.y *= 0.2;
    bandPhase += dt * (Am.water ? 0.35 : 0.25 + strength * 0.03);
    if (!Am.enabled) { Am.flow.x = Am.flow.y = 0; return; }

    // --- струи ветра
    if (preset.wind && lvl > 0.5) {
      streakT -= dt * preset.wind.streaks * (0.25 + 3.2 * gust);
      while (streakT <= 0) { streakT += 1; if (streaks.length < 90) spawnStreak(); }
      for (i = streaks.length - 1; i >= 0; i--) {
        o = streaks[i];
        o.life += dt / o.span;
        o.x += o.dx * o.v * dt; o.y += o.dy * o.v * dt;
        if (o.life >= 1) streaks.splice(i, 1);
      }
    }

    // --- пыльца, «морской снег»
    var mo = preset.motes, want = Math.round(mo.n * lvl * U.clamp(W * H / CFG.REF_AREA, 0.3, 1.8));
    while (motes.length < want) {
      motes.push({ x: rnd() * W, y: rnd() * H, vx: rnd.range(-3, 3), vy: rnd.range(-3, 3) + mo.fall * rnd.range(0.6, 1.3),
        ph: rnd() * U.TAU, g: A.index[mo.glyphs[(rnd() * mo.glyphs.length) | 0]], k: rnd.range(0.5, 1.2) });
    }
    if (motes.length > want) motes.length = want;
    for (i = 0; i < motes.length; i++) {
      o = motes[i];
      o.x += (o.vx + Am.flow.x * o.k + Math.sin(t * 0.7 + o.ph) * 4) * dt;
      o.y += (o.vy + Am.flow.y * o.k + Math.cos(t * 0.6 + o.ph) * 3) * dt;
      if (o.x < -10) o.x += W + 20; else if (o.x > W + 10) o.x -= W + 20;
      if (o.y < -10) o.y += H + 20; else if (o.y > H + 10) o.y -= H + 20;
    }

    // --- пузырьки
    if (preset.bubbles) {
      bubbleT -= dt * preset.bubbles.rate * lvl * U.clamp(W * H / CFG.REF_AREA, 0.3, 1.8);
      while (bubbleT <= 0) { bubbleT += 1; if (bubbles.length < 70) spawnBubbles(); }
      for (i = bubbles.length - 1; i >= 0; i--) {
        o = bubbles[i];
        o.life += dt;
        if (o.rise) {
          o.y += o.vy * dt;
          o.x += (Math.sin(t * 1.8 + o.ph) * 7 + Am.flow.x * 0.5) * dt;
        }
        if (o.life >= o.span || o.y < -12) {
          if (!o.rise && o.life >= o.span) Am.ripple(o.x, o.y, 2.6);   // пузырёк лопнул
          bubbles.splice(i, 1);
        }
      }
    }

    // --- круги на воде
    if (preset.rings) {
      ringT -= dt * lvl;
      if (ringT <= 0) {
        ringT = rnd.range(preset.rings.every[0], preset.rings.every[1]);
        Am.ripple(rnd() * W, rnd() * H, rnd.range(4, 9));
      }
    }
    for (i = rings.length - 1; i >= 0; i--) {
      o = rings[i];
      o.r += RING_SPEED * dt;
      if (o.r >= o.max) rings.splice(i, 1);
    }

    // --- гребни волн
    if (preset.arcs) {
      var na = Math.round(preset.arcs.n * lvl * U.clamp(W * H / CFG.REF_AREA, 0.4, 1.8));
      if (arcs.length < na && rnd() < dt * 2.5) spawnArc();
      for (i = arcs.length - 1; i >= 0; i--) {
        o = arcs[i];
        o.life += dt / o.span;
        if (o.along) o.x += o.v * dt;
        else { o.x += -Math.sin(o.ang) * o.v * dt; o.y += Math.cos(o.ang) * o.v * dt; }
        if (o.life >= 1) arcs.splice(i, 1);
      }
    }

    // --- поле волн / облаков пересчитывается несколько раз в секунду
    fieldT -= dt;
    if (fieldT <= 0) { fieldT = 1 / FIELD_HZ; field(env); }
  };

  function field(env) {
    var f = preset.field, cols = Math.ceil(W / cell), rows = Math.ceil(H / cell);
    var l0 = fieldCells[0], l1 = fieldCells[1], l2 = fieldCells[2];
    l0.length = l1.length = l2.length = 0;
    if (!f) return;
    var cx = Math.cos(dir), sy = Math.sin(dir), i, j, v;
    if (f.flat) { cx = 0; sy = 1; }
    var k = f.k * cell, thr = f.thr, span = 1 - thr;
    var drift = t * (f.type === 'clouds' ? 9 : 3);
    for (j = 0; j < rows; j++) {
      for (i = 0; i < cols; i++) {
        if (f.type === 'clouds') {
          var X = i * cell - Math.cos(dirBase) * drift, Y = j * cell;
          v = 0.62 * U.noise2(X * f.k, Y * f.k * 1.7, seed) + 0.38 * U.noise2(X * f.k * 2.6, Y * f.k * 3.6, seed + 8);
        } else if (f.type === 'caustic') {
          // блики на воде: тонкая неровная сеть там, где два медленно плывущих шума
          // проходят через середину — она течёт и перестраивается
          var kc = f.k * 3;
          var n = 0.5 * (U.noise2(i * kc + t * 0.06, j * kc, seed + 12) +
            U.noise2(i * kc - t * 0.045 + 31, j * kc + t * 0.035 + 17, seed + 14));
          v = 1 - Math.abs(2 * n - 1) * 4;
          if (v > 0) v *= 0.35 + 0.65 * U.noise2(i * 0.04 + t * 0.012, j * 0.04, seed + 13);
        } else {
          // полосы идут по ветру (течению), шум ломает их в отдельные гребни
          var warp = U.noise2(i * 0.07, j * 0.07 + t * 0.03, seed + 12);
          v = 0.5 + 0.5 * Math.sin((i * cx + j * sy) * k * 2.2 - bandPhase * 6 + warp * 7);
          v *= 0.55 + 0.45 * U.noise2(i * 0.035 + t * 0.02, j * 0.035, seed + 13);
        }
        if (v <= thr) continue;
        v = (v - thr) / span;
        (v > 0.66 ? l2 : v > 0.33 ? l1 : l0).push(i, j);
      }
    }
  }

  // ------------------------------------------------------------ отрисовка

  Am.draw = function (ctx, grid) {
    if (!preset || !Am.enabled || !A.colored) return;
    var cd = grid.cd, cl = grid.cell, gap = grid.gap, i, k, o, a;
    var img = A.colored, r0 = row * cd, r1 = (row + 1) * cd;
    var vis = fade * (0.5 + 0.5 * Am.level);

    // поле: едва заметные тайлы
    var f = preset.field;
    if (f) {
      var stops = Pal.ambient(species.id);
      ctx.fillStyle = C.css(stops[1]);
      for (k = 0; k < 3; k++) {
        var L = fieldCells[k];
        if (!L.length) continue;
        ctx.globalAlpha = f.a * (0.5 + 0.4 * k) * vis;
        for (i = 0; i < L.length; i += 2) ctx.fillRect(L[i] * cd, L[i + 1] * cd, cd - gap, cd - gap);
      }
    }

    if (plants.length) drawPlants(ctx, grid, fade);

    var gDash = A.index['-'], gWave = A.index['~'], gDot = A.index['.'], gSmall = A.index['o'], gBig = A.index['O'];

    // гребни волн: ~~~~
    for (i = 0; i < arcs.length; i++) {
      o = arcs[i];
      a = Math.sin(Math.PI * o.life) * 0.42 * vis;
      if (a < 0.01) continue;
      var ax = Math.cos(o.ang), ay = Math.sin(o.ang);
      for (k = 0; k < o.len; k++) {
        if ((k + ((o.ph * 3) | 0)) % 5 === 4) continue;
        var s = (k - o.len / 2) * cl, w = Math.sin(o.ph + k * 0.45 + t * 0.8) * cl * 0.9;
        var px = o.x + ax * s - ay * w, py = o.y + ay * s + ax * w;
        if (px < 0 || py < 0 || px >= W || py >= H) continue;
        ctx.globalAlpha = a * (0.45 + 0.55 * Math.sin(Math.PI * (k + 0.5) / o.len));
        ctx.drawImage(img, gWave * cd, r1, cd, cd, Math.floor(px / cl) * cd, Math.floor(py / cl) * cd, cd, cd);
      }
    }

    // круги на воде
    for (i = 0; i < rings.length; i++) {
      o = rings[i];
      a = (1 - o.r / o.max) * 0.42 * vis;
      var steps = Math.max(8, Math.round(U.TAU * o.r / cl));
      for (k = 0; k < steps; k++) {
        var th = k / steps * U.TAU;
        var qx = o.x + Math.cos(th) * o.r, qy = o.y + Math.sin(th) * o.r;
        if (qx < 0 || qy < 0 || qx >= W || qy >= H) continue;
        var q = Math.round((th + Math.PI / 2) / (Math.PI / 4));
        ctx.globalAlpha = a;
        ctx.drawImage(img, A.strokes[[0, 3, 2, 1][((q % 4) + 4) % 4]] * cd, r1, cd, cd,
          Math.floor(qx / cl) * cd, Math.floor(qy / cl) * cd, cd, cd);
      }
    }

    // пузырьки: . → o → O
    for (i = 0; i < bubbles.length; i++) {
      o = bubbles[i];
      if (o.life < 0) continue;
      var p = o.life / o.span;
      a = (p < 0.12 ? p / 0.12 : p > 0.85 ? (1 - p) / 0.15 : 1) * 0.5 * vis;
      var g = o.rise ? (p < 0.25 ? gDot : p < 0.6 ? gSmall : gBig) : (p < 0.35 ? gDot : p < 0.75 ? gSmall : gBig);
      if (o.x < 0 || o.y < 0 || o.x >= W || o.y >= H) continue;
      ctx.globalAlpha = a;
      ctx.drawImage(img, g * cd, r1, cd, cd, Math.floor(o.x / cl) * cd, Math.floor(o.y / cl) * cd, cd, cd);
    }

    // пыльца и «морской снег»
    for (i = 0; i < motes.length; i++) {
      o = motes[i];
      if (o.x < 0 || o.y < 0 || o.x >= W || o.y >= H) continue;
      ctx.globalAlpha = preset.motes.a * (0.45 + 0.55 * Math.sin(t * 0.9 + o.ph * 3)) * vis;
      ctx.drawImage(img, o.g * cd, (i & 1) ? r1 : r0, cd, cd, Math.floor(o.x / cl) * cd, Math.floor(o.y / cl) * cd, cd, cd);
    }

    // струи ветра: голова ярче, хвост тает
    for (i = 0; i < streaks.length; i++) {
      o = streaks[i];
      a = Math.sin(Math.PI * o.life) * 0.62 * vis;
      if (a < 0.01) continue;
      for (k = 0; k < o.len; k++) {
        var wob = Math.sin(o.ph + k * 0.55 - t * 3) * o.amp * cl;
        var sx = o.x - o.dx * k * cl - o.dy * wob, syy = o.y - o.dy * k * cl + o.dx * wob;
        if (sx < 0 || syy < 0 || sx >= W || syy >= H) continue;
        ctx.globalAlpha = a * (1 - k / o.len);
        ctx.drawImage(img, (k % 4 === 1 ? gWave : gDash) * cd, k < 4 ? r1 : r0, cd, cd,
          Math.floor(sx / cl) * cd, Math.floor(syy / cl) * cd, cd, cd);
      }
    }
    ctx.globalAlpha = 1;
  };
})(window.GP);
