/* Swan — вид сверху: белое тело с сложенными крыльями, S-образная шея, оранжевый клюв.
 * Величаво скользит по воде, шея покачивается, за ней расходятся круги. */
(function (GP) {
  'use strict';

  // ------------------------------------------------------------ параметры
  var COUNT = 6;
  var ENV = 'lily';          // среда вида (см. js/ambient.js)
  var DRIFT = 0.2;           // насколько течение сносит существо
  var PALETTE = {
    dot: '#e6e9ef',
    materials: [
      { role: 'on_surface', stops: ['#6d7480', '#b9c0cc', '#e6e9ef', '#f4f5f8'] },      // оперение
      { role: 'tertiary', stops: ['#8a3a10', '#e0782a', '#ffae5a'] },                  // клюв
      { role: 'secondary', stops: ['#1d4258', '#3f86a6', '#a6d8ea'] }   // среда: пруд
    ]
  };
  var UNIT = 1.0;
  var SIZE = [1.0, 1.6];
  var SPEED = [8, 20];       // px/с
  var TURN = 0.3;            // рад/с — размах блуждания
  var NECK_PTS = 8;          // точек вдоль шеи
  // ----------------------------------------------------------------------

  var U = GP.util, R = GP.Raster, Cr = GP.Creature;

  function cap(px, py, ax, ay, bx, by, r0, r1) {
    var ex = bx - ax, ey = by - ay;
    var t = ((px - ax) * ex + (py - ay) * ey) / (ex * ex + ey * ey || 1);
    if (t < 0) t = 0; else if (t > 1) t = 1;
    var qx = px - ax - ex * t, qy = py - ay - ey * t, rr = r0 + (r1 - r0) * t;
    cap.t = t;
    return (qx * qx + qy * qy) / (rr * rr);
  }

  function Swan(env, rnd, x, y) {
    var k = rnd();
    Cr.init(this, SPECIES, env, rnd, { depth: k, x: x, y: y });
    this.size = U.lerp(SIZE[0], SIZE[1], k);
    this.baseSpeed = rnd.range(SPEED[0], SPEED[1]);
    this.mode = 0; this.modeT = rnd.range(3, 9); this.mult = 1;
    this.neckA = rnd() * U.TAU; this.neckB = rnd() * U.TAU; this.turnRate = 0;
    this.neck = new Float32Array(NECK_PTS * 2);
    this.rippleT = rnd.range(1.5, 4);
    this.geom(env);
    this.cos = Math.cos(this.heading); this.sin = Math.sin(this.heading);
    this.shape();
  }

  Swan.prototype.geom = function (env) {
    this.cell = env.cell;
    this.u = UNIT * this.size * env.cell;
    this.radius = this.u * 5.6;
  };

  /** Шея: изгибается S-образно, покачивается и отклоняется в сторону поворота. */
  Swan.prototype.shape = function () {
    var u = this.u, sA = Math.sin(this.t * 0.55 + this.neckA) * 0.7 - this.turnRate * 1.4;
    var sB = Math.sin(this.t * 0.9 + this.neckB) * 0.45;
    for (var i = 0; i < NECK_PTS; i++) {
      var t = i / (NECK_PTS - 1);
      this.neck[i * 2] = (2.0 + 2.9 * t) * u;
      this.neck[i * 2 + 1] = u * (1.15 * Math.sin(t * Math.PI * 0.9) * sA + 0.55 * Math.sin(t * Math.PI * 2) * sB);
    }
  };

  Swan.prototype.update = function (dt, env) {
    if (env.cell !== this.cell) this.geom(env);
    this.t += dt;
    var free = !this.held && !this.thrown, h0 = this.heading;
    if (free) {
      this.heading += (U.noise1(this.t * 0.17, this.seed) - 0.5) * 2 * TURN * dt;
      this.modeT -= dt;
      if (this.modeT <= 0) { this.mode = 1 - this.mode; this.modeT = this.mode ? this.rnd.range(1.5, 3.5) : this.rnd.range(4, 11); }
    }
    this.mult += ((this.mode ? 0.25 : 1) - this.mult) * Math.min(1, dt * 1.2);   // иногда замирает
    var v = this.baseSpeed * this.speedMul * this.mult;
    this.cos = Math.cos(this.heading); this.sin = Math.sin(this.heading);
    Cr.move(this, dt, env, this.cos * v, this.sin * v);
    this.cos = Math.cos(this.heading); this.sin = Math.sin(this.heading);
    this.turnRate += (U.angDiff(h0, this.heading) / Math.max(dt, 1e-3) - this.turnRate) * Math.min(1, dt * 3);
    this.shape();

    this.rippleT -= dt * (0.4 + this.mult);
    if (this.rippleT <= 0 && this.asm >= 1) {
      this.rippleT = this.rnd.range(2, 4.5);
      var bx = this.x - this.cos * this.u * 3.4, by = this.y - this.sin * this.u * 3.4;
      env.dust(bx, by, 0, 0, this.rnd.range(0.7, 1.4), this.rnd.pick(['.', 'o', ':']), 2, 0.5);
      GP.Ambient.ripple(bx, by, 4);
    }
  };

  Swan.prototype.bounds = function (b) {
    var r = this.radius;
    b.x0 = this.x - r; b.y0 = this.y - r; b.x1 = this.x + r; b.y1 = this.y + r;
  };

  Swan.prototype.sample = function (x, y) {
    var dx = x - this.x, dy = y - this.y;
    var lx = dx * this.cos + dy * this.sin, ly = -dx * this.sin + dy * this.cos;
    var u = this.u, q, i, n = this.neck, N = NECK_PTS;
    R.u = lx / this.cell + 40; R.v = ly / this.cell + 40;

    // голова, глаз и клюв
    var hx = n[(N - 1) * 2], hy = n[(N - 1) * 2 + 1];
    var tx = hx - n[(N - 2) * 2], ty = hy - n[(N - 2) * 2 + 1], tl = Math.sqrt(tx * tx + ty * ty) || 1;
    tx /= tl; ty /= tl;
    var ex = lx - hx, ey = ly - hy;
    if (ex * ex + ey * ey < 0.4 * u * u) {
      R.m = 0; return (ex * tx + ey * ty > 0.1 * u && Math.abs(-ex * ty + ey * tx) > 0.18 * u) ? 0.1 : 0.9;
    }
    q = cap(lx, ly, hx + tx * 0.2 * u, hy + ty * 0.2 * u, hx + tx * 1.35 * u, hy + ty * 1.35 * u, 0.26 * u, 0.1 * u);
    if (q < 1) { R.m = 1; return 0.78 - 0.2 * cap.t; }
    // шея
    for (i = 0; i < N - 1; i++) {
      q = cap(lx, ly, n[i * 2], n[i * 2 + 1], n[i * 2 + 2], n[i * 2 + 3], (0.58 - 0.1 * i / N) * u, (0.58 - 0.1 * (i + 1) / N) * u);
      if (q < 1) { R.m = 0; R.u = i * 2 + cap.t * 2; R.v = 0; return 0.82 - 0.1 * q; }
    }
    // тело — яйцо с заострённым хвостом
    var a = 2.9 * u, b = 1.75 * u;
    ex = (lx + 0.4 * u) / a; ey = ly / b;
    q = ex * ex + ey * ey;
    var tail = lx < -2.4 * u && lx > -4.3 * u && Math.abs(ly) < 0.75 * u * (1 - (-2.4 * u - lx) / (1.9 * u));
    if (q >= 1 && !tail) return 0;
    R.m = 0;
    // сложенные крылья: ряды перьев по бокам, края светлее
    var ay = Math.abs(ly) / u, feather = Math.sin(lx / u * 2.6 + ay * 2.4);
    var wing = ay > 0.3 && ay < 1.5 && lx < 1.7 * u ? 0.12 * feather : 0;
    return 0.72 + 0.18 * (1 - Math.min(1, q)) + wing - (q > 0.82 ? 0.14 : 0);
  };

  var SPECIES = GP.species.swan = {
    id: 'swan', env: ENV, drift: DRIFT, label: 'Swan', count: COUNT, palette: PALETTE,
    hueJitter: 0.2, flicker: 0.1, separation: 0.7,
    create: function (env, rnd, x, y) { return new Swan(env, rnd, x, y); }
  };
})(window.GP);
