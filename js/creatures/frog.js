/* Frog — вид сверху: тело, голова с глазами, четыре лапы. Сидит, затем прыжок
 * по параболе; при приземлении расходится круг из точек. */
(function (GP) {
  'use strict';

  // ------------------------------------------------------------ параметры
  var COUNT = 8;
  var ENV = 'lily';        // среда вида (см. js/ambient.js)
  var DRIFT = 0;            // насколько ветер или течение сносит существо
  var PALETTE = {
    dot: '#6fd36a',
    materials: [
      { role: 'secondary', toward: [145, 0.5], stops: ['#17481f', '#2f8f3a', '#6fd36a', '#d6ffb8'] }, // кожа
      { role: 'secondary', toward: [145, 0.5], stops: ['#17481f', '#2f8f3a', '#5cc259'] },             // лапы
      { role: 'tertiary', stops: ['#1f4a3a', '#4a9a78', '#b8e6cf'] }   // среда: пруд с кувшинками
    ]
  };
  var UNIT = 1.1;                       // масштаб тела в ячейках
  var SIT = [1.2, 5.0];                 // сек между прыжками
  var CROUCH = 0.28;                    // сек подготовки к прыжку
  var JUMP_DIST = [90, 230];            // px
  var JUMP_TIME = [0.42, 0.68];         // сек в воздухе
  var JUMP_SCALE = 0.3;                 // насколько «ближе» лягушка в верхней точке
  var RING_DOTS = 16;                   // точек в круге при приземлении
  // ----------------------------------------------------------------------

  var U = GP.util, R = GP.Raster, Cr = GP.Creature;

  // лапы: [сидя x, y, в прыжке x, y] в единицах тела; y — для правой стороны
  var HIP = [-1.5, 1.0, -1.5, 0.9];
  var KNEE = [0.0, 2.9, -3.0, 1.5];
  var ANKLE = [-2.3, 2.5, -5.0, 1.1];
  var TOE = [-1.3, 4.0, -6.3, 1.9];
  var SHOULDER = [1.1, 1.1, 1.1, 1.1];
  var HAND = [2.3, 2.7, 0.4, 2.4];

  function Frog(env, rnd, x, y) {
    Cr.init(this, SPECIES, env, rnd, { x: x, y: y });
    this.state = 0;                      // 0 сидит, 1 приседает, 2 в воздухе
    this.timer = rnd.range(0.4, SIT[1]);
    this.target = this.heading;
    this.tau = 0; this.dur = 0.5; this.dist = 120;
    this.ext = 0; this.height = 0; this.scale = 1;
    this.turnT = rnd.range(0.5, 2);
    this.leg = new Float32Array(24);
    this.geom(env);
  }

  Frog.prototype.geom = function (env) {
    this.cell = env.cell;
    this.u0 = UNIT * this.size * env.cell;
    this.radius = this.u0 * 4.2;
  };

  Frog.prototype.plan = function (env, ax, ay) {
    var a = ax == null ? this.heading + this.rnd.range(-1.2, 1.2) : Math.atan2(ay, ax) + this.rnd.range(-0.5, 0.5);
    a = Cr.inwardBias(this, env, a, 110);
    this.dist = this.rnd.range(JUMP_DIST[0], JUMP_DIST[1]) * this.speedMul;
    // не приземляться на поле ввода
    var z = env.zone;
    for (var n = 0; z && n < 5; n++) {
      var lx = (this.x + Math.cos(a) * this.dist - z.x) / z.rx, ly = (this.y + Math.sin(a) * this.dist - z.y) / z.ry;
      if (lx * lx + ly * ly > 1) break;
      a += 0.7;
    }
    this.target = a;
    this.state = 1; this.timer = CROUCH;
  };

  Frog.prototype.onScare = function (dx, dy) {
    if (this.state === 0) this.plan(this.env, dx, dy);
  };

  Frog.prototype.update = function (dt, env) {
    if (env.cell !== this.cell) this.geom(env);
    this.env = env;
    this.t += dt;
    var vx = 0, vy = 0;

    var busy = this.held || this.thrown;       // в руке или в полёте после броска
    if (busy) { this.state = 0; this.timer = Math.max(this.timer, 0.5); this.target = this.heading; }
    if (this.state === 0) {
      this.timer -= dt;
      this.turnT -= dt;
      if (this.turnT <= 0) {            // иногда поворачивается на месте
        this.turnT = this.rnd.range(1.5, 4);
        this.target = this.heading + this.rnd.range(-0.9, 0.9);
      }
      this.heading = U.turnToward(this.heading, this.target, 5 * dt);
      if (busy) { /* ждёт, пока отпустят и перестанет кувыркаться */ }
      else if (this.excite > 0.35 && env.mouse.active) this.plan(env, this.x - env.mouse.x, this.y - env.mouse.y);
      else if (this.timer <= 0) this.plan(env);
      // в руке лапы свисают
      this.ext += ((busy ? 0.8 : 0) - this.ext) * Math.min(1, dt * 10);
      this.height = 0;
    } else if (this.state === 1) {
      this.timer -= dt;
      this.heading = U.turnToward(this.heading, this.target, 9 * dt);
      this.height = -0.12 * (1 - this.timer / CROUCH);        // приседает
      if (this.timer <= 0) {
        this.state = 2; this.tau = 0;
        this.heading = this.target;
        this.dur = this.rnd.range(JUMP_TIME[0], JUMP_TIME[1]);
      }
    } else {
      this.tau += dt / this.dur;
      var v = this.dist / this.dur;
      vx = Math.cos(this.heading) * v; vy = Math.sin(this.heading) * v;
      var k = Math.min(1, this.tau);
      this.height = 4 * k * (1 - k);                            // парабола
      this.ext = k < 0.15 ? k / 0.15 : k > 0.75 ? Math.max(0, (1 - k) / 0.25) : 1;
      if (this.tau >= 1) {
        this.state = 0;
        this.timer = this.rnd.range(SIT[0], SIT[1]);
        this.target = this.heading;
        this.height = 0;
        if (this.asm >= 1) this.ring(env);
      }
    }
    Cr.move(this, dt, env, vx, vy);

    this.scale = 1 + JUMP_SCALE * this.height;
    this.u = this.u0 * this.scale * (1 + 0.025 * Math.sin(this.t * 2.2));
    this.cos = Math.cos(this.heading); this.sin = Math.sin(this.heading);

    // лапы: интерполяция между «сидит» и «вытянуты в прыжке»
    var e = this.ext, pts = [HIP, KNEE, ANKLE, TOE, SHOULDER, HAND];
    for (var i = 0; i < 6; i++) {
      var p = pts[i];
      this.leg[i * 2] = (p[0] + (p[2] - p[0]) * e) * this.u;
      this.leg[i * 2 + 1] = (p[1] + (p[3] - p[1]) * e) * this.u;
    }
  };

  Frog.prototype.ring = function (env) {
    GP.Ambient.ripple(this.x, this.y, 8);             // круг на воде
    var r0 = this.u0 * 2.6;
    for (var i = 0; i < RING_DOTS; i++) {
      var a = i / RING_DOTS * U.TAU + this.rnd() * 0.2;
      env.dust(this.x + Math.cos(a) * r0, this.y + Math.sin(a) * r0, Math.cos(a) * 62, Math.sin(a) * 62,
        this.rnd.range(0.6, 1.0), i % 4 === 0 ? ':' : '.', i % 2, 0.75);
    }
  };

  Frog.prototype.bounds = function (b) {
    var r = this.u * (4.3 + 2.4 * this.ext) + this.cell;
    b.x0 = this.x - r; b.y0 = this.y - r; b.x1 = this.x + r; b.y1 = this.y + r;
  };

  Frog.prototype.sample = function (x, y) {
    var dx = x - this.x, dy = y - this.y;
    var lx = dx * this.cos + dy * this.sin, ly = -dx * this.sin + dy * this.cos;
    var u = this.u, ay = Math.abs(ly), ex, ey, q;
    var lift = 0.1 * this.height;
    R.u = lx / (this.cell * this.scale) + 30; R.v = ly / (this.cell * this.scale) + 30;
    // глаза
    ex = lx - 2.15 * u; ey = ay - 1.0 * u;
    if (ex * ex + ey * ey < 0.3 * u * u) { R.m = 0; return 1; }
    // голова
    ex = (lx - 1.7 * u) / (1.3 * u); ey = ly / (1.25 * u);
    q = ex * ex + ey * ey;
    if (q < 1) { R.m = 0; return 0.58 + 0.26 * (1 - q) + lift; }
    // тело с тёмными пятнами
    ex = (lx + 0.3 * u) / (2.0 * u); ey = ly / (1.4 * u);
    q = ex * ex + ey * ey;
    if (q < 1) {
      R.m = 0;
      var n = U.noise2(R.u * 0.62, R.v * 0.62, this.seed);
      return (n > 0.62 ? 0.36 : 0.52) + 0.3 * (1 - q) + lift;
    }
    // бёдра
    var hx = this.leg[0], hy = this.leg[1], kx = this.leg[2] - hx, ky = this.leg[3] - hy;
    var px = lx - hx, py = ay - hy;
    var t = (px * kx + py * ky) / (kx * kx + ky * ky || 1);
    if (t < 0) t = 0; else if (t > 1) t = 1;
    px -= kx * t; py -= ky * t;
    if (px * px + py * py < 0.3 * u * u) { R.m = 1; return 0.5 + lift; }
    return 0;
  };

  Frog.prototype.strokes = function (add) {
    var L = this.leg, c = this.cos, s = this.sin, x = this.x, y = this.y;
    for (var sd = -1; sd <= 1; sd += 2) {
      // голень, стопа, передняя лапа
      var seg = [1, 2, 2, 3, 4, 5];
      for (var i = 0; i < 6; i += 2) {
        var a = seg[i] * 2, b = seg[i + 1] * 2;
        var ax = L[a], ay = L[a + 1] * sd, bx = L[b], by = L[b + 1] * sd;
        add(x + ax * c - ay * s, y + ax * s + ay * c, x + bx * c - by * s, y + bx * s + by * c,
          1, i === 4 ? 0.62 : 0.56, 1, 0.9);
      }
    }
  };

  var SPECIES = GP.species.frog = {
    id: 'frog', env: ENV, drift: DRIFT, label: 'Frog', count: COUNT, palette: PALETTE,
    create: function (env, rnd, x, y) { return new Frog(env, rnd, x, y); }
  };
})(window.GP);
