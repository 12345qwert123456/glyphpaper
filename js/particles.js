/* Частицы: «пыль» (лёгкий пул, до PARTICLES_MAX штук, жизнь 0,5–2 с)
 * и обломки-ячейки для распада существ при смене вида. */
(function (GP) {
  'use strict';

  var CFG = GP.config, A = GP.Atlas;

  // ------------------------------------------------------------- пыль

  var MAX = CFG.PARTICLES_MAX;
  var px = new Float32Array(MAX), py = new Float32Array(MAX);
  var vx = new Float32Array(MAX), vy = new Float32Array(MAX);
  var life = new Float32Array(MAX), span = new Float32Array(MAX), alp = new Float32Array(MAX);
  var glyph = new Uint8Array(MAX), shade = new Uint8Array(MAX);

  var P = GP.Particles = { n: 0, cap: MAX };

  /** glyphChar — символ из CFG.DUST, shadeRow — строка цветного атласа. */
  P.spawn = function (x, y, velX, velY, lifeSec, glyphChar, shadeRow, alpha) {
    if (P.n >= P.cap) return;
    var i = P.n++;
    px[i] = x; py[i] = y; vx[i] = velX; vy[i] = velY;
    life[i] = span[i] = lifeSec;
    var gi = A.index[glyphChar];
    glyph[i] = gi == null ? A.dust[0] : gi;
    shade[i] = shadeRow | 0;
    alp[i] = alpha == null ? 0.8 : alpha;
  };

  P.clear = function () { P.n = 0; };

  P.update = function (dt) {
    var drag = Math.exp(-1.3 * dt);
    for (var i = 0; i < P.n; i++) {
      life[i] -= dt;
      if (life[i] <= 0) {
        var l = --P.n;
        px[i] = px[l]; py[i] = py[l]; vx[i] = vx[l]; vy[i] = vy[l];
        life[i] = life[l]; span[i] = span[l]; alp[i] = alp[l];
        glyph[i] = glyph[l]; shade[i] = shade[l];
        i--;
        continue;
      }
      vx[i] *= drag; vy[i] *= drag;
      px[i] += vx[i] * dt; py[i] += vy[i] * dt;
    }
    if (P.n > P.cap) P.n = P.cap;
  };

  P.draw = function (ctx, grid) {
    if (!A.colored) return;
    var cd = grid.cd, cell = grid.cell, rows = A.coloredRows || 1;
    for (var i = 0; i < P.n; i++) {
      var k = life[i] / span[i];
      // быстро проявляется, медленно тает
      var a = alp[i] * (k > 0.85 ? (1 - k) / 0.15 : k < 0.6 ? k / 0.6 : 1);
      if (a <= 0.01) continue;
      ctx.globalAlpha = a > 1 ? 1 : a;
      ctx.drawImage(A.colored, glyph[i] * cd, (shade[i] % rows) * cd, cd, cd,
        Math.floor(px[i] / cell) * cd, Math.floor(py[i] / cell) * cd, cd, cd);
    }
  };

  // ---------------------------------------------------------- обломки

  var debris = [];
  var D = GP.Debris = {};

  /** cells — ячейки существа из Raster.draw(c, sink); cx, cy — его центр (px устройства). */
  D.add = function (cells, cx, cy, rnd, dpr) {
    var room = CFG.DEBRIS_MAX - debris.length;
    var step = cells.length > room ? Math.ceil(cells.length / Math.max(1, room)) : 1;
    for (var i = 0; i < cells.length; i += step) {
      var c = cells[i];
      var dx = c.x - cx, dy = c.y - cy;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      var sp = (50 + 170 * rnd()) * dpr;
      var ang = Math.atan2(dy, dx) + (rnd() - 0.5) * 1.6;
      c.vx = Math.cos(ang) * sp; c.vy = Math.sin(ang) * sp;
      c.delay = rnd() * 0.16;
      c.life = c.span = CFG.DISSOLVE_MS[0] / 1000 + rnd() * (CFG.DISSOLVE_MS[1] - CFG.DISSOLVE_MS[0]) / 1000 - c.delay;
      debris.push(c);
    }
  };

  D.count = function () { return debris.length; };
  D.clear = function () { debris.length = 0; };

  D.update = function (dt) {
    var w = 0;
    for (var i = 0; i < debris.length; i++) {
      var c = debris[i];
      if (c.delay > 0) { c.delay -= dt; debris[w++] = c; continue; }
      c.life -= dt;
      if (c.life <= 0) continue;
      c.x += c.vx * dt; c.y += c.vy * dt;
      c.vx *= 0.985; c.vy *= 0.985;
      debris[w++] = c;
    }
    debris.length = w;
  };

  D.draw = function (ctx, grid) {
    var cd = grid.cd, gap = grid.gap, last = '';
    for (var i = 0; i < debris.length; i++) {
      var c = debris[i];
      var k = c.delay > 0 ? 1 : c.life / c.span;
      var a = c.a * k;
      if (a < 0.012) continue;
      if (c.css !== last) { ctx.fillStyle = c.css; last = c.css; }
      var x = c.x + 0.5 | 0, y = c.y + 0.5 | 0;
      ctx.globalAlpha = a;
      ctx.fillRect(x, y, cd - gap, cd - gap);
      if (c.gi >= 0) {
        var ga = a * 1.25 + 0.04;
        ctx.globalAlpha = ga > 1 ? 1 : ga;
        ctx.drawImage(A.overlay, c.gi * cd, c.row * cd, cd, cd, x, y, cd, cd);
      }
    }
  };
})(window.GP);
