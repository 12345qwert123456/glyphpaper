/* Dragonfly — вид сверху: тонкое длинное тело и четыре узких крыла под углом. */
(function (GP) {
  'use strict';

  // ------------------------------------------------------------ параметры
  var COUNT = 10;
  var ENV = 'reeds';       // среда вида (см. js/ambient.js)
  var DRIFT = 0.25;         // насколько ветер или течение сносит существо
  var PALETTE = {
    dot: '#4fe0a8',
    materials: [
      { role: 'secondary', stops: ['#0f5a3f', '#1f9d6b', '#4fe0a8', '#c9ffe8'] }, // тело
      { role: 'secondary', stops: ['#1c6f58', '#58d8ae', '#c9ffe8'] },             // крылья
      { role: 'on_surface_variant', stops: ['#1f4a48', '#4f9a8f', '#b4e6da'] }   // среда: камыши над водой
    ]
  };
  var UNIT = 1.0;                       // масштаб тела в ячейках
  var WING_LEN = [5.2, 4.6];            // передняя и задняя пара, единиц тела
  var WING_ANGLE = [66, 116];           // угол к оси тела, градусы
  var WING_HALF = 0.5;                  // полуширина крыла
  var HOVER = [0.8, 3.0];               // сек зависания
  var DASH_DIST = [140, 460];           // px
  var DASH_TIME = [0.32, 0.6];          // сек
  var JITTER = 2.2;                     // px — дрожание при зависании
  // ----------------------------------------------------------------------

  var U = GP.util, R = GP.Raster, Cr = GP.Creature, DEG = Math.PI / 180;

  function Dragonfly(env, rnd, x, y) {
    Cr.init(this, SPECIES, env, rnd, { x: x, y: y });
    this.state = 0;                      // 0 зависание, 1 бросок
    this.timer = rnd.range(0.3, HOVER[1]);
    this.dashDir = rnd() * U.TAU;
    this.tau = 0; this.dur = 0.4; this.dist = 200;
    this.trail = 0;
    this.w = new Float32Array(16);       // крылья: точка крепления, направление, длина
    this.px = x; this.py = y;
    this.geom(env);
  }

  Dragonfly.prototype.geom = function (env) {
    this.cell = env.cell;
    this.u = UNIT * this.size * env.cell;
    this.radius = this.u * 5.8;
  };

  Dragonfly.prototype.pickDash = function (env, ax, ay) {
    var a = ax == null ? this.rnd() * U.TAU : Math.atan2(ay, ax) + this.rnd.range(-0.6, 0.6);
    this.dashDir = Cr.inwardBias(this, env, a, 140);
  };

  Dragonfly.prototype.onScare = function (dx, dy) {
    this.dashDir = Math.atan2(dy, dx) + this.rnd.range(-0.5, 0.5);
    if (this.state === 0) this.timer = Math.min(this.timer, 0.12);
  };

  Dragonfly.prototype.update = function (dt, env) {
    if (env.cell !== this.cell) this.geom(env);
    this.t += dt;
    var vx = 0, vy = 0;

    if (this.held || this.thrown) { this.state = 0; this.timer = Math.max(this.timer, 0.4); }
    if (this.state === 0) {
      // зависает с дрожанием; перед броском быстро разворачивается
      this.timer -= dt * (1 + 1.5 * this.excite);
      if (!this.held && this.excite > 0.35 && env.mouse.active && this.timer > 0.3) {
        this.pickDash(env, this.x - env.mouse.x, this.y - env.mouse.y);
        this.timer = 0.25;
      }
      if (this.timer < 0.3) this.heading = U.turnToward(this.heading, this.dashDir, 10 * dt);
      else this.heading += (U.noise1(this.t * 0.6, this.seed) - 0.5) * 1.2 * dt;
      if (this.timer <= 0) {
        this.state = 1; this.tau = 0;
        this.heading = this.dashDir;
        this.dur = this.rnd.range(DASH_TIME[0], DASH_TIME[1]);
        this.dist = this.rnd.range(DASH_DIST[0], DASH_DIST[1]) * this.speedMul;
      }
    } else {
      // резкий бросок по прямой и остановка
      this.tau += dt / this.dur;
      var v = this.dist / this.dur * 2 * Math.max(0, 1 - this.tau);
      vx = Math.cos(this.heading) * v; vy = Math.sin(this.heading) * v;
      this.trail -= v * dt;
      if (this.trail <= 0 && this.asm >= 1) {
        this.trail = 14;
        env.dust(this.x - Math.cos(this.heading) * this.u * 5, this.y - Math.sin(this.heading) * this.u * 5,
          0, 0, this.rnd.range(0.35, 0.8), this.rnd() < 0.7 ? '-' : '.', this.rnd() < 0.5 ? 0 : 1, 0.6);
      }
      if (this.tau >= 1) {
        this.state = 0;
        this.timer = this.rnd.range(HOVER[0], HOVER[1]);
        this.pickDash(env);
      }
    }
    Cr.move(this, dt, env, vx, vy);

    var jit = this.state === 0 ? JITTER : 0.6;
    this.px = this.x + (U.noise1(this.t * 9, this.seed + 1) - 0.5) * 2 * jit;
    this.py = this.y + (U.noise1(this.t * 9, this.seed + 2) - 0.5) * 2 * jit;
    this.cos = Math.cos(this.heading); this.sin = Math.sin(this.heading);

    // крылья мелко дрожат
    for (var k = 0; k < 4; k++) {
      var pair = k >> 1, side = k & 1 ? 1 : -1;
      var a = (WING_ANGLE[pair] * DEG + Math.sin(this.t * 47 + k * 1.9) * 0.1 * (1 + this.excite)) * side;
      var o = k * 4;
      this.w[o] = (pair ? 1.3 : 2.0) * this.u;            // крепление на груди
      this.w[o + 1] = Math.cos(a); this.w[o + 2] = Math.sin(a);
      this.w[o + 3] = WING_LEN[pair] * this.u;
    }
    this.wingLum = 0.55 + 0.3 * U.noise1(this.t * 14, this.seed + 3);
  };

  Dragonfly.prototype.bounds = function (b) {
    var r = this.radius + this.cell;
    b.x0 = this.px - r; b.y0 = this.py - r; b.x1 = this.px + r; b.y1 = this.py + r;
  };

  Dragonfly.prototype.sample = function (x, y) {
    var dx = x - this.px, dy = y - this.py;
    var lx = dx * this.cos + dy * this.sin, ly = -dx * this.sin + dy * this.cos;
    var u = this.u, q, ex, ey;
    R.u = lx / this.cell + 30; R.v = ly / this.cell + 30;
    // голова
    ex = lx - 3.3 * u;
    if (ex * ex + ly * ly < 0.4 * u * u) { R.m = 0; return 0.95; }
    // грудь
    ex = (lx - 1.9 * u) / (1.25 * u); ey = ly / (0.74 * u);
    q = ex * ex + ey * ey;
    if (q < 1) { R.m = 0; return 0.62 + 0.25 * (1 - q); }
    // крылья
    for (var k = 0; k < 4; k++) {
      var o = k * 4;
      var wx = lx - this.w[o];
      var t = (wx * this.w[o + 1] + ly * this.w[o + 2]) / this.w[o + 3];
      if (t < 0 || t > 1) continue;
      var d = Math.abs(wx * this.w[o + 2] - ly * this.w[o + 1]);
      var half = WING_HALF * u * (0.42 + 0.58 * Math.sin(Math.PI * Math.min(1, t * 1.12)));
      if (d < half) {
        R.m = 1; R.a = 0.8; R.u = t * 6 + k * 11; R.v = d / this.cell;
        return this.wingLum * (0.75 + 0.35 * t);
      }
    }
    return 0;
  };

  Dragonfly.prototype.strokes = function (add) {
    // длинное брюшко
    var u = this.u, c = this.cos, s = this.sin;
    var x1 = this.px + 0.9 * u * c, y1 = this.py + 0.9 * u * s;
    var x2 = this.px - 2.2 * u * c, y2 = this.py - 2.2 * u * s;
    var x3 = this.px - 5.4 * u * c, y3 = this.py - 5.4 * u * s;
    add(x1, y1, x2, y2, 0, 0.78, 1, 1);
    add(x2, y2, x3, y3, 0, 0.56, 1, 0.9);
  };

  var SPECIES = GP.species.dragonfly = {
    id: 'dragonfly', env: ENV, drift: DRIFT, label: 'Dragonfly', count: COUNT, palette: PALETTE,
    create: function (env, rnd, x, y) { return new Dragonfly(env, rnd, x, y); }
  };
})(window.GP);
