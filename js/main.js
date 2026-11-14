/* Точка входа: настройки → палитра → сцена → интерфейс.
 *
 * Параметры адреса:
 *   ?wallpaper=1        режим обоев: только сцена, без интерфейса и курсора
 *   ?creature=koi       вид существ (в режиме обоев и для ссылок)
 *   ?fps=24             ограничение кадров
 *   ?cell=9  ?count=1.2 размер ячейки и множитель числа существ
 *   ?speed=0.5          множитель скорости существ
 *   ?palette=URL        адрес palette.json
 *   ?color=natural      режим цвета: auto | natural | adaptive
 *   ?adapt=0            не снижать качество автоматически */
(function (GP) {
  'use strict';

  var CFG = GP.config, U = GP.util;

  var DEFAULTS = {
    species: CFG.DEFAULT_SPECIES,
    name: '',
    countScale: 1,
    cell: CFG.CELL,
    density: CFG.GLYPH_DENSITY,
    paused: false,
    hint: true,
    saver: false,
    speed: 1,
    size: 1,
    react: 1,
    grid: 1,
    dust: 1,
    effects: 1,
    ground: 1,
    pickerHidden: false,
    tints: {},
    tintAll: '',
    voice: true,
    voiceAuto: false,
    voiceLang: '',
    colorMode: 'auto',
    paletteUrl: CFG.PALETTE_URL,
    searchUrl: CFG.SEARCH_URL
  };

  GP.DEFAULTS = DEFAULTS;

  function params() {
    var out = {};
    try {
      new URLSearchParams(location.search).forEach(function (v, k) { out[k] = v; });
    } catch (e) { /* нет URLSearchParams */ }
    return out;
  }

  function boot(saved) {
    var q = params();
    var s = Object.assign({}, DEFAULTS, saved || {});
    var wallpaper = q.wallpaper === '1' || q.wallpaper === 'true';

    // значения из хранилища могли устареть или быть испорчены
    if (!GP.species[s.species]) s.species = DEFAULTS.species;
    s.cell = U.clamp(Math.round(+s.cell) || CFG.CELL, CFG.CELL_MIN, CFG.CELL_MAX);
    s.countScale = U.clamp(+s.countScale || 1, 0.25, 2);
    s.density = U.clamp(isNaN(+s.density) ? CFG.GLYPH_DENSITY : +s.density, 0, 1);
    if (['auto', 'natural', 'adaptive'].indexOf(s.colorMode) < 0) s.colorMode = 'auto';
    // прежняя версия хранила эффекты среды как переключатель
    if (s.ambient === false && saved && saved.effects == null) s.effects = 0;
    delete s.ambient;
    var num = function (key, lo, hi) { var v = +s[key]; s[key] = U.clamp(isNaN(v) ? DEFAULTS[key] : v, lo, hi); };
    num('speed', 0.25, 2); num('size', 0.6, 1.6); num('react', 0, 2);
    num('grid', 0, 2); num('dust', 0, 2); num('effects', 0, 2); num('ground', 0, 2);
    s.pickerHidden = !!s.pickerHidden;
    // принудительные цвета: только #rrggbb; копия, чтобы не портить DEFAULTS
    var hex6 = /^#[0-9a-f]{6}$/i, tints = {};
    if (s.tints && typeof s.tints === 'object') {
      for (var tid in s.tints) if (GP.species[tid] && (s.tints[tid] === '' || hex6.test(s.tints[tid]))) tints[tid] = s.tints[tid];
    }
    s.tints = tints;
    if (!hex6.test(s.tintAll)) s.tintAll = '';

    // параметры адреса действуют на один сеанс и не сохраняются
    var live = Object.assign({}, s);
    if (q.creature && GP.species[q.creature]) live.species = q.creature;
    if (q.cell) live.cell = U.clamp(Math.round(+q.cell) || s.cell, CFG.CELL_MIN, CFG.CELL_MAX);
    if (q.count) live.countScale = U.clamp(+q.count || 1, 0.25, 2);
    if (q.speed) live.speed = U.clamp(+q.speed || 1, 0.25, 2);
    if (q.color && ['auto', 'natural', 'adaptive'].indexOf(q.color) >= 0) live.colorMode = q.color;
    if (q.palette) live.paletteUrl = q.palette;
    if (wallpaper) { live.paused = false; }

    document.body.classList.toggle('wallpaper', wallpaper);

    GP.Palette.init(live.colorMode);
    GP.Palette.setOverrides(GP.Palette.tintsFrom(live), true);
    GP.Scene.init(document.getElementById('scene'), {
      cell: live.cell, countScale: live.countScale, density: live.density,
      paused: live.paused, saver: live.saver, wallpaper: wallpaper,
      speed: live.speed, size: live.size, react: live.react, grid: live.grid, dust: live.dust, effects: live.effects, ground: live.ground,
      adapt: q.adapt !== '0', fps: U.clamp(+q.fps || 0, 0, 240)
    });

    if (wallpaper) {
      GP.Palette.onChange = function () { GP.Scene.paletteChanged(); };
    } else {
      // интерфейс работает с сохраняемыми настройками; вид из адреса — только на сеанс
      var ui = q.creature || q.cell || q.count || q.speed || q.color || q.palette ? live : s;
      GP.UI.init(ui);
    }

    GP.Scene.setSpecies(live.species);
    if (!wallpaper) GP.UI.sync();          // число существ известно только после появления вида
    GP.Scene.start();

    if (live.colorMode !== 'natural' && (!wallpaper || q.palette)) GP.Palette.startPolling(live.paletteUrl);
  }

  // Внешний интерфейс: им пользуется окно обоев (палитра читается с диска и
  // передаётся сюда) и отладка.
  window.GlyphPond = {
    setPalette: function (obj) { GP.Palette.setSystem(obj); },
    setSpecies: function (id) { if (GP.UI && GP.UI.select && !document.body.classList.contains('wallpaper')) GP.UI.select(id); else GP.Scene.setSpecies(id); },
    pause: function (on) { GP.Scene.set({ paused: !!on }); },
    stats: function () { return GP.Scene.stats; }
  };

  GP.Storage.load().then(boot, function () { boot({}); });
})(window.GP);
