/* Spider — вид сверху: брюшко с узором, головогрудь с глазами, восемь ломаных ног.
 * Перебежками, ноги шагают поочерёдно; замирает и подёргивает лапками. */
(function (GP) {
  'use strict';

  // ------------------------------------------------------------ параметры
  var COUNT = 7;
  var ENV = 'meadow';        // среда вида (см. js/ambient.js)
  var DRIFT = 0.3;           // насколько ветер сносит существо
  var PALETTE = {
    dot: '#c47a34',
    materials: [
      { role: 'tertiary', rotate: 20, stops: ['#2a1a0c', '#6a4220', '#b0743a', '#f0c080'] },    // тело
      { role: 'on_surface_variant', stops: ['#1c140c', '#4a3a28', '#8a7050', '#c4a878'] },      // ноги
      { role: 'on_surface', stops: ['#9a9aa0', '#dcdce0', '#ffffff'] },                        // глаза, узор
      { role: 'on_surface_variant', stops: ['#2a3f66', '#5f86c4', '#a9c8f0'] }                 // среда: луг
    ]
  };
  var UNIT = 1.6;
  var SIZE = [0.7, 1.2];
  var PAUSE = [0.5, 2.8];    // сек
  var RUN = [0.3, 1.2];      // сек
  var RUN_SPEED = [45, 110]; // px/с
  // ноги: корень x, угол от оси тела, длина бедра и голени (единиц тела)
  var LEGS = [[0.95, 0.5, 2.1, 2.2], [0.55, 1.05, 1.9, 2.1], [0.15, 1.85, 1.9, 2.1], [-0.2, 2.5, 2.2, 2.3]];
  // ----------------------------------------------------------------------

  var U = GP.util, R = GP.Raster, Cr = GP.Creature;

  function Spider(env, rnd, x, y) {
    var k = rnd();
    Cr.init(this, SPECIES, env, rnd, { depth: k, x: x, y: y });
    this.size = U.lerp(SIZE[0], SIZE[1], k);
    this.state = 0;                       // 0 стоит, 1 бежит
    this.timer = rnd.range(0.2, PAUSE[1]);
    this.tau = 0; this.dur = 0.6; this.peak = 60;
    this.legPh = rnd() * U.TAU;
    this.moving = 0;
    this.geom(env);
    this.cos = Math.cos(this.heading); this.sin = Math.sin(this.heading);
  }

  Spider.prototype.geom = function (env) {
    this.cell = env.cell;
    this.u = UNIT * this.size * env.cell;
    this.radius = this.u * 4.6;
  };

  Spider.prototype.onScare = function () { if (this.state === 0) this.timer = Math.min(this.timer, 0.08); };

  Spider.prototype.update = function (dt, env) {
    if (env.cell !== this.cell) this.geom(env);
    this.t += dt;
    var busy = this.held || this.thrown, v = 0;

    if (busy) { this.state = 0; this.timer = Math.max(this.timer, 0.5); }
    else if (this.state === 0) {
      this.timer -= dt * (1 + 2 * this.excite);
      if (this.timer <= 0) {
        this.state = 1; this.tau = 0;
        this.dur = this.rnd.range(RUN[0], RUN[1]);
        this.peak = this.rnd.range(RUN_SPEED[0], RUN_SPEED[1]) * this.speedMul;
        this.heading = Cr.inwardBias(this, env, this.heading + this.rnd.range(-1.1, 1.1), 110);
      }
    } else {
      this.tau += dt / this.dur;
      v = this.peak * Math.sin(Math.PI * Math.min(1, this.tau));
      if (this.tau >= 1) { this.state = 0; this.timer = this.rnd.range(PAUSE[0], PAUSE[1]); }
    }
    this.cos = Math.cos(this.heading); this.sin = Math.sin(this.heading);
    Cr.move(this, dt, env, this.cos * v, this.sin * v);
    this.cos = Math.cos(this.heading); this.sin = Math.sin(this.heading);

    this.moving += ((this.state || busy ? 1 : 0) - this.moving) * Math.min(1, dt * 10);
    this.legPh += dt * (busy ? 30 : 4 + v * 0.22);
  };

  Spider.prototype.bounds = function (b) {
    var r = this.radius;
    b.x0 = this.x - r; b.y0 = this.y - r; b.x1 = this.x + r; b.y1 = this.y + r;
  };

  Spider.prototype.sample = function (x, y) {
    var dx = x - this.x, dy = y - this.y;
    var lx = dx * this.cos + dy * this.sin, ly = -dx * this.sin + dy * this.cos;
    var u = this.u, ex, ey, q;
    R.u = lx / this.cell + 30; R.v = ly / this.cell + 30;
    // глаза: две крупные точки и две помельче
    ex = lx - 1.3 * u; ey = Math.abs(ly) - 0.32 * u;
    if (ex * ex + ey * ey < 0.045 * u * u) { R.m = 2; return 1; }
    ex = lx - 1.45 * u; ey = Math.abs(ly) - 0.1 * u;
    if (ex * ex + ey * ey < 0.02 * u * u) { R.m = 2; return 0.8; }
    // хелицеры
    ex = lx - 1.65 * u; ey = Math.abs(ly) - 0.28 * u;
    if (ex * ex + ey * ey < 0.06 * u * u) { R.m = 1; return 0.5; }
    // головогрудь
    ex = (lx - 0.55 * u) / (1.0 * u); ey = ly / (0.82 * u);
    q = ex * ex + ey * ey;
    if (q < 1) { R.m = 0; return 0.34 + 0.26 * (1 - q); }
    // брюшко: светлый шеврон на спине
    ex = (lx + 1.5 * u) / (1.7 * u); ey = ly / (1.3 * u);
    q = ex * ex + ey * ey;
    if (q < 1) {
      var s = ((-lx - 0.3 * u + Math.abs(ly) * 0.85) / (0.8 * u));
      if (Math.abs(ly) < 1.0 * u && s - Math.floor(s) < 0.24 && lx < -0.4 * u) { R.m = 2; return 0.72; }
      R.m = 0;
      return 0.5 + 0.32 * (1 - q);
    }
    return 0;
  };

  /** Восемь ног: бедро вперёд-наружу, голень загибается назад; шагают через одну. */
  Spider.prototype.strokes = function (add) {
    var u = this.u, c = this.cos, s = this.sin, x = this.x, y = this.y, mv = this.moving;
    function pt(px, py) { return [x + px * c - py * s, y + px * s + py * c]; }
    for (var sd = -1; sd <= 1; sd += 2) {
      for (var k = 0; k < 4; k++) {
        var L = LEGS[k], swing = Math.sin(this.legPh + k * 1.6 + (sd > 0 ? Math.PI : 0)) * 0.26 * mv;
        var a = L[1] + swing;
        var rx = L[0] * u, ry = sd * 0.55 * u;
        var kx = rx + Math.cos(a) * L[2] * u, ky = ry + sd * Math.sin(a) * L[2] * u;     // колено
        var fa = a + (k < 2 ? 0.95 : 0.55), fl = L[3] * u;
        var fx = kx + Math.cos(fa) * fl, fy = ky + sd * Math.sin(fa) * fl;               // кончик ноги
        var p0 = pt(rx, ry), p1 = pt(kx, ky), p2 = pt(fx, fy);
        add(p0[0], p0[1], p1[0], p1[1], 1, 0.85, 1, 1);
        add(p1[0], p1[1], p2[0], p2[1], 1, 0.7, 1, 1);
      }
    }
  };

  var SPECIES = GP.species.spider = {
    id: 'spider', env: ENV, drift: DRIFT, label: 'Spider', count: COUNT, palette: PALETTE,
    hueJitter: 0.5, flicker: 0.14,
    create: function (env, rnd, x, y) { return new Spider(env, rnd, x, y); }
  };
})(window.GP);
