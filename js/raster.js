/* Растеризатор: непрерывный силуэт существа сэмплируется в сетку ячеек
 * (покрытие по суперсэмплингу 3×3) и затеняется рампой плотности глифов.
 *
 * Существо обязано уметь:
 *   bounds(b)        — габарит в CSS px (b.x0, b.y0, b.x1, b.y1)
 *   sample(x, y)     — яркость 0..1 в точке (0 = пусто); дополнительно
 *                      пишет в Raster.m (материал), Raster.u / Raster.v
 *                      (координаты текстуры в ячейках тела), Raster.a (альфа)
 *   strokes(add)     — необязательно: тонкие детали линиями
 *                      add(x1, y1, x2, y2, material, lum, kind, alpha)
 *                      kind: 0 рампа, 1 штрих по направлению, 2 точка */
(function (GP) {
  'use strict';

  var CFG = GP.config, U = GP.util, A = GP.Atlas;
  var hash = U.hash;

  var R = GP.Raster = { m: 0, u: 0, v: 0, a: 1 };

  var ctx = null, grid = null, time = 0, density = CFG.GLYPH_DENSITY;
  var lastFill = '';
  var b = { x0: 0, y0: 0, x1: 0, y1: 0 };
  var mc = new Int16Array(16);

  // окно для штрихов
  var sCap = 0, sCnt, sLum, sAng, sAl, sMat, sKind;
  var wi0 = 0, wj0 = 0, ww = 0, wh = 0, cellW = 1;

  function ensure(n) {
    if (n <= sCap) return;
    sCap = Math.max(n, 4096);
    sCnt = new Float32Array(sCap); sLum = new Float32Array(sCap);
    sAng = new Float32Array(sCap); sAl = new Float32Array(sCap);
    sMat = new Uint8Array(sCap); sKind = new Uint8Array(sCap);
  }

  R.setup = function (context, g) { ctx = context; grid = g; };
  R.frame = function (t, glyphDensity) { time = t; density = glyphDensity; lastFill = ''; };

  function addStroke(x1, y1, x2, y2, m, lum, kind, alpha) {
    var dx = x2 - x1, dy = y2 - y1;
    var len = Math.sqrt(dx * dx + dy * dy);
    var steps = Math.max(1, Math.ceil(len / (cellW / 3)));
    var ang = Math.atan2(dy, dx);
    var al = alpha == null ? 1 : alpha;
    for (var k = 0; k <= steps; k++) {
      var t = k / steps;
      var i = Math.floor((x1 + dx * t) / cellW) - wi0;
      var j = Math.floor((y1 + dy * t) / cellW) - wj0;
      if (i < 0 || j < 0 || i >= ww || j >= wh) continue;
      var idx = j * ww + i;
      sCnt[idx] += 1;
      if (lum >= sLum[idx]) { sLum[idx] = lum; sMat[idx] = m; sKind[idx] = kind | 0; sAng[idx] = ang; sAl[idx] = al; }
    }
  }

  /** Рисует одну ячейку (или складывает её в sink при распаде существа). */
  function emit(c, sink, i, j, cov, lum, al, m, u, v, kind, ang) {
    var seed = c.seed;
    var n = hash(Math.floor(u), Math.floor(v), seed);
    // случайная яркость ячейки ±FLICKER, медленно мерцает
    var fl = 1 + c.flicker * (0.7 * (2 * n - 1) + 0.3 * Math.sin(time * (0.7 + 1.7 * n) + n * 53));
    var br = lum * fl * c.bright;
    if (br > 1) br = 1; else if (br < 0.04) br = 0.04;

    var ramp = c.ramps[m] || c.ramps[0];
    var level = (br * (CFG.SHADES - 1) + 0.5) | 0;
    var alpha = (CFG.TILE_ALPHA_MIN + (CFG.TILE_ALPHA_MAX - CFG.TILE_ALPHA_MIN) * br) * cov * al * c.alpha;
    if (alpha < 0.012) return;

    var cd = grid.cd;
    var X = i * cd, Y = j * cd;

    if (c.asm < 1) {
      // сборка: ячейка прилетает со своей задержкой и из своей точки
      var h3 = hash(i, j, seed + 3), h4 = hash(i, j, seed + 11);
      var t = (c.asm - h3 * 0.4) / 0.6;
      if (t <= 0) return;
      var e = U.easeOut(t);
      var dist = (3 + 9 * h3) * cd * (1 - e);
      X += Math.cos(h4 * U.TAU) * dist; Y += Math.sin(h4 * U.TAU) * dist;
      X = X + 0.5 | 0; Y = Y + 0.5 | 0;
      alpha *= e;
    }

    // символ
    var gi = -1, row = 0;
    if (hash(i, j, seed + 7) < density) {
      if (kind === 1) {
        var q = Math.round(ang / (Math.PI / 4));
        // в экранных координатах y направлен вниз: 45° — это «\»
        gi = A.strokes[[0, 3, 2, 1][((q % 4) + 4) % 4]];
      } else if (kind === 2) {
        gi = A.dust[(n * 3) | 0];
      } else {
        var gl = (br * (0.35 + 0.65 * cov) * A.ramp.length * 1.08) | 0;
        gi = A.ramp[gl >= A.ramp.length ? A.ramp.length - 1 : gl];
      }
      row = ramp.light[level]
        ? A.LIGHT_ROWS + Math.min(A.DARK_ROWS - 1, (br * A.DARK_ROWS) | 0)
        : Math.min(A.LIGHT_ROWS - 1, (br * A.LIGHT_ROWS) | 0);
    }

    if (sink) {
      sink.push({ x: X, y: Y, css: ramp.css[level], a: alpha, gi: gi, row: row });
      return;
    }

    var css = ramp.css[level];
    if (css !== lastFill) { ctx.fillStyle = css; lastFill = css; }
    ctx.globalAlpha = alpha;
    ctx.fillRect(X, Y, cd - grid.gap, cd - grid.gap);
    if (gi >= 0) {
      var ga = alpha * 1.25 + 0.05;
      ctx.globalAlpha = ga > 1 ? 1 : ga;
      ctx.drawImage(A.overlay, gi * cd, row * cd, cd, cd, X, Y, cd, cd);
    }
  }

  /** Рисует существо; если передан sink — только собирает его ячейки. */
  R.draw = function (c, sink) {
    c.bounds(b);
    var cell = grid.cell;
    var i0 = Math.floor(b.x0 / cell), i1 = Math.floor(b.x1 / cell);
    var j0 = Math.floor(b.y0 / cell), j1 = Math.floor(b.y1 / cell);
    if (i0 < 0) i0 = 0; if (j0 < 0) j0 = 0;
    if (i1 >= grid.cols) i1 = grid.cols - 1; if (j1 >= grid.rows) j1 = grid.rows - 1;
    if (i1 < i0 || j1 < j0) return;

    var i, j, idx;

    // --- тонкие детали (под телом)
    if (c.strokes) {
      wi0 = i0; wj0 = j0; ww = i1 - i0 + 1; wh = j1 - j0 + 1; cellW = cell;
      var total = ww * wh;
      ensure(total);
      sCnt.fill(0, 0, total); sLum.fill(0, 0, total);
      c.strokes(addStroke);
      for (j = 0; j < wh; j++) {
        for (i = 0; i < ww; i++) {
          idx = j * ww + i;
          var cnt = sCnt[idx];
          if (cnt < 2) continue;                 // ячейку задело только углом — линия остаётся тонкой
          var sc = cnt >= 3 ? 1 : cnt / 3;
          emit(c, sink, i + i0, j + j0, 0.4 + 0.6 * sc, sLum[idx], sAl[idx], sMat[idx],
            i + i0, j + j0, sKind[idx], sAng[idx]);
        }
      }
    }

    // --- заливка силуэта
    var SS = CFG.SUPERSAMPLE, inv = 1 / SS, total2 = SS * SS, mid = (SS - 1) / 2;
    for (j = j0; j <= j1; j++) {
      for (i = i0; i <= i1; i++) {
        var cov = 0, lum = 0, al = 0, u = 0, v = 0, got = false, used = 0;
        for (var sy = 0; sy < SS; sy++) {
          var py = (j + (sy + 0.5) * inv) * cell;
          for (var sx = 0; sx < SS; sx++) {
            R.a = 1;
            var l = c.sample((i + (sx + 0.5) * inv) * cell, py);
            if (l > 0) {
              if (cov === 0) { mc.fill(0); }
              cov++; lum += l; al += R.a; mc[R.m]++;
              if (!got || (sx === mid && sy === mid)) { u = R.u; v = R.v; got = true; }
            }
          }
        }
        if (cov === 0) continue;
        var best = 0, bm = 0;
        for (var k = 0; k < 16; k++) if (mc[k] > best) { best = mc[k]; bm = k; }
        used = cov / total2;
        emit(c, sink, i, j, Math.pow(used, 0.85), lum / cov, al / cov, bm, u, v, 0, 0);
      }
    }
  };
})(window.GP);
