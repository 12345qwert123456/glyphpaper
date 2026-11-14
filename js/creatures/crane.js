/* Crane — вид сверху: длинные крылья, шея, ноги. Медленно парит, редко машет,
 * иногда летит клином из 3–5 птиц. */
(function (GP) {
  'use strict';

  // ------------------------------------------------------------ параметры
  var COUNT = 7;
  var PALETTE = {
    dot: '#c9ced6',
    materials: [
      { role: 'on_surface', stops: ['#565d69', '#aab2bd', '#dfe4ea', '#f2f4f6'] },      // перо
      { role: 'on_surface_variant', stops: ['#1f232c', '#3b4250', '#6b7380'] }          // тёмные кончики крыльев, клюв, ноги
    ]
  };
  var UNIT = 0.86;                      // масштаб в ячейках; размах ≈ 15 единиц
  var SIZE = [0.72, 1.18];              // размах 9–15 ячеек
  var SPEED = [26, 44];                 // px/с
  var TURN = 0.28;                      // рад/с — парит почти по прямой
  var FLAP_EVERY = [4, 10];             // сек между сериями взмахов
  var FLAP_BEATS = 2;
  var FLAP_TIME = 0.8;                  // сек на взмах
  var WEDGE = [3, 5];                   // птиц в клине
  var WEDGE_SPACING = 15;               // ячеек между птицами в клине
  var WEDGE_ANGLE = 34;                 // градусов от оси
  // ----------------------------------------------------------------------

  var U = GP.util, R = GP.Raster, Cr = GP.Creature;

  function Crane(env, rnd, x, y) {
    var k = rnd();
    Cr.init(this, SPECIES, env, rnd, { depth: k, x: x, y: y });
    this.size = U.lerp(SIZE[0], SIZE[1], k);
    this.baseSpeed = rnd.range(SPEED[0], SPEED[1]);
    this.flapT = rnd.range(1, FLAP_EVERY[1]);
    this.flapP = -1;                     // фаза серии взмахов, <0 — парит
    this.f = 0;
    this.leader = null; this.row = 0; this.side = 0;
    this.dustT = rnd();
    this.wing = new Float32Array(6);
    this.geom(env);
  }

  Crane.prototype.geom = function (env) {
    this.cell = env.cell;
    this.u = UNIT * this.size * env.cell;
    this.radius = this.u * 7.6;
  };

  Crane.prototype.update = function (dt, env) {
    if (env.cell !== this.cell) this.geom(env);
    this.t += dt;
    var speed = this.baseSpeed * this.speedMul;

    if (this.leader && this.leader.species === SPECIES && env.list.indexOf(this.leader) >= 0) {
      // место в клине позади и сбоку от ведущего
      var L = this.leader, a = WEDGE_ANGLE * Math.PI / 180;
      var back = this.row * WEDGE_SPACING * this.cell * Math.cos(a);
      var lat = this.side * this.row * WEDGE_SPACING * this.cell * Math.sin(a);
      var lc = Math.cos(L.heading), ls = Math.sin(L.heading);
      var tx = L.x - lc * back - ls * lat - this.x, ty = L.y - ls * back + lc * lat - this.y;
      // кратчайший путь с учётом выхода за край
      var pw = env.W + 2 * (this.radius + 2 * this.cell), ph = env.H + 2 * (this.radius + 2 * this.cell);
      tx -= Math.round(tx / pw) * pw; ty -= Math.round(ty / ph) * ph;
      var lsp = L.baseSpeed * L.speedMul;
      var vx0 = lc * lsp + tx * 0.5, vy0 = ls * lsp + ty * 0.5;
      this.heading = U.turnToward(this.heading, Math.atan2(vy0, vx0), 1.1 * dt);
      speed = U.clamp(Math.sqrt(vx0 * vx0 + vy0 * vy0), lsp * 0.6, lsp * 1.7);
    } else {
      this.leader = null;
      this.heading += (U.noise1(this.t * 0.13, this.seed) - 0.5) * 2 * TURN * dt;
    }

    // редкие взмахи
    if (this.flapP < 0) {
      this.flapT -= dt * (1 + 3 * this.excite);
      if (this.flapT <= 0) this.flapP = 0;
      this.f += (0 - this.f) * Math.min(1, dt * 4);
    } else {
      this.flapP += dt / FLAP_TIME;
      this.f = Math.pow(Math.sin(this.flapP * Math.PI), 2);
      if (this.flapP >= FLAP_BEATS) { this.flapP = -1; this.flapT = this.rnd.range(FLAP_EVERY[0], FLAP_EVERY[1]); }
    }

    this.cos = Math.cos(this.heading); this.sin = Math.sin(this.heading);
    Cr.move(this, dt, env, this.cos * speed, this.sin * speed);

    // крыло: плечо → локоть → кончик; при взмахе размах сжимается, кончики уходят назад
    var u = this.u, k = 1 - 0.28 * this.f;
    this.wing[0] = 0.6 * u; this.wing[1] = 0.7 * u;
    this.wing[2] = (1.5 - 0.5 * this.f) * u; this.wing[3] = 3.5 * u * k;
    this.wing[4] = (-1.1 - 1.7 * this.f) * u; this.wing[5] = 7.4 * u * k;

    this.dustT -= dt * 0.5;
    if (this.dustT <= 0 && this.asm >= 1) {
      this.dustT += 1;
      var s = this.rnd.sign(), lx = this.wing[4] - u, ly = this.wing[5] * s;
      env.dust(this.x + lx * this.cos - ly * this.sin, this.y + lx * this.sin + ly * this.cos,
        0, 0, this.rnd.range(0.8, 1.6), this.rnd.pick(['.', "'", ',']), this.rnd() < 0.5 ? 0 : 1, 0.4);
    }
  };

  Crane.prototype.bounds = function (b) {
    var r = this.radius + this.cell;
    b.x0 = this.x - r; b.y0 = this.y - r; b.x1 = this.x + r; b.y1 = this.y + r;
  };

  function capsule(px, py, ax, ay, bx, by, r0, r1) {
    // возвращает q = (d/r)² (<1 внутри); параметр вдоль сегмента кладёт в capsule.t
    var ex = bx - ax, ey = by - ay;
    var t = ((px - ax) * ex + (py - ay) * ey) / (ex * ex + ey * ey || 1);
    if (t < 0) t = 0; else if (t > 1) t = 1;
    var qx = px - ax - ex * t, qy = py - ay - ey * t;
    var rr = r0 + (r1 - r0) * t;
    capsule.t = t;
    return (qx * qx + qy * qy) / (rr * rr);
  }

  Crane.prototype.sample = function (x, y) {
    var dx = x - this.x, dy = y - this.y;
    var lx = dx * this.cos + dy * this.sin, ly = -dx * this.sin + dy * this.cos;
    var u = this.u, ay = Math.abs(ly), ex, ey, q, w = this.wing;
    R.u = lx / this.cell + 40; R.v = ay / this.cell;
    // тело
    ex = lx / (2.3 * u); ey = ly / (0.9 * u);
    q = ex * ex + ey * ey;
    if (q < 1) { R.m = 0; return 0.7 + 0.25 * (1 - q); }
    // голова
    ex = (lx - 5.3 * u) / (0.66 * u); ey = ly / (0.55 * u);
    if (ex * ex + ey * ey < 1) { R.m = 0; return 0.92; }
    // хвост
    ex = (lx + 2.4 * u) / (0.95 * u); ey = ly / (0.8 * u);
    if (ex * ex + ey * ey < 1) { R.m = 1; return 0.8; }
    if (ay > w[5] + u || lx > 3 * u || lx < -4.5 * u) return 0;
    // внутренняя часть крыла
    q = capsule(lx, ay, w[0], w[1], w[2], w[3], 1.55 * u, 1.35 * u);
    if (q < 1) { R.m = 0; return 0.56 + 0.3 * (1 - q); }
    // внешняя часть: кончики тёмные
    q = capsule(lx, ay, w[2], w[3], w[4], w[5], 1.35 * u, 0.7 * u);
    if (q < 1) {
      if (capsule.t > 0.45) { R.m = 1; return 0.5 + 0.45 * (1 - capsule.t); }
      R.m = 0; return 0.5 + 0.3 * (1 - q);
    }
    return 0;
  };

  Crane.prototype.strokes = function (add) {
    var u = this.u, c = this.cos, s = this.sin, x = this.x, y = this.y;
    function line(ax, ay, bx, by, m, lum, kind) {
      add(x + ax * c - ay * s, y + ax * s + ay * c, x + bx * c - by * s, y + bx * s + by * c, m, lum, kind, 1);
    }
    var bend = Math.sin(this.t * 0.8) * 0.2 * u;
    line(2.0 * u, 0, 3.5 * u, bend, 0, 0.8, 0);          // шея
    line(3.5 * u, bend, 4.9 * u, 0, 0, 0.84, 0);
    line(5.8 * u, 0, 6.9 * u, 0, 1, 0.95, 1);            // клюв
    line(-2.8 * u, 0.28 * u, -5.9 * u, 0.22 * u, 1, 0.8, 1);   // ноги
    line(-2.8 * u, -0.28 * u, -5.9 * u, -0.22 * u, 1, 0.8, 1);
  };

  var SPECIES = GP.species.crane = {
    id: 'crane', label: 'Crane', count: COUNT, palette: PALETTE,
    hueJitter: 0.3, flicker: 0.16, separation: 0.45,
    create: function (env, rnd, x, y) { return new Crane(env, rnd, x, y); },
    /** Часть птиц собирается в клин. */
    arrange: function (born, env, rnd) {
      // клин из 3–5 птиц, остальные летят поодиночке
      if (born.length < WEDGE[0] + 1) return;
      var n = Math.min(born.length - 2, WEDGE[0] + Math.floor(rnd() * (WEDGE[1] - WEDGE[0] + 1)));
      if (n < WEDGE[0]) n = WEDGE[0];
      var lead = born[0], a = WEDGE_ANGLE * Math.PI / 180;
      for (var i = 1; i < n; i++) {
        var c = born[i];
        c.leader = lead; c.row = Math.ceil(i / 2); c.side = i % 2 ? 1 : -1;
        c.heading = lead.heading;
        var back = c.row * WEDGE_SPACING * env.cell * Math.cos(a), lat = c.side * c.row * WEDGE_SPACING * env.cell * Math.sin(a);
        c.x = lead.x - Math.cos(lead.heading) * back - Math.sin(lead.heading) * lat;
        c.y = lead.y - Math.sin(lead.heading) * back + Math.cos(lead.heading) * lat;
        c.update(0, env);
      }
    }
  };
})(window.GP);
