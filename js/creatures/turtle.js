/* Turtle — вид сверху: панцирь из шестиугольных щитков, голова, четыре ласты, хвост.
 * Плывёт медленно, гребёт ластами по диагонали (передняя левая + задняя правая). */
(function (GP) {
  'use strict';

  // ------------------------------------------------------------ параметры
  var COUNT = 7;
  var ENV = 'pond';          // среда вида (см. js/ambient.js)
  var DRIFT = 0.2;           // насколько течение сносит существо
  var PALETTE = {
    dot: '#7ea03a',
    materials: [
      { role: 'secondary', toward: [115, 0.55], stops: ['#24381a', '#4a6a24', '#7ea03a', '#c4d884'] }, // панцирь
      { role: 'secondary', toward: [95, 0.35], stops: ['#2e3f2a', '#587a4a', '#9cc08a'] },              // кожа
      { role: 'secondary', stops: ['#1d4258', '#3f86a6', '#a6d8ea'] }   // среда: пруд
    ]
  };
  var UNIT = 1.0;            // масштаб тела в ячейках
  var SIZE = [0.75, 1.3];
  var SPEED = [10, 26];      // px/с
  var PADDLE_HZ = [0.5, 0.85];
  var TURN = 0.35;           // рад/с — размах блуждания
  var SCUTE = 1.15;          // размер щитка, единиц тела
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

  function Turtle(env, rnd, x, y) {
    var k = rnd();
    Cr.init(this, SPECIES, env, rnd, { depth: k, x: x, y: y });
    this.size = U.lerp(SIZE[0], SIZE[1], k);
    this.baseSpeed = rnd.range(SPEED[0], SPEED[1]);
    this.hz = rnd.range(PADDLE_HZ[0], PADDLE_HZ[1]);
    this.phase = rnd() * U.TAU;
    this.fl = new Float32Array(16);       // ласты: корень x, y, конец x, y
    this.rippleT = rnd.range(2, 5);
    this.geom(env);
    this.cos = Math.cos(this.heading); this.sin = Math.sin(this.heading);
    this.flippers();
  }

  Turtle.prototype.geom = function (env) {
    this.cell = env.cell;
    this.u = UNIT * this.size * env.cell;
    this.radius = this.u * 5.2;
  };

  /** Ласты гребут по диагонали: передняя левая в паре с задней правой. */
  Turtle.prototype.flippers = function () {
    var u = this.u, ph = this.phase;
    for (var i = 0; i < 4; i++) {
      var front = i < 2, s = i & 1 ? 1 : -1;
      var swing = Math.sin(ph + ((i === 0 || i === 3) ? 0 : Math.PI));
      var ang = front ? s * (1.05 + 0.5 * swing) : s * (2.35 - 0.3 * swing);
      var len = (front ? 2.7 : 1.8) * u * (1 - 0.1 * swing);
      var rx = (front ? 1.7 : -1.9) * u, ry = s * (front ? 1.9 : 1.5) * u;
      var o = i * 4;
      this.fl[o] = rx; this.fl[o + 1] = ry;
      this.fl[o + 2] = rx + Math.cos(ang) * len; this.fl[o + 3] = ry + Math.sin(ang) * len;
    }
  };

  Turtle.prototype.update = function (dt, env) {
    if (env.cell !== this.cell) this.geom(env);
    this.t += dt;
    var free = !this.held && !this.thrown;
    if (free) this.heading += (U.noise1(this.t * 0.2, this.seed) - 0.5) * 2 * TURN * dt;
    this.phase += dt * U.TAU * this.hz * (free ? 1 : 2.6);          // в руке и в полёте барахтается
    var stroke = 0.5 + 0.5 * Math.sin(this.phase * 2);               // толчок на каждый гребок
    var v = this.baseSpeed * this.speedMul * (0.45 + 0.9 * stroke);
    this.cos = Math.cos(this.heading); this.sin = Math.sin(this.heading);
    Cr.move(this, dt, env, this.cos * v, this.sin * v);
    this.cos = Math.cos(this.heading); this.sin = Math.sin(this.heading);
    this.flippers();

    this.rippleT -= dt;
    if (this.rippleT <= 0 && this.asm >= 1) {
      this.rippleT = this.rnd.range(2.5, 5.5);
      env.dust(this.x - this.cos * this.u * 3.6, this.y - this.sin * this.u * 3.6, 0, 0,
        this.rnd.range(0.7, 1.3), this.rnd.pick(['.', 'o', ':']), 1, 0.5);
      GP.Ambient.ripple(this.x - this.cos * this.u * 3.2, this.y - this.sin * this.u * 3.2, 3);
    }
  };

  Turtle.prototype.bounds = function (b) {
    var r = this.radius;
    b.x0 = this.x - r; b.y0 = this.y - r; b.x1 = this.x + r; b.y1 = this.y + r;
  };

  Turtle.prototype.sample = function (x, y) {
    var dx = x - this.x, dy = y - this.y;
    var lx = dx * this.cos + dy * this.sin, ly = -dx * this.sin + dy * this.cos;
    var u = this.u, q, i, o, hit;
    R.u = lx / this.cell + 50; R.v = ly / this.cell + 50;

    // голова с глазами
    var hx = lx - 3.5 * u;
    if (hx * hx + ly * ly < 0.72 * u * u) {
      var ex = lx - 3.85 * u, ey = Math.abs(ly) - 0.42 * u;
      R.m = 1; return ex * ex + ey * ey < 0.05 * u * u ? 0.08 : 0.9;
    }
    // панцирь, чуть заострён спереди
    var a = 3.0 * u, b = 2.5 * u * (1 - 0.12 * lx / a);
    q = (lx * lx) / (a * a) + (ly * ly) / (b * b);
    if (q < 1) {
      // шестиугольные щитки: сетка со сдвигом чётных рядов
      var sy = ly / (SCUTE * u), sx = lx / (SCUTE * u);
      var row = Math.floor(sy), off = (row & 1) ? 0.5 : 0;
      var col = Math.floor(sx + off), fx = sx + off - col, fy = sy - row;
      var edge = Math.min(fx, 1 - fx, fy, 1 - fy);
      R.m = 0;
      if (edge < 0.1 || q > 0.8) return 0.26 + 0.1 * (q > 0.8 ? 1 : 0);      // швы и кромка темнее
      return 0.5 + 0.3 * U.hash(col, row, this.seed) + 0.2 * (1 - q);
    }
    // шея
    if (lx > 2.3 * u && lx < 3.2 * u && Math.abs(ly) < 0.62 * u) { R.m = 1; return 0.8; }
    // ласты
    for (i = 0; i < 4; i++) {
      o = i * 4;
      q = cap(lx, ly, this.fl[o], this.fl[o + 1], this.fl[o + 2], this.fl[o + 3], 0.7 * u, 0.38 * u);
      if (q < 1) { R.m = 1; R.u = cap.t * 3 + i * 7; R.v = 0; return 0.78 - 0.2 * cap.t; }
    }
    // хвост
    q = cap(lx, ly, -2.9 * u, 0, -3.9 * u, 0, 0.36 * u, 0.05 * u);
    if (q < 1) { R.m = 1; return 0.55; }
    return 0;
  };

  var SPECIES = GP.species.turtle = {
    id: 'turtle', env: ENV, drift: DRIFT, label: 'Turtle', count: COUNT, palette: PALETTE,
    hueJitter: 0.6, flicker: 0.18,
    create: function (env, rnd, x, y) { return new Turtle(env, rnd, x, y); }
  };
})(window.GP);
