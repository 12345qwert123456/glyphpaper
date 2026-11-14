/* Атлас глифов: символы заранее рисуются в canvas (по символу и яркости),
 * в кадре копируются через drawImage — это основной приём для 60 fps. */
(function (GP) {
  'use strict';

  var CFG = GP.config;

  // Строки атласа «overlay» — символ поверх тайла.
  var LIGHT_ALPHA = [0.18, 0.28, 0.40, 0.55]; // светлый символ на тёмном тайле
  var DARK_ALPHA = [0.26, 0.38, 0.50];        // тёмный символ на светлом тайле

  var A = GP.Atlas = {
    overlay: null,   // строки: 4 светлые ступени + 3 тёмные; столбцы: символы
    colored: null,   // строки: цвета «пыли» текущего вида; столбцы: символы
    cd: 0,
    LIGHT_ROWS: LIGHT_ALPHA.length,
    DARK_ROWS: DARK_ALPHA.length,
    ramp: [], strokes: [], dust: [],
    index: {}
  };

  var chars = '';

  function uniq(str) {
    var out = '';
    for (var i = 0; i < str.length; i++) if (out.indexOf(str[i]) < 0) out += str[i];
    return out;
  }

  function prep(ctx, cd) {
    ctx.font = '600 ' + Math.max(5, Math.round(cd * CFG.GLYPH_SCALE)) + 'px ' + CFG.FONT_MONO;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
  }

  function drawRow(ctx, cd, row, style, alpha) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = style;
    for (var i = 0; i < chars.length; i++) {
      ctx.fillText(chars[i], i * cd + cd / 2, row * cd + cd / 2 + cd * 0.04);
    }
  }

  /** Пересобирает атлас под размер ячейки cd (в пикселях устройства). */
  A.build = function (cd) {
    chars = uniq(CFG.RAMP + CFG.STROKES + CFG.DUST);
    A.cd = cd;
    A.index = {};
    for (var i = 0; i < chars.length; i++) A.index[chars[i]] = i;
    var map = function (s) { return s.split('').map(function (ch) { return A.index[ch]; }); };
    A.ramp = map(CFG.RAMP); A.strokes = map(CFG.STROKES); A.dust = map(CFG.DUST);

    var cv = A.overlay || (A.overlay = document.createElement('canvas'));
    cv.width = chars.length * cd;
    cv.height = (LIGHT_ALPHA.length + DARK_ALPHA.length) * cd;
    var ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    prep(ctx, cd);
    var r = 0;
    LIGHT_ALPHA.forEach(function (a) { drawRow(ctx, cd, r++, '#ffffff', a); });
    DARK_ALPHA.forEach(function (a) { drawRow(ctx, cd, r++, '#070910', a); });
  };

  /** Цветные символы для «пыли»: по строке на цвет. */
  A.buildColored = function (colors) {
    var cd = A.cd;
    var cv = A.colored || (A.colored = document.createElement('canvas'));
    var w = chars.length * cd, h = Math.max(1, colors.length) * cd;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    var ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    prep(ctx, cd);
    for (var r = 0; r < colors.length; r++) drawRow(ctx, cd, r, colors[r], 1);
    A.coloredRows = colors.length;
  };
})(window.GP);
